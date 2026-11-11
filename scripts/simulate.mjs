#!/usr/bin/env node
/**
 * Pre-compute the coin flock for a reel, frame by frame.
 *
 * Usage:
 *   node scripts/simulate.mjs <tracking.json> <choreo.json> <out_dir> [--transcript words.json]
 *
 * The flock is a boids system (separation, alignment, a pull toward a per-mode
 * target) that also reacts to the tracked hands: coins swirl away from palms and
 * get carried by hand motion. Remotion renders frames in parallel, so the
 * simulation runs here once and the composition only reads positions back.
 *
 * Writes:
 *   sim.bin   Float32 [frame][coin][STRIDE]: x, y, z, rotX, rotY, rotZ, scale, red
 *             x/y in output pixels (1080x1920), z in pixels toward the camera
 *   sim.json  metadata: per-frame body anchor, cluster centroids, glow, mode,
 *             resolved cues and impact events
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveTime } from "./lib/cues.mjs";

export const STRIDE = 8;
const OUT_W = 1080;
const OUT_H = 1920;
const N = 190;

const args = process.argv.slice(2);
const tIdx = args.indexOf("--transcript");
const transcript = tIdx >= 0 ? JSON.parse(readFileSync(args.splice(tIdx, 2)[1], "utf8")) : null;
const [trackPath, choreoPath, outDir] = args;
if (!outDir) {
  console.error("Usage: node scripts/simulate.mjs <tracking.json> <choreo.json> <out_dir> [--transcript words.json]");
  process.exit(1);
}

const track = JSON.parse(readFileSync(trackPath, "utf8"));
const choreo = JSON.parse(readFileSync(choreoPath, "utf8"));
const fps = choreo.fps ?? 30;
const srcFps = track.fps;
const duration = choreo.duration ?? track.frames.length / srcFps;
const F = Math.round(duration * fps);

// Footage is fit to cover the 1080x1920 output, centred.
const cover = Math.max(OUT_W / track.width, OUT_H / track.height);
const offX = (OUT_W - track.width * cover) / 2;
const offY = (OUT_H - track.height * cover) / 2;
const toOut = ([nx, ny]) => [offX + nx * track.width * cover, offY + ny * track.height * cover];

// ---------- cues ----------
const at = (c) => resolveTime(c, transcript);
const modes = choreo.modes
  .map((m) => ({ ...m, t: at(m.at) }))
  .sort((a, b) => a.t - b.t);
const events = (choreo.events ?? []).map((e) => ({ ...e, t: at(e.at) })).sort((a, b) => a.t - b.t);
const modeAt = (t) => {
  let cur = null;
  for (const m of modes) if (m.t <= t) cur = m;
  return cur;
};

// ---------- deterministic randomness ----------
let seed = 1234567;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const coins = Array.from({ length: N }, (_, i) => ({
  i,
  phase: rand() * Math.PI * 2,
  u: rand() * 2 - 1,
  speed: 0.7 + rand() * 0.6,
  dir: rand() < 0.5 ? -1 : 1,
  size: 0.8 + rand() * 0.35,
  spin: 0.6 + rand() * 1.4,
  r1: rand(),
  r2: rand(),
  p: [0, 0, 0],
  v: [0, 0, 0],
  rot: [rand() * 6.28, rand() * 6.28, rand() * 6.28],
  born: Infinity,
  scale: 0,
  red: 0,
}));

// ---------- tracking, resampled to output fps and smoothed ----------
const srcFrame = (f) => Math.min(track.frames.length - 1, Math.round((f / fps) * srcFps));
const palmOf = (pts) => {
  const ids = [0, 5, 9, 17];
  const x = ids.reduce((s, k) => s + pts[k][0], 0) / ids.length;
  const y = ids.reduce((s, k) => s + pts[k][1], 0) / ids.length;
  return toOut([x, y]);
};

const body = []; // { cx, cy, sw }
const hands = []; // [{ x, y, vx, vy, conf }] screen-left first
{
  let last = { cx: OUT_W / 2, cy: OUT_H * 0.55, sw: 380, fx: OUT_W / 2, fy: OUT_H * 0.4 };
  let lastHands = [];
  const missing = [0, 0];
  for (let f = 0; f < F; f++) {
    const fr = track.frames[srcFrame(f)];
    let b = last;
    if (fr.pose) {
      const [lx, ly] = toOut(fr.pose.lShoulder);
      const [rx, ry] = toOut(fr.pose.rShoulder);
      const [nx, ny] = toOut(fr.pose.nose);
      const raw = { cx: (lx + rx) / 2, cy: (ly + ry) / 2, sw: Math.hypot(lx - rx, ly - ry), fx: nx, fy: ny };
      const a = 0.25;
      b = Object.fromEntries(Object.keys(raw).map((k) => [k, last[k] + (raw[k] - last[k]) * a]));
    }
    // Cap the size unit so the shield and rings stay on screen in tight framings.
    body.push({ ...b, sw: Math.min(b.sw, 330) });
    last = b;

    const found = fr.hands.map(palmOf);
    const next = [];
    for (let h = 0; h < 2; h++) {
      // Match by screen side: a lone hand belongs to whichever side it is on.
      let pick = null;
      if (found.length === 2) pick = found[h];
      else if (found.length === 1) {
        const side = found[0][0] < b.cx ? 0 : 1;
        if (side === h) pick = found[0];
      }
      const prev = lastHands[h];
      if (pick) {
        missing[h] = 0;
        const a = 0.55;
        const x = prev ? prev.x + (pick[0] - prev.x) * a : pick[0];
        const y = prev ? prev.y + (pick[1] - prev.y) * a : pick[1];
        next.push({ x, y, vx: prev ? (x - prev.x) * fps : 0, vy: prev ? (y - prev.y) * fps : 0, conf: 1 });
      } else if (prev && missing[h] < 8) {
        missing[h]++;
        next.push({ ...prev, vx: prev.vx * 0.6, vy: prev.vy * 0.6, conf: prev.conf * 0.7 });
      } else next.push(null);
    }
    hands.push(next);
    lastHands = next;
  }
}

const highestHand = (f) => {
  const hs = hands[f].filter(Boolean);
  if (!hs.length) return { x: body[f].cx, y: body[f].cy + body[f].sw * 0.5 };
  return hs.reduce((a, b) => (b.y < a.y ? b : a));
};
const pickHand = (f, which) => {
  if (which === "screenLeft" && hands[f][0]) return hands[f][0];
  if (which === "screenRight" && hands[f][1]) return hands[f][1];
  return highestHand(f);
};
const handsMid = (f) => {
  const hs = hands[f].filter(Boolean);
  if (!hs.length) return { x: body[f].cx, y: body[f].cy + body[f].sw * 0.6 };
  return { x: hs.reduce((s, h) => s + h.x, 0) / hs.length, y: hs.reduce((s, h) => s + h.y, 0) / hs.length };
};

// ---------- targets per mode ----------
const SPLIT = [
  { dx: 1.45, dy: -1.25 }, // 0 Saham (upper right)
  { dx: -1.45, dy: -1.25 }, // 1 Obligasi (upper left)
  { dx: -1.55, dy: 0.55 }, // 2 Emas (mid left)
  { dx: 1.55, dy: 0.55 }, // 3 Pasar Uang (mid right)
];
const clampX = (x) => Math.min(OUT_W - 90, Math.max(90, x));

function shieldTarget(c, t, b, omega = 1.1, spread = 1) {
  const cx = b.cx;
  const cy = b.cy + b.sw * 0.45;
  const u = Math.max(-0.97, Math.min(0.97, c.u + 0.15 * Math.sin(t * 0.7 + c.phase)));
  const th = c.phase + omega * t * c.speed * c.dir;
  const ring = Math.sqrt(1 - u * u);
  return [
    cx + b.sw * 1.25 * spread * ring * Math.cos(th),
    cy + b.sw * 1.85 * spread * u,
    b.sw * 1.0 * spread * ring * Math.sin(th),
  ];
}

/** Push a target that lands on the face (in front of the head) out to the face zone's edge. */
function clearFace(p, b) {
  const R = b.sw * 0.9;
  const dx = p[0] - b.fx;
  const dy = p[1] - b.fy;
  const d = Math.hypot(dx, dy);
  if (d >= R || p[2] < -b.sw * 0.2) return p;
  if (d < 1) return [b.fx + R, p[1], p[2]];
  return [b.fx + (dx / d) * R, b.fy + (dy / d) * R, p[2]];
}

