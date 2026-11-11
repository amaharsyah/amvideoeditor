import React, { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig, Audio } from "remotion";
import { colors, fonts } from "../brand";
import { CoinLayer } from "./CoinLayer";
import { ReelData, resolveTime, useReel } from "./data";
import { StageOverlays } from "./Overlays";
import { Grain } from "./Grain";
import { Subtitles } from "./Subtitles";

/** debug: "noblur" renders without the motion-blur pass, "noenv" without the room reflections. */
export type CoinReelProps = { reel: string; debug?: string };

/** Height of the cinematic window (the "letterboxed" middle state), in output pixels. */
const WINDOW_H = 1080;

const Stage: React.FC<{ data: ReelData; reel: string; debug?: string }> = ({ data, reel, debug }) => {
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
  // Shoulders sit at cy; the head is roughly one shoulder-width above them and the hands
  // work in front of the chest, so this centre keeps hair and hands inside the window.
  const winCenter = Math.max(WINDOW_H / 2, Math.min(1920 - WINDOW_H / 2, cy - sw * 0.15));
  const top = (winCenter - WINDOW_H / 2) * w;
  const bottom = (1920 - (winCenter + WINDOW_H / 2)) * w;
  // Hook punch-in that settles as the window opens.
  const firstWindow = keys.find((k) => k.mode === "window")?.t ?? 0;
  const hookZoom = interpolate(t, [0, Math.max(0.5, firstWindow)], [1.1, 1.0], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  // Jump cuts: alternate the framing at every cut so the join reads as a deliberate
  // punch-in. A new take (segment) changes size clearly; a tightened pause inside
  // a take only nudges it.
  const cutZoom = useMemo(() => {
    const pieces = data.cuts?.pieces ?? [];
    const out: { at: number; zoom: number }[] = [];
    let seg = -1;
    let inSeg = 0;
    pieces.forEach((p, i) => {
      if (i === 0 || p.segment !== pieces[i - 1].segment) {
        seg++;
        inSeg = 0;
      } else inSeg++;
      out.push({ at: p.at, zoom: (seg % 2 ? 1.09 : 1.0) + (inSeg % 2 ? 0.035 : 0) });
    });
    return out;
  }, [data.cuts]);
  let cz = 1;
  for (const c of cutZoom) if (t >= c.at) cz = c.zoom;
  const zoom = hookZoom * cz;
  // In window mode, slide the whole stage so the window sits a little above centre.
  const shiftY = (960 - 120 - winCenter) * w;

  const candles = choreo.candles ? { from: at(choreo.candles.from), slowAt: at(choreo.candles.slowAt), to: at(choreo.candles.to) } : undefined;
  const clip = `inset(${top}px 0px ${bottom}px 0px)`;
  // The stage is translated then scaled about (cx, oy); place subtitles under the window
  // where it actually lands on screen after that transform.
  const oy = cy - sw * 0.35;
  const winBottomOnScreen = oy + shiftY + (winCenter + WINDOW_H / 2 - oy) * zoom;
  const subY = w > 0.5 ? Math.min(1920 - 330, winBottomOnScreen + 44) : 1420;
  const disclaimerFrom = choreo.disclaimer ? at(choreo.disclaimer.from) : Infinity;

  return (
    <AbsoluteFill style={{ background: colors.ink }}>
      <AbsoluteFill style={{ transform: `translateY(${shiftY}px) scale(${zoom})`, transformOrigin: `${cx}px ${oy}px` }}>
        <AbsoluteFill style={{ clipPath: clip }}>
          <OffthreadVideo src={staticFile(`reels/${reel}/footage.mp4`)} />
          <CoinLayer data={data} layer="back" candles={candles} reel={reel} debug={debug} />
          <OffthreadVideo src={staticFile(`reels/${reel}/person.webm`)} transparent muted />
        </AbsoluteFill>
        {/* Front coins may break out of the window's top edge, which sells the depth,
            but stop at its bottom edge so they never cross the subtitles. */}
        <AbsoluteFill style={{ clipPath: `inset(${Math.max(0, top - 260 * w)}px 0px ${bottom}px 0px)` }}>
          <CoinLayer data={data} layer="front" candles={candles} reel={reel} debug={debug} />
        </AbsoluteFill>
        <StageOverlays data={data} />
      </AbsoluteFill>

      {/* One grain over footage and CG alike, so both read as the same camera. */}
      <Grain />

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

export const CoinReel: React.FC<CoinReelProps> = ({ reel, debug }) => {
  const data = useReel(reel);
  if (!data) return null;
  return <Stage data={data} reel={reel} debug={debug} />;
};
