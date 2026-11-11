#!/usr/bin/env node
/**
 * Mix a reel's final audio without rendering frames: the footage's voice plus the
 * choreo's sound effects at their cue times and volumes (same cues and gains the
 * CoinReel composition uses).
 *
 * Usage: node scripts/mix-audio.mjs <reel-id> <out.wav>
 * (runs a measuring pass, then re-mixes with the gain that lands on -14 LUFS)
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTime } from "./lib/cues.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [reel, out] = process.argv.slice(2);
const dir = join(root, "public", "reels", reel);
const choreo = JSON.parse(readFileSync(join(dir, "choreo.json"), "utf8"));
const words = JSON.parse(readFileSync(join(dir, "words.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(dir, "sim.json"), "utf8"));
const duration = meta.frames / meta.fps;

const inputs = ["-i", join(dir, "footage.mp4")];

// Two-pass: measure the mix, then apply the exact gain to reach -14 LUFS, with a
// limiter holding true peaks under -1.5 dBFS (Instagram and TikTok targets).
const TARGET = -14;
const gainArg = process.argv[4];
const loudness = gainArg ? `volume=${gainArg}dB,alimiter=limit=0.84:level=false` : "anull";
const chains = ["[0:a]aresample=48000,aformat=channel_layouts=stereo[v0]"];
const labels = ["[v0]"];
(choreo.sfx ?? []).forEach((s, i) => {
  const t = resolveTime(s.at, words);
  if (t < 0 || t >= duration) return;
  inputs.push("-i", join(root, "public", "sound pack", s.file));
  const ms = Math.round(t * 1000);
  chains.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${s.volume ?? 0.35},adelay=${ms}|${ms}[s${i}]`);
  labels.push(`[s${i}]`);
});
// normalize=0 keeps each source at its own gain, as the composition plays them.
const graph = chains.join(";") + `;${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=first,atrim=0:${duration.toFixed(3)},${loudness}[out]`;
const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_s16le", resolve(out)], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
if (!gainArg) {
  const m = spawnSync("ffmpeg", ["-hide_banner", "-i", resolve(out), "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
  const integrated = Number([...m.stderr.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)].pop()[1]);
  const gain = (TARGET - integrated).toFixed(2);
  console.log(`measured ${integrated} LUFS, applying ${gain} dB`);
  const again = spawnSync("node", [fileURLToPath(import.meta.url), reel, out, gain], { stdio: "inherit" });
  process.exit(again.status ?? 1);
}
