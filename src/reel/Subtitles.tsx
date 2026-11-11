import React, { useMemo } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts } from "../brand";
import { Word } from "./data";

type Line = { words: Word[]; start: number; end: number };

/** Group words into short, whole-phrase subtitle lines (max 7 words, break at punctuation or pauses). */
export function buildLines(words: Word[]): Line[] {
  const lines: Line[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) lines.push({ words: cur, start: cur[0].startMs / 1000, end: cur[cur.length - 1].endMs / 1000 });
    cur = [];
  };
  words.forEach((w, i) => {
    const next = words[i + 1];
    cur.push(w);
    const pause = next ? next.startMs - w.endMs > 450 : true;
    if (/[.?!,:;]$/.test(w.text) || pause || cur.length >= 7) flush();
  });
  flush();
  // Hold each line until the next one starts, so the text never blinks off mid-thought.
  lines.forEach((l, i) => {
    const next = lines[i + 1];
    l.end = next ? Math.min(next.start, l.end + 0.8) : l.end + 0.6;
  });
  return lines;
}

const isNumber = (s: string) => /\d/.test(s) || /^(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)$/i.test(s.replace(/[^\p{L}]/gu, ""));

export const Subtitles: React.FC<{ words: Word[]; keywords: string[]; y: number; mode: "window" | "full" }> = ({ words, keywords, y, mode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const lines = useMemo(() => buildLines(words), [words]);
  const line = lines.find((l) => t >= l.start - 0.05 && t < l.end);
  if (!line) return null;
  const opacity = interpolate(t, [line.start - 0.05, line.start + 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Mark keyword phrases (multi-word) so they render as one maroon highlight.
  const texts = line.words.map((w) => w.text);
  const lower = texts.map((s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
  const marked = new Array(texts.length).fill(false);
  for (const k of keywords) {
    const parts = k.toLowerCase().split(/\s+/);
    for (let i = 0; i + parts.length <= lower.length; i++) {
      if (parts.every((p, j) => lower[i + j] === p)) for (let j = 0; j < parts.length; j++) marked[i + j] = true;
    }
  }

  const spans: React.ReactNode[] = [];
  let i = 0;
  while (i < texts.length) {
    if (marked[i]) {
      const group: string[] = [];
      while (i < texts.length && marked[i]) group.push(texts[i++]);
      spans.push(
        <span key={i} style={{ background: colors.maroon, color: colors.cream, padding: "2px 14px", borderRadius: 10, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
          {group.join(" ")}
        </span>,
        " ",
      );
    } else {
      const w = texts[i++];
      spans.push(
        <span key={i} style={{ color: isNumber(w) ? colors.gold : colors.cream }}>
          {w}
        </span>,
        " ",
      );
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        top: y,
        textAlign: "center",
        fontFamily: fonts.sans,
        fontWeight: 800,
        fontSize: mode === "window" ? 48 : 56,
        lineHeight: 1.35,
        opacity,
        // Over footage (full mode) a soft dark halo keeps cream text readable on light walls.
        textShadow: mode === "full" ? `0 3px 0 ${colors.ink}, 0 0 22px rgba(20,16,18,0.85)` : "none",
      }}
    >
      {spans}
    </div>
  );
};
