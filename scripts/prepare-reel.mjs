#!/usr/bin/env node
/**
 * Turn a raw recording into everything the CoinReel composition needs.
 *
 * Usage:
 *   node scripts/prepare-reel.mjs <recording.mp4> <reel-id> [--lang id] [--from step] [--clean-plate plate.mp4]
 *
 * Steps (each writes into public/reels/<reel-id>/):
 *   footage    1080x1920 @ 30fps, cover-cropped, audio loudness-normalised -> footage.mp4
 *   transcribe word timestamps with whisper.cpp                           -> words.json
 *   track      hands, pose and person matte with MediaPipe                -> work/tracking.json, work/matte.mp4
 *   person     footage + matte as a transparent VP9 video                  -> person.webm
 *   simulate   coin flock from choreo.json                                 -> sim.bin, sim.json
 *
 * --from skips earlier steps (e.g. --from simulate after editing choreo.json).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STEPS = ["footage", "transcribe", "track", "person", "simulate"];

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv.splice(i, 2)[1] : def;
};
const lang = opt("lang", "id");
const from = opt("from", "footage");
const [input, reel] = argv;
if (!input || !reel || !STEPS.includes(from)) {
  console.error("Usage: node scripts/prepare-reel.mjs <recording.mp4> <reel-id> [--lang id] [--from " + STEPS.join("|") + "]");
  process.exit(1);
}

const dir = join(root, "public", "reels", reel);
const work = join(dir, "work");
mkdirSync(work, { recursive: true });
const run = (cmd, args) => {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const doStep = (s) => STEPS.indexOf(s) >= STEPS.indexOf(from);
const footage = join(dir, "footage.mp4");

if (doStep("footage")) {
  run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", resolve(input),
    "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p",
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
    "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    footage,
  ]);
}
if (doStep("transcribe")) run("node", [join(root, "scripts", "transcribe.mjs"), footage, join(dir, "words.json"), "--lang", lang]);
if (doStep("track")) run("python3", [join(root, "scripts", "track.py"), footage, work]);
if (doStep("person")) {
  run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", footage, "-i", join(work, "matte.mp4"),
    "-filter_complex", "[1:v]format=gray[m];[0:v][m]alphamerge,format=yuva420p",
    "-an", "-c:v", "libvpx-vp9", "-b:v", "6M", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-auto-alt-ref", "0",
    join(dir, "person.webm"),
  ]);
}
if (doStep("simulate")) {
  const choreo = join(dir, "choreo.json");
  if (!existsSync(choreo)) {
    console.error(`No ${choreo} yet. Write the choreography, then run again with --from simulate.`);
    process.exit(1);
  }
  run("node", [join(root, "scripts", "simulate.mjs"), join(work, "tracking.json"), choreo, dir, "--transcript", join(dir, "words.json")]);
}
console.log(`Ready: public/reels/${reel}`);
