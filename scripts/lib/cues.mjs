/**
 * Resolve a cue to seconds.
 *
 * A cue is either a number of seconds, or an object that anchors to the spoken
 * words in a whisper transcript ([{ text, startMs, endMs }]):
 *   { "phrase": "siapin ini dulu", "edge": "start" | "end", "offset": 0.2 }
 * Matching ignores case and punctuation and picks the first occurrence after
 * "after" seconds (default 0).
 */
const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");

export function resolveTime(cue, words) {
  if (typeof cue === "number") return cue;
  if (!cue || typeof cue.phrase !== "string") throw new Error(`Bad cue: ${JSON.stringify(cue)}`);
  if (!words) throw new Error(`Cue "${cue.phrase}" needs --transcript`);
  const want = cue.phrase.split(/\s+/).map(norm).filter(Boolean);
  const said = words.map((w) => norm(w.text));
  const after = (cue.after ?? 0) * 1000;
  for (let i = 0; i + want.length <= said.length; i++) {
    if (words[i].startMs < after) continue;
    if (want.every((w, k) => said[i + k] === w)) {
      const ms = cue.edge === "end" ? words[i + want.length - 1].endMs : words[i].startMs;
      return ms / 1000 + (cue.offset ?? 0);
    }
  }
  throw new Error(`Phrase not found in transcript: "${cue.phrase}"`);
}
