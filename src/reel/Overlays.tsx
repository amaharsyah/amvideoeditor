import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts } from "../brand";
import { HitEvent, project, ReelData } from "./data";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * Glyphs for the three emergencies named in the script. Each is the object the
 * word refers to (briefcase for losing a job, medical cross, wrench for repairs),
 * drawn as solid shapes so they read at small size over moving footage.
 */
const Glyph: React.FC<{ icon: HitEvent["icon"] }> = ({ icon }) => {
  const fill = colors.cream;
  if (icon === "cross")
    return (
      <svg viewBox="0 0 48 48" width={56} height={56} aria-hidden>
        <path d="M18 6h12v12h12v12H30v12H18V30H6V18h12z" fill={fill} />
      </svg>
    );
  if (icon === "wrench")
    return (
      <svg viewBox="0 0 48 48" width={56} height={56} aria-hidden>
        <path d="M33 4a11 11 0 0 0-10.4 14.6L5.5 35.7a4 4 0 0 0 5.7 5.7l17.1-17.1A11 11 0 0 0 43.1 14l-6.6 6.6-6.4-1.7-1.7-6.4L35 5.9A11 11 0 0 0 33 4z" fill={fill} />
      </svg>
    );
  return (
    <svg viewBox="0 0 48 48" width={56} height={56} aria-hidden>
      <path d="M17 8h14a3 3 0 0 1 3 3v4h7a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V18a3 3 0 0 1 3-3h7v-4a3 3 0 0 1 3-3zm1 7h12v-3H18z" fill={fill} />
    </svg>
  );
};

