#!/usr/bin/env node
/**
 * Transcribe an mp4 to word-level timestamps with whisper.cpp.
 *
 * Usage:
 *   node scripts/transcribe.mjs <input.mp4> [output.json]
 *
 * Output (default: <input>.json next to the video) is an array of
 *   { text: string, startMs: number, endMs: number }
 * one entry per word, in order.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const whisperDir = join(root, "bin", "whisper.cpp");
const whisperBin = join(whisperDir, "build", "bin", "whisper-cli");
const model = process.env.WHISPER_MODEL ?? join(whisperDir, "models", "ggml-base.en.bin");

const [input, outputArg] = process.argv.slice(2);
if (!input) {
  console.error("Usage: node scripts/transcribe.mjs <input.mp4> [output.json]");
  process.exit(1);
}
const inputPath = resolve(input);
const outputPath = resolve(
  outputArg ?? join(dirname(inputPath), basename(inputPath, extname(inputPath)) + ".json"),
);

for (const [label, p] of [["Input", inputPath], ["whisper-cli", whisperBin], ["Model", model]]) {
  if (!existsSync(p)) {
    console.error(`${label} not found: ${p}`);
    process.exit(1);
  }
}

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error(`${cmd} exited with code ${r.status}`);
  }
};

const work = mkdtempSync(join(tmpdir(), "transcribe-"));
try {
  // whisper.cpp wants 16 kHz mono 16-bit PCM WAV.
  const wav = join(work, "audio.wav");
  run("ffmpeg", ["-y", "-i", inputPath, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);

  // -ml 1 + -sow: one segment per word; -oj: JSON with millisecond offsets.
  const outBase = join(work, "whisper");
  run(whisperBin, ["-m", model, "-f", wav, "-ml", "1", "-sow", "-oj", "-of", outBase, "-np"]);

  const { transcription = [] } = JSON.parse(readFileSync(outBase + ".json", "utf8"));
  const words = transcription
    .map((seg) => ({
      text: seg.text.trim(),
      startMs: seg.offsets.from,
      endMs: seg.offsets.to,
    }))
    .filter((w) => w.text.length > 0 && !/^\[.*\]$/.test(w.text)); // drop [BLANK_AUDIO] etc.

  writeFileSync(outputPath, JSON.stringify(words, null, 2) + "\n");
  console.log(`Wrote ${words.length} words to ${outputPath}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
