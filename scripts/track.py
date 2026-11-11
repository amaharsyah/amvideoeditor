"""
Track hands, upper body and a person matte in a talking-head video.

Usage:
  python3 scripts/track.py <input.mp4> <out_dir>

Writes to <out_dir>:
  tracking.json  per-frame hand landmarks (21 points each) and upper-body pose,
                 coordinates normalised 0..1 in the source frame
  matte.mp4      greyscale person matte (white = person), same size and fps as input
"""
import json
import os
import subprocess
import sys

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, "bin", "mediapipe")

# Pose landmark indices worth keeping for choreography (MediaPipe numbering).
POSE_KEEP = {"nose": 0, "lShoulder": 11, "rShoulder": 12, "lElbow": 13, "rElbow": 14,
             "lWrist": 15, "rWrist": 16, "lHip": 23, "rHip": 24}


def r(v):
    return round(float(v), 4)


def main(src, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    cap = cv2.VideoCapture(src)
    fps = cap.get(cv2.CAP_PROP_FPS)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    hands = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "hand_landmarker.task")),
        running_mode=vision.RunningMode.VIDEO, num_hands=2,
        min_hand_detection_confidence=0.4, min_tracking_confidence=0.4))
    pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "pose_landmarker.task")),
        running_mode=vision.RunningMode.VIDEO))
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "selfie_multiclass.tflite")),
        running_mode=vision.RunningMode.VIDEO, output_confidence_masks=True))

    enc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "gray",
         "-s", f"{w}x{h}", "-r", str(fps), "-i", "-", "-c:v", "libx264", "-crf", "12",
         "-pix_fmt", "yuv420p", os.path.join(out_dir, "matte.mp4")],
        stdin=subprocess.PIPE)

    frames = []
    prev_matte = None
    i = 0
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        ts = int(round(i * 1000 / fps))
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        entry = {"hands": [], "pose": None}
        hr = hands.detect_for_video(image, ts)
        for lms in hr.hand_landmarks:
            pts = [[r(p.x), r(p.y)] for p in lms]
            entry["hands"].append(pts)
        # Sort hands left-to-right in the image so index 0 is screen-left.
        entry["hands"].sort(key=lambda pts: pts[0][0])

        pr = pose.detect_for_video(image, ts)
        if pr.pose_landmarks:
            lm = pr.pose_landmarks[0]
            entry["pose"] = {k: [r(lm[j].x), r(lm[j].y), r(lm[j].z)] for k, j in POSE_KEEP.items()}
        frames.append(entry)

        sr = seg.segment_for_video(image, ts)
        # Category 0 is background; everything else (hair, body, face, clothes) is person.
        bg = sr.confidence_masks[0].numpy_view()
        matte = np.clip(1.0 - bg, 0, 1).astype(np.float32)
        matte = cv2.resize(matte, (w, h), interpolation=cv2.INTER_LINEAR)
        # Light temporal smoothing kills edge flicker without visible lag.
        if prev_matte is not None:
            matte = 0.65 * matte + 0.35 * prev_matte
        prev_matte = matte
        matte = cv2.GaussianBlur(matte, (0, 0), max(1.0, w / 720))
        enc.stdin.write((matte * 255).astype(np.uint8).tobytes())

        i += 1
        if i % 150 == 0:
            print(f"  {i} frames", flush=True)

    enc.stdin.close()
    enc.wait()
    with open(os.path.join(out_dir, "tracking.json"), "w") as f:
        json.dump({"fps": fps, "width": w, "height": h, "frames": frames}, f, separators=(",", ":"))
    found = sum(1 for e in frames if e["hands"])
    print(f"Tracked {len(frames)} frames, hands found in {found}. Wrote {out_dir}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