function target(c, f, t, m) {
  const tg = targetRaw(c, f, t, m);
  if (!tg || !m || m.mode === "pool" || m.mode === "pull") return tg;
  return { ...tg, p: clearFace(tg.p, body[f]) };
}

function targetRaw(c, f, t, m) {
  const b = body[f];
  if (!m || m.mode === "idle") return null;
  const local = t - m.t;
  switch (m.mode) {
    case "emerge":
    case "shield":
    case "calm":
    case "glow":
      return { p: shieldTarget(c, t, b, m.mode === "calm" ? 0.6 : 1.1), k: 7 };
    case "deflect": {
      const p = shieldTarget(c, t, b);
      if (c.i % 3 === 0 && local < (m.lure ?? 1.2)) {
        // A third of the flock drifts toward the falling chart before being pushed back.
        const lx = clampX(b.cx + b.sw * 1.9);
        const ly = b.cy - b.sw * 0.2;
        const s = Math.min(1, local / 0.8) * 0.6;
        return { p: [p[0] + (lx - p[0]) * s, p[1] + (ly - p[1]) * s, p[2] * (1 - s)], k: 6 };
      }
      return { p, k: 7 };
    }
    case "rings": {
      const k = c.i % 9;
      const reveal = m.t + k * (m.stagger ?? 0.22);
      if (t < reveal) return { p: shieldTarget(c, t, b), k: 7 };
      const j = Math.floor(c.i / 9);
      const per = Math.ceil(N / 9);
      const th = (j / per) * Math.PI * 2 + (k % 2 ? -1 : 1) * 1.4 * (t - reveal);
      const y = b.cy + b.sw * (1.55 - k * 0.36);
      return { p: [b.cx + b.sw * 1.2 * Math.cos(th), y, b.sw * 0.75 * Math.sin(th)], k: 16 };
    }
    case "pool": {
      const mid = handsMid(f);
      const r = Math.sqrt(c.r1) * b.sw * 0.6 + 12;
      const th = c.phase + t * (2.2 / (r / b.sw + 0.35));
      return { p: [mid.x + r * Math.cos(th), mid.y - b.sw * 0.28 + 10 * Math.sin(t * 3 + c.phase), r * 0.45 * Math.sin(th)], k: 14, flat: true };
    }
    case "pull": {
      const h = pickHand(f, m.hand ?? "auto");
      const j = b.sw * 0.12;
      return { p: [h.x + j * (c.r1 - 0.5), h.y - b.sw * 0.1 + j * (c.r2 - 0.5), b.sw * 0.5], k: 40 };
    }
    case "split":
    case "fall": {
      const g = c.i % 4;
      const s = SPLIT[g];
      // choreo.stocksSide puts the Saham group on the side of the hand that drops.
      const flip = choreo.stocksSide === "screenLeft" ? -1 : 1;
      const k = m.mode === "fall" && g === 0 ? Math.min(1, local / 1.6) ** 2 : 0;
      // Saham falls past the group below it, drifting toward the frame edge.
      const cx = clampX(b.cx + flip * (s.dx + 0.45 * k) * b.sw);
      const cy = b.cy + s.dy * b.sw + k * b.sw * 3.4;
      const rr = b.sw * 0.36;
      const th = c.phase + t * 1.8 * c.dir;
      return { p: [cx + rr * Math.sqrt(1 - c.u * c.u) * Math.cos(th), cy + rr * c.u * 0.8, rr * Math.sin(th)], k: 10 };
    }
    default:
      return { p: shieldTarget(c, t, b), k: 7 };
  }
}