const Tag: React.FC<{ children: React.ReactNode; tone?: "gold" | "loss" | "cream"; size?: number }> = ({ children, tone = "cream", size = 34 }) => (
  <div
    style={{
      fontFamily: fonts.sans,
      fontWeight: 800,
      fontSize: size,
      color: tone === "gold" ? colors.gold : tone === "loss" ? "#FF7A7A" : colors.cream,
      background: "rgba(20,16,18,0.78)",
      padding: "8px 18px",
      borderRadius: 12,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);

/** Emergency tokens fly in, strike the coin shield, and bounce away. */
const Hits: React.FC<{ events: HitEvent[] }> = ({ events }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <>
      {events.map((e, i) => {
        const local = t - e.t;
        if (local < -0.7 || local > 0.9) return null;
        const [px, py] = project(...e.point);
        const startX = e.side > 0 ? 1180 : -100;
        let x: number;
        let y: number;
        let rot: number;
        let opacity: number;
        if (local < 0) {
          const k = interpolate(local, [-0.7, 0], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
          x = startX + (px - startX) * k;
          y = py - 140 * (1 - k);
          rot = e.side * 25 * (1 - k);
          opacity = 1;
        } else {
          const k = interpolate(local, [0, 0.9], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
          x = px + e.side * 260 * k;
          y = py - 120 * k + 520 * k * k;
          rot = e.side * 140 * k;
          opacity = 1 - k;
        }
        const ring = local >= 0 ? interpolate(local, [0, 0.45], [0, 1], clamp) : 0;
        return (
          <React.Fragment key={i}>
            {local >= 0 && local < 0.45 ? (
              <div
                style={{
                  position: "absolute",
                  left: px - 120 * ring,
                  top: py - 120 * ring,
                  width: 240 * ring,
                  height: 240 * ring,
                  borderRadius: "50%",
                  border: `6px solid ${colors.gold}`,
                  opacity: 1 - ring,
                }}
              />
            ) : null}
            <div
              style={{
                position: "absolute",
                left: x - 75,
                top: y - 75,
                width: 150,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                opacity,
                transform: `rotate(${rot}deg)`,
              }}
            >
              <div style={{ width: 96, height: 96, borderRadius: 22, background: colors.maroonDeep, border: `3px solid ${colors.maroonLight}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Glyph icon={e.icon} />
              </div>
              <Tag size={30}>{e.label}</Tag>
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

/** Count 1 to 9 in step with the nine coin rings. */
const MonthCounter: React.FC<{ data: ReelData; start: number; end: number }> = ({ data, start, end }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < start || t > end) return null;
  const n = Math.min(9, 1 + Math.floor((t - start) / 0.22));
  const [cx, cy, sw] = data.meta.body[Math.min(frame, data.meta.frames - 1)];
  const opacity = interpolate(t, [start, start + 0.2, end - 0.3, end], [0, 1, 1, 0], clamp);
  const x = Math.max(60, cx - sw * 1.25 - 330);
  return (
    <div style={{ position: "absolute", left: x, top: cy - 120, opacity, fontFamily: fonts.sans, color: colors.cream, textAlign: "left" }}>
      <div style={{ fontWeight: 900, fontSize: 190, lineHeight: 1, color: colors.gold, textShadow: "0 6px 0 rgba(20,16,18,0.6)" }}>{n}</div>
      <Tag size={36}>bulan biaya hidup</Tag>
    </div>
  );
};

/** A falling line, no numbers: it stands for "stocks are down", not for any real index value. */
const DownChart: React.FC<{ data: ReelData; start: number; end: number }> = ({ data, start, end }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < start - 0.1 || t > end) return null;
  const [cx, cy, sw] = data.meta.body[Math.min(frame, data.meta.frames - 1)];
  const draw = interpolate(t, [start, start + 0.9], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const opacity = interpolate(t, [start, start + 0.2, end - 0.4, end], [0, 1, 1, 0], clamp);
  const pts = [0, 30, 18, 52, 40, 78, 66, 110, 96, 140];
  const path = pts.map((y, i) => `${i === 0 ? "M" : "L"}${i * 30} ${y}`).join(" ");
  // 300px wide; keep a 60px margin on the right so the tag and line stay on screen.
  const left = Math.min(1080 - 300 - 60, cx + sw * 1.3);
  return (
    <div style={{ position: "absolute", left, top: cy - sw * 0.9, opacity, width: 300 }}>
      <Tag tone="loss" size={32}>Saham ▼</Tag>
      <svg width={300} height={170} viewBox="-10 -10 290 170" style={{ marginTop: 10 }} aria-hidden>
        <path d={path} fill="none" stroke="#FF5A5A" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      </svg>
    </div>
  );
};

const PoolTag: React.FC<{ data: ReelData; start: number; end: number }> = ({ data, start, end }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < start || t > end) return null;
  const f = Math.min(frame, data.meta.frames - 1);
  const hs = data.meta.hands[f].filter(Boolean) as [number, number][];
  const [cx, cy, sw] = data.meta.body[f];
  const mx = hs.length ? hs.reduce((s, h) => s + h[0], 0) / hs.length : cx;
  const my = hs.length ? hs.reduce((s, h) => s + h[1], 0) / hs.length : cy + sw * 0.6;
  const opacity = interpolate(t, [start, start + 0.25, end - 0.3, end], [0, 1, 1, 0], clamp);
  return (
    // Full-width row, nudged toward the hands but never past the 330px half-width of the longest line.
    <div style={{ position: "absolute", left: 0, right: 0, top: my - sw * 1.05 - 120, transform: `translateX(${Math.max(-200, Math.min(200, mx - 540))}px)`, opacity, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <Tag tone="gold" size={40}>Reksa dana pasar uang</Tag>
      <Tag size={28}>risiko rendah, cair 1 sampai 2 hari kerja</Tag>
    </div>
  );
};

const GROUPS = ["Saham", "Obligasi", "Emas", "Pasar uang"];

const SplitLabels: React.FC<{ data: ReelData; start: number; fallAt: number; end: number }> = ({ data, start, fallAt, end }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < start + 0.4 || t > end) return null;
  const f = Math.min(frame, data.meta.frames - 1);
  const opacity = interpolate(t, [start + 0.4, start + 0.8, end - 0.4, end], [0, 1, 1, 0], clamp);
  return (
    <>
      {data.meta.centroids[f].map((c, g) => {
        if (!c) return null;
        const [x, y] = project(c[0], c[1], c[2]);
        const falling = g === 0 && t >= fallAt;
        return (
          // Keep the tag on screen even when its group sits near the frame edge.
          <div key={g} style={{ position: "absolute", left: Math.max(130, Math.min(950, x)), top: y - 150, transform: "translateX(-50%)", opacity }}>
            <Tag tone={falling ? "loss" : "cream"} size={34}>
              {GROUPS[g]}
              {falling ? " ▼" : ""}
            </Tag>
          </div>
        );
      })}
    </>
  );
};

/** Everything here lives in footage coordinates, so it follows the same framing as the video. */
export const StageOverlays: React.FC<{ data: ReelData }> = ({ data }) => {
  const cues = data.meta.cues;
  const startOf = (mode: string) => cues.find((c) => c.mode === mode)?.t;
  const endOf = (mode: string) => {
    const i = cues.findIndex((c) => c.mode === mode);
    return i >= 0 && i + 1 < cues.length ? cues[i + 1].t : data.meta.frames / data.meta.fps;
  };
  const rings = startOf("rings");
  const deflect = startOf("deflect");
  const pool = startOf("pool");
  const split = startOf("split");
  const fall = startOf("fall");
  return (
    <>
      <Hits events={data.meta.events} />
      {rings !== undefined ? <MonthCounter data={data} start={rings} end={endOf("rings")} /> : null}
      {deflect !== undefined ? <DownChart data={data} start={deflect} end={endOf("deflect") + 0.3} /> : null}
      {pool !== undefined ? <PoolTag data={data} start={pool} end={endOf("pull") ?? endOf("pool")} /> : null}
      {split !== undefined ? <SplitLabels data={data} start={split} fallAt={fall ?? Infinity} end={fall !== undefined ? endOf("fall") : endOf("split")} /> : null}
    </>
  );
};
