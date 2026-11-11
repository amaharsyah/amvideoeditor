"""
Assemble an edit from a raw take: keep the listed segments, tighten pauses inside
them, clean the audio, and write one constant-30fps file.

Usage:
  python3 scripts/assemble-edit.py <edit.json>

edit.json:
  {
    "source": "public/recordings/<raw>.mov",
    "audioChain": "<ffmpeg -af chain for denoise/EQ>",
    "output": "public/recordings/<name>-edit.mp4",
    "maxPause": 0.28,            # longer silences inside a segment shrink to this
    "segments": [ { "from": 26.25, "to": 32.75, "note": "hook take 2", "maxPause": 0.6 }, ... ]
  }

Writes <output> plus <output>.cuts.json: for every piece, its source range and its
start time in the edit, so later steps (zoom on cuts, subtitles) know where cuts are.
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))


def sh(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(r.stderr[-3000:])
    return r.stdout


def envelope(path, hop=0.01):
    w = wave.open(path)
    sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    n = int(sr * hop)
    k = len(x) // n
    rms = np.sqrt((x[: k * n].reshape(k, n) ** 2).mean(axis=1) + 1e-9)
    return 20 * np.log10(rms / 32768), hop


def tighten(db, hop, a, b, max_pause, pad=0.09):
    """Split [a, b] around silences longer than max_pause, keeping pad of air on each side."""
    floor = np.percentile(db, 15)
    th = floor + 7  # strict: soft syllables sit around floor+8..12 after denoise
    i0, i1 = int(a / hop), int(b / hop)
    quiet = db[i0:i1] < th
    pieces, start = [], a
    run = None
    for k, q in enumerate(quiet):
        t = (i0 + k) * hop
        if q and run is None:
            run = t
        elif not q and run is not None:
            if t - run > max_pause:
                pieces.append((start, run + pad))
                start = t - pad
            run = None
    pieces.append((start, b))
    return [(round(x, 3), round(y, 3)) for x, y in pieces if y - x > 0.12]


def main(edit_path):
    edit = json.load(open(edit_path))
    src = os.path.join(ROOT, edit["source"])
    out = os.path.join(ROOT, edit["output"])
    tmp = tempfile.mkdtemp(prefix="assemble-")

    # Clean the whole take once, then cut: the denoiser needs context, not 0.5s slivers.
    clean = os.path.join(tmp, "clean.wav")
    sh(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vn", "-ac", "1", "-ar", "48000", "-af", edit["audioChain"], clean])
    db, hop = envelope(clean)

    pieces = []
    for seg in edit["segments"]:
        for p in tighten(db, hop, seg["from"], seg["to"], seg.get("maxPause", edit.get("maxPause", 0.28))):
            pieces.append({"from": p[0], "to": p[1], "segment": seg.get("note", "")})

    # One filter graph: trim each piece from the CFR video and the clean audio, with
    # 8ms audio fades so no cut clicks.
    parts, labels = [], []
    for i, p in enumerate(pieces):
        d = p["to"] - p["from"]
        parts.append(f"[0:v]trim=start={p['from']}:end={p['to']},setpts=PTS-STARTPTS[v{i}]")
        parts.append(
            f"[1:a]atrim=start={p['from']}:end={p['to']},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d=0.008,afade=t=out:st={max(0, d - 0.008):.3f}:d=0.008[a{i}]"
        )
        labels.append(f"[v{i}][a{i}]")
    parts.append("".join(labels) + f"concat=n={len(pieces)}:v=1:a=1[v][a]")
    graph = os.path.join(tmp, "graph.txt")
    open(graph, "w").write(";\n".join(parts))

    cfr = os.path.join(tmp, "cfr.mp4")
    sh(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-an", "-vf", "fps=30", "-c:v", "libx264", "-crf", "12", "-preset", "fast", cfr])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sh([
        "ffmpeg", "-y", "-loglevel", "error", "-i", cfr, "-i", clean,
        "-filter_complex_script", graph, "-map", "[v]", "-map", "[a]",
        "-r", "30", "-c:v", "libx264", "-crf", "14", "-preset", "medium",
        "-c:a", "pcm_s16le", out,
    ])

    t = 0.0
    cuts = []
    for p in pieces:
        cuts.append({**p, "at": round(t, 3)})
        t += p["to"] - p["from"]
    json.dump({"duration": round(t, 3), "pieces": cuts}, open(out + ".cuts.json", "w"), indent=1)
    print(f"{len(edit['segments'])} segments -> {len(pieces)} pieces, {t:.1f}s -> {edit['output']}")


if __name__ == "__main__":
    main(sys.argv[1])