// ---------- simulate ----------
const buf = new Float32Array(F * N * STRIDE);
const meta = { fps, frames: F, count: N, stride: STRIDE, width: OUT_W, height: OUT_H, body: [], centroids: [], glow: [], mode: [], hands: [], events: [], cues: modes.map(({ mode, t }) => ({ mode, t })) };

const SUB = 3;
const dt = 1 / (fps * SUB);
const emergeMode = modes.find((m) => m.mode === "emerge");
const firstVisible = modes.find((m) => m.mode !== "idle");
const resolvedEvents = events.map((e) => ({ ...e, done: false }));

for (let f = 0; f < F; f++) {
  for (let s = 0; s < SUB; s++) {
    const t = (f + s / SUB) / fps;
    const m = modeAt(t);
    const b = body[f];

    // Births: coins appear from a palm during "emerge", or all at once otherwise.
    for (const c of coins) {
      if (c.born !== Infinity || !m || m.mode === "idle") continue;
      const start = emergeMode ? emergeMode.t + (c.i / N) * (emergeMode.spread ?? 1.4) : firstVisible.t;
      if (t >= start) {
        c.born = t;
        if (emergeMode && m.mode === "emerge") {
          const h = pickHand(f, emergeMode.hand ?? "auto");
          c.p = [h.x + (c.r1 - 0.5) * 30, h.y - 20 + (c.r2 - 0.5) * 30, b.sw * 0.5];
          const a = -Math.PI / 2 + (c.r1 - 0.5) * 1.6;
          const sp = 900 + c.r2 * 900;
          c.v = [Math.cos(a) * sp, Math.sin(a) * sp, (c.u) * 500];
        } else {
          c.p = shieldTarget(c, t, b, 1.1, 1.6);
        }
      }
    }

    // Impact events push coins away from the hit point.
    for (const e of resolvedEvents) {
      if (e.done || t < e.t) continue;
      e.done = true;
      const side = e.side === "left" ? -1 : 1;
      const point = [b.cx + side * b.sw * 1.25, b.cy + b.sw * (e.dy ?? 0), b.sw * 0.3];
      meta.events.push({ type: e.type, label: e.label, icon: e.icon, t: e.t, side, point });
      for (const c of coins) {
        if (c.born === Infinity) continue;
        const d = [c.p[0] - point[0], c.p[1] - point[1], c.p[2] - point[2]];
        const dist = Math.hypot(...d) + 1;
        if (dist < b.sw * 1.1) {
          const k = (1 - dist / (b.sw * 1.1)) * 1800;
          for (let a = 0; a < 3; a++) c.v[a] += (d[a] / dist) * k;
        }
      }
    }

    // Neighbour forces (separation + alignment), O(N^2) over live coins.
    const live = coins.filter((c) => c.born !== Infinity);
    const acc = live.map(() => [0, 0, 0]);
    const sepR = 70;
    const aliR = 150;
    for (let a = 0; a < live.length; a++) {
      const A = live[a];
      let avx = 0, avy = 0, avz = 0, n = 0;
      for (let q = 0; q < live.length; q++) {
        if (q === a) continue;
        const B = live[q];
        const dx = A.p[0] - B.p[0], dy = A.p[1] - B.p[1], dz = A.p[2] - B.p[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < sepR * sepR && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const k = ((sepR - d) / sepR) * 2200;
          acc[a][0] += (dx / d) * k; acc[a][1] += (dy / d) * k; acc[a][2] += (dz / d) * k;
        }
        if (d2 < aliR * aliR) { avx += B.v[0]; avy += B.v[1]; avz += B.v[2]; n++; }
      }
      if (n) {
        acc[a][0] += (avx / n - A.v[0]) * 0.8;
        acc[a][1] += (avy / n - A.v[1]) * 0.8;
        acc[a][2] += (avz / n - A.v[2]) * 0.8;
      }
    }

    const hs = hands[f].filter(Boolean);
    live.forEach((c, a) => {
      const tg = target(c, f, t, m);
      const ac = acc[a];
      if (tg) {
        for (let k = 0; k < 3; k++) ac[k] += (tg.p[k] - c.p[k]) * tg.k;
      }
      // Hands: radial repulsion around the palm plus a push along the hand's motion.
      for (const h of hs) {
        const hz = b.sw * 0.45;
        const dx = c.p[0] - h.x, dy = c.p[1] - h.y, dz = c.p[2] - hz;
        const d = Math.hypot(dx, dy, dz) + 1;
        const R = b.sw * 0.55;
        if (d < R) {
          const fall = (1 - d / R) ** 2;
          const k = 9000 * fall * h.conf;
          ac[0] += (dx / d) * k; ac[1] += (dy / d) * k; ac[2] += (dz / d) * k;
          ac[0] += h.vx * 6 * fall; ac[1] += h.vy * 6 * fall;
        }
      }
      // Keep the face clear: coins in front of the head slide around it, never across it.
      {
        const dx = c.p[0] - b.fx, dy = c.p[1] - b.fy;
        const d = Math.hypot(dx, dy) + 1;
        const R = b.sw * 0.85;
        if (d < R && c.p[2] > -b.sw * 0.2) {
          const k = 22000 * (1 - d / R) ** 1.3;
          ac[0] += (dx / d) * k;
          ac[1] += (dy / d) * k;
        }
      }
      // Gentle turbulence so the flock never looks rigid.
      ac[0] += 260 * Math.sin(t * 1.3 + c.i * 0.37);
      ac[1] += 260 * Math.cos(t * 1.7 + c.i * 0.53);
      ac[2] += 200 * Math.sin(t * 1.1 + c.i * 0.71);

      const drag = tg ? Math.exp(-dt * (2.2 + Math.sqrt(tg.k))) : Math.exp(-dt * 1.5);
      for (let k = 0; k < 3; k++) c.v[k] = (c.v[k] + ac[k] * dt) * drag;
      const sp = Math.hypot(...c.v);
      const max = 2600;
      if (sp > max) for (let k = 0; k < 3; k++) c.v[k] *= max / sp;
      for (let k = 0; k < 3; k++) c.p[k] += c.v[k] * dt;

      // Spin faster when moving fast; settle tilted inside the pool.
      const w = (1.2 + sp / 350) * c.spin * c.dir;
      if (tg?.flat) {
        c.rot[0] = ((c.rot[0] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (c.rot[0] > Math.PI + 1) c.rot[0] -= Math.PI * 2;
        c.rot[0] += (1.0 - c.rot[0]) * Math.min(1, dt * 8); // tilted ~57deg so faces read on camera
        c.rot[2] += (0 - c.rot[2]) * Math.min(1, dt * 8);
        c.rot[1] += w * dt;
      } else {
        c.rot[0] += w * 0.55 * dt;
        c.rot[1] += w * dt;
        c.rot[2] += w * 0.25 * dt;
      }
      c.scale = Math.min(1, (t - c.born) / 0.25) * c.size;
      const wantRed = m?.mode === "fall" && c.i % 4 === 0 ? 1 : 0;
      c.red += (wantRed - c.red) * Math.min(1, dt * 4);
    });
  }

  // Record the frame.
  const base = f * N * STRIDE;
  for (const c of coins) {
    const o = base + c.i * STRIDE;
    buf[o] = c.p[0]; buf[o + 1] = c.p[1]; buf[o + 2] = c.p[2];
    buf[o + 3] = c.rot[0]; buf[o + 4] = c.rot[1]; buf[o + 5] = c.rot[2];
    buf[o + 6] = c.born === Infinity ? 0 : c.scale;
    buf[o + 7] = c.red;
  }
  const t = f / fps;
  const m = modeAt(t);
  const b = body[f];
  meta.body.push([Math.round(b.cx), Math.round(b.cy), Math.round(b.sw)]);
  meta.mode.push(m ? m.mode : "idle");
  const cents = [0, 1, 2, 3].map((g) => {
    const grp = coins.filter((c) => c.i % 4 === g && c.born !== Infinity);
    if (!grp.length) return null;
    return [0, 1, 2].map((k) => Math.round(grp.reduce((s, c) => s + c.p[k], 0) / grp.length));
  });
  meta.centroids.push(cents);
  meta.glow.push(m?.mode === "glow" ? Math.min(1, (t - m.t) / 0.4) : 0);
  meta.hands.push(hands[f].map((h) => (h ? [Math.round(h.x), Math.round(h.y)] : null)));
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "sim.bin"), Buffer.from(buf.buffer));
writeFileSync(join(outDir, "sim.json"), JSON.stringify(meta));
console.log(`Simulated ${N} coins x ${F} frames (${(buf.byteLength / 1e6).toFixed(1)} MB) -> ${outDir}`);
