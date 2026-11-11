import React, { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig, Audio } from "remotion";
import { colors, fonts } from "../brand";
import { CoinLayer } from "./CoinLayer";
import { ReelData, resolveTime, useReel } from "./data";
import { StageOverlays } from "./Overlays";
import { Subtitles } from "./Subtitles";

export type CoinReelProps = { reel: string };

/** Height of the cinematic window (the "letterboxed" middle state), in output pixels. */
const WINDOW_H = 1080;

const Stage: React.FC<{ data: ReelData; reel: string }> = ({ data, reel }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const { choreo, words, meta } = data;
  const at = (c: Parameters<typeof resolveTime>[0]) => resolveTime(c, words);

  // Framing keys: full frame for the hook and the outro, a cinematic window in between.
  const keys = useMemo(
    () => choreo.framing.map((k) => ({ t: resolveTime(k.at, words), mode: k.mode })).sort((a, b) => a.t - b.t),
    [choreo, words],
  );
  let w = 0; // 0 = full, 1 = window
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const target = k.mode === "window" ? 1 : 0;
    const prev = i === 0 ? target : keys[i - 1].mode === "window" ? 1 : 0;
    if (t >= k.t) w = interpolate(t, [k.t, k.t + 0.7], [prev, target], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  }

  const f = Math.min(frame, meta.frames - 1);
  const [cx, cy, sw] = meta.body[f];
  // Centre the window on the region where the coins live (head to hands).
  const winCenter = Math.max(WINDOW_H / 2, Math.min(1920 - WINDOW_H / 2, cy + sw * 0.35));
  const top = (winCenter - WINDOW_H / 2) * w;
  const bottom = (1920 - (winCenter + WINDOW_H / 2)) * w;
  // Hook punch-in that settles as the window opens.
  const firstWindow = keys.find((k) => k.mode === "window")?.t ?? 0;
  const zoom = interpolate(t, [0, Math.max(0.5, firstWindow)], [1.1, 1.0], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  // In window mode, slide the whole stage so the window sits a little above centre.
  const shiftY = (960 - 120 - winCenter) * w;

  const candles = choreo.candles ? { from: at(choreo.candles.from), slowAt: at(choreo.candles.slowAt), to: at(choreo.candles.to) } : undefined;
  const clip = `inset(${top}px 0px ${bottom}px 0px)`;
  const subY = w > 0.5 ? winCenter + WINDOW_H / 2 + shiftY + 40 : 1420;
  const disclaimerFrom = choreo.disclaimer ? at(choreo.disclaimer.from) : Infinity;

  return (
    <AbsoluteFill style={{ background: colors.ink }}>
      <AbsoluteFill style={{ transform: `translateY(${shiftY}px) scale(${zoom})`, transformOrigin: `${cx}px ${cy}px` }}>
        <AbsoluteFill style={{ clipPath: clip }}>
          <OffthreadVideo src={staticFile(`reels/${reel}/footage.mp4`)} />
          <CoinLayer data={data} layer="back" candles={candles} />
          <OffthreadVideo src={staticFile(`reels/${reel}/person.webm`)} transparent muted />
        </AbsoluteFill>
        {/* Front coins may break out of the window's top edge, which sells the depth,
            but stop at its bottom edge so they never cross the subtitles. */}
        <AbsoluteFill style={{ clipPath: `inset(${Math.max(0, top - 260 * w)}px 0px ${bottom}px 0px)` }}>
          <CoinLayer data={data} layer="front" candles={candles} />
        </AbsoluteFill>
        <StageOverlays data={data} />
      </AbsoluteFill>

      <Subtitles words={words} keywords={choreo.keywords ?? []} y={subY} mode={w > 0.5 ? "window" : "full"} />

      {choreo.hook && t < at(choreo.hook.to) ? (
        <div style={{ position: "absolute", top: 230, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: interpolate(t, [0.1, 0.35, at(choreo.hook.to) - 0.3, at(choreo.hook.to)], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <div style={{ fontFamily: fonts.sans, fontWeight: 900, fontSize: 64, color: colors.cream, background: "#B8323C", padding: "10px 28px", borderRadius: 14 }}>{choreo.hook.text}</div>
        </div>
      ) : null}

      {t >= disclaimerFrom ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 300, textAlign: "center", fontFamily: fonts.sans, fontWeight: 600, fontSize: 28, color: colors.cream, opacity: interpolate(t, [disclaimerFrom, disclaimerFrom + 0.3], [0, 0.9], { extrapolateRight: "clamp" }) }}>
          {choreo.disclaimer!.text}
        </div>
      ) : null}

      {(choreo.sfx ?? []).map((s, i) => {
        const from = Math.round(at(s.at) * fps);
        if (from >= durationInFrames || from < 0) return null;
        return (
          <Sequence key={i} from={from} layout="none">
            <Audio src={staticFile(`sound pack/${s.file}`)} volume={s.volume ?? 0.35} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const CoinReel: React.FC<CoinReelProps> = ({ reel }) => {
  const data = useReel(reel);
  if (!data) return null;
  return <Stage data={data} reel={reel} />;
};
