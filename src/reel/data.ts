import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

export type Word = { text: string; startMs: number; endMs: number };

export type Cue = number | { phrase: string; edge?: "start" | "end"; offset?: number; after?: number };

export type HitEvent = {
  type: "hit";
  label: string;
  icon: "briefcase" | "cross" | "wrench";
  t: number;
  side: number;
  point: [number, number, number];
};

export type SimMeta = {
  fps: number;
  frames: number;
  count: number;
  stride: number;
  width: number;
  height: number;
  body: [number, number, number][];
  centroids: ([number, number, number] | null)[][];
  glow: number[];
  mode: string[];
  hands: ([number, number] | null)[][];
  events: HitEvent[];
  cues: { mode: string; t: number }[];
};

export type Choreo = {
  fps?: number;
  duration?: number;
  framing: { at: Cue; mode: "full" | "window" }[];
  candles?: { from: Cue; slowAt: Cue; to: Cue };
  keywords?: string[];
  sfx?: { at: Cue; file: string; volume?: number }[];
  disclaimer?: { from: Cue; text: string };
  hook?: { text: string; to: Cue };
};

export type ReelData = {
  sim: Float32Array;
  meta: SimMeta;
  words: Word[];
  choreo: Choreo;
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");

/** Same rules as scripts/lib/cues.mjs, so cues resolve identically in both places. */
export function resolveTime(cue: Cue, words: Word[]): number {
  if (typeof cue === "number") return cue;
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

export async function loadReel(reel: string): Promise<ReelData> {
  const base = `reels/${reel}`;
  const [simBuf, meta, words, choreo] = await Promise.all([
    fetch(staticFile(`${base}/sim.bin`)).then((r) => r.arrayBuffer()),
    fetch(staticFile(`${base}/sim.json`)).then((r) => r.json()),
    fetch(staticFile(`${base}/words.json`)).then((r) => (r.ok ? r.json() : [])),
    fetch(staticFile(`${base}/choreo.json`)).then((r) => r.json()),
  ]);
  return { sim: new Float32Array(simBuf), meta, words, choreo };
}

export function useReel(reel: string): ReelData | null {
  const [data, setData] = useState<ReelData | null>(null);
  const [handle] = useState(() => delayRender(`Loading reel ${reel}`));
  useEffect(() => {
    loadReel(reel)
      .then((d) => {
        setData(d);
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [reel, handle]);
  return data;
}

/** Camera distance used by every 3D layer and by the 2D projection helper. */
export const CAM_D = 2400;
export const FOV = (2 * Math.atan(960 / CAM_D) * 180) / Math.PI;

/** Project a point in output-pixel space (z toward camera) to the 1080x1920 screen. */
export function project(x: number, y: number, z: number): [number, number, number] {
  const s = CAM_D / (CAM_D - z);
  return [540 + (x - 540) * s, 960 + (y - 960) * s, s];
}
