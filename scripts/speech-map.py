"""
Map where speech is in a (denoised) wav, and snap proposed cut points to the quietest moment nearby.

Usage:
  python3 scripts/speech-map.py <clean.wav> regions            # print speech regions
  python3 scripts/speech-map.py <clean.wav> snap t1 t2 ...      # quietest 30ms within +-0.3s of each t
"""
import sys
import wave

import numpy as np


def envelope(path, hop=0.01):
    w = wave.open(path)
    sr = w.getframerate()
    ch = w.getnchannels()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    n = int(sr * hop)
    frames = len(x) // n
    rms = np.sqrt((x[: frames * n].reshape(frames, n) ** 2).mean(axis=1) + 1e-9)
    db = 20 * np.log10(rms / 32768)
    return db, hop


def regions(db, hop, thresh=None, min_gap=0.14, min_len=0.12):
    floor = np.percentile(db, 15)
    thresh = thresh if thresh is not None else floor + 12
    on = db > thresh
    out, start = [], None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append([start * hop, i * hop])
            start = None
    if start is not None:
        out.append([start * hop, len(on) * hop])
    merged = []
    for r in out:
        if merged and r[0] - merged[-1][1] < min_gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [r for r in merged if r[1] - r[0] >= min_len], thresh


def snap(db, hop, t, radius=0.3, win=3):
    i0 = max(0, int((t - radius) / hop))
    i1 = min(len(db) - win, int((t + radius) / hop))
    best = min(range(i0, i1), key=lambda i: db[i : i + win].mean())
    return round((best + win / 2) * hop, 3)


if __name__ == "__main__":
    db, hop = envelope(sys.argv[1])
    if sys.argv[2] == "regions":
        regs, th = regions(db, hop)
        print(f"threshold {th:.1f} dB")
        for a, b in regs:
            print(f"{a:7.2f} {b:7.2f}  ({b - a:4.2f}s)")
    else:
        print(" ".join(str(snap(db, hop, float(t))) for t in sys.argv[3:]))
