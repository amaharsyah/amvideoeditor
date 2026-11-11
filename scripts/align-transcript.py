"""
Put the correct words on whisper's timings.

Whisper mishears names and jargon (IHSG, dana darurat, PHK) but its timing is usable.
This aligns a hand-corrected transcript to whisper's words by character-level matching,
so every corrected word inherits the time of the speech it lines up with.

Usage:
  python3 scripts/align-transcript.py <whisper-words.json> <transcript.txt> <out-words.json> [audio-or-video]
"""
import difflib
import json
import re
import sys


def norm(s):
    return re.sub(r"[^0-9a-z]", "", s.lower())


def speech_edges(wav_path, hop=0.01):
    """Times (ms) where speech starts and stops, from a 10ms RMS envelope."""
    import subprocess

    import numpy as np

    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", wav_path, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
        capture_output=True, check=True,
    ).stdout
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    n = int(16000 * hop)
    k = len(x) // n
    db = 20 * np.log10(np.sqrt((x[: k * n].reshape(k, n) ** 2).mean(axis=1) + 1e-9) / 32768)
    th = np.percentile(db, 15) + 9
    loud = db > th
    onsets, offsets = [], []
    for i in range(3, len(loud) - 3):
        # A real onset: quiet for 60ms before, loud for 60ms after (and the reverse for offsets).
        if not loud[i - 3 : i].any() and loud[i : i + 3].all():
            onsets.append(int(i * hop * 1000))
        if loud[i - 3 : i].all() and not loud[i : i + 3].any():
            offsets.append(int(i * hop * 1000))
    return onsets, offsets


def main(words_path, text_path, out_path, wav_path=None):
    heard = json.load(open(words_path))
    truth = open(text_path).read().split()

    # Build a character stream for each side with a back-pointer to the word index.
    def stream(tokens):
        chars, owner = [], []
        for i, t in enumerate(tokens):
            for ch in norm(t):
                chars.append(ch)
                owner.append(i)
        return "".join(chars), owner

    hs, hown = stream([w["text"] for w in heard])
    ts, town = stream(truth)
    sm = difflib.SequenceMatcher(None, ts, hs, autojunk=False)

    # For each true word, collect the heard words its characters matched.
    hits = [[] for _ in truth]
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            hits[town[a + k]].append(hown[b + k])

    out = []
    for i, word in enumerate(truth):
        if hits[i]:
            lo, hi = min(hits[i]), max(hits[i])
            out.append({"text": word, "startMs": heard[lo]["startMs"], "endMs": heard[hi]["endMs"]})
        else:
            out.append({"text": word, "startMs": None, "endMs": None})

    # Fill unmatched words by spreading them evenly between their matched neighbours.
    i = 0
    while i < len(out):
        if out[i]["startMs"] is not None:
            i += 1
            continue
        j = i
        while j < len(out) and out[j]["startMs"] is None:
            j += 1
        left = out[i - 1]["endMs"] if i > 0 else 0
        right = out[j]["startMs"] if j < len(out) else left + 400 * (j - i)
        step = (right - left) / (j - i)
        for k in range(i, j):
            out[k]["startMs"] = int(left + step * (k - i))
            out[k]["endMs"] = int(left + step * (k - i + 1))
        i = j

    # Whisper's word times are coarse (often whole tenths, sometimes a word early).
    # Where the audio shows a clear speech onset close by, start the word there.
    if wav_path:
        onsets, offsets = speech_edges(wav_path)
        for w in out:
            near = [o for o in onsets if abs(o - w["startMs"]) <= 350]
            if near:
                w["startMs"] = min(near, key=lambda o: abs(o - w["startMs"]))
        for k in range(len(out)):
            nxt = out[k + 1]["startMs"] if k + 1 < len(out) else None
            ends = [o for o in offsets if out[k]["startMs"] < o and (nxt is None or o <= nxt + 60) and abs(o - out[k]["endMs"]) <= 400]
            if ends:
                out[k]["endMs"] = min(ends, key=lambda o: abs(o - out[k]["endMs"]))

    # Keep times monotonic.
    for k in range(1, len(out)):
        out[k]["startMs"] = max(out[k]["startMs"], out[k - 1]["startMs"])
        out[k]["endMs"] = max(out[k]["endMs"], out[k]["startMs"] + 40)
    json.dump(out, open(out_path, "w"), indent=1)
    matched = sum(1 for h in hits if h)
    print(f"Aligned {len(truth)} words ({matched} matched to speech) -> {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:5])
