import * as THREE from "three";
import { fonts } from "../brand";

/**
 * Coin maps generated at load time, so the coin needs no external asset.
 * The look comes from physically based shading: a brass base colour, a height
 * map turned into a normal map (raised rim, raised "Rp", fine reeding on the
 * edge), and a roughness map with wear, all lit by the real room.
 */

const SIZE = 512;

function heightCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext("2d")!;
  const r = SIZE / 2;
  g.fillStyle = "#000";
  g.fillRect(0, 0, SIZE, SIZE);
  // Field: very slightly domed.
  const dome = g.createRadialGradient(r, r, 0, r, r, r * 0.86);
  dome.addColorStop(0, "#3a3a3a");
  dome.addColorStop(1, "#262626");
  g.fillStyle = dome;
  g.beginPath();
  g.arc(r, r, r * 0.86, 0, Math.PI * 2);
  g.fill();
  // Raised rim.
  g.strokeStyle = "#cfcfcf";
  g.lineWidth = r * 0.12;
  g.beginPath();
  g.arc(r, r, r * 0.9, 0, Math.PI * 2);
  g.stroke();
  // Beaded ring inside the rim, a detail real coins carry.
  g.fillStyle = "#8a8a8a";
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    g.beginPath();
    g.arc(r + Math.cos(a) * r * 0.76, r + Math.sin(a) * r * 0.76, r * 0.018, 0, Math.PI * 2);
    g.fill();
  }
  // Raised denomination mark.
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#e6e6e6";
  g.font = `900 ${SIZE * 0.3}px ${fonts.sans}`;
  g.fillText("Rp", r, r + SIZE * 0.015);
  // Soften so the relief has bevels instead of cliffs.
  const soft = document.createElement("canvas");
  soft.width = SIZE;
  soft.height = SIZE;
  const sg = soft.getContext("2d")!;
  sg.filter = "blur(2.2px)";
  sg.drawImage(c, 0, 0);
  return soft;
}

function normalFromHeight(h: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const w = h.width;
  const src = h.getContext("2d")!.getImageData(0, 0, w, w).data;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = w;
  const og = out.getContext("2d")!;
  const img = og.createImageData(w, w);
  const at = (x: number, y: number) => src[(Math.min(w - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      img.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Deterministic hash noise so every render worker draws identical wear. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function roughnessMap(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext("2d")!;
  // Base: fairly polished. Raised areas are rubbed brighter (smoother) by handling.
  g.fillStyle = "rgb(95,95,95)";
  g.fillRect(0, 0, SIZE, SIZE);
  const rand = rng(7);
  g.strokeStyle = "rgba(170,170,170,0.35)";
  g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const a = rand() * Math.PI;
    const l = 8 + rand() * 40;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  for (let i = 0; i < 3000; i++) {
    const v = 70 + rand() * 80;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.fillRect(rand() * SIZE, rand() * SIZE, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function colorMap(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext("2d")!;
  const r = SIZE / 2;
  // Brass, a touch darker in the recessed field where tarnish collects.
  g.fillStyle = "#E0B04C";
  g.fillRect(0, 0, SIZE, SIZE);
  const tarnish = g.createRadialGradient(r, r, r * 0.2, r, r, r * 0.84);
  tarnish.addColorStop(0, "rgba(120,80,20,0.10)");
  tarnish.addColorStop(1, "rgba(120,80,20,0.22)");
  g.fillStyle = tarnish;
  g.beginPath();
  g.arc(r, r, r * 0.84, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function reedingNormal(): THREE.CanvasTexture {
  const w = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = 8;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, 8);
  for (let x = 0; x < w; x++) {
    // 64 ridges around the edge: a sine profile's slope gives the normal's x.
    const s = Math.cos((x / w) * Math.PI * 2 * 64) * 0.7;
    const len = Math.hypot(s, 1);
    for (let y = 0; y < 8; y++) {
      const o = (y * w + x) * 4;
      img.data[o] = ((s / len) * 0.5 + 0.5) * 255;
      img.data[o + 1] = 128;
      img.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

export type CoinMaps = {
  color: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
  reeding: THREE.Texture;
};

export function makeCoinMaps(): CoinMaps {
  return { color: colorMap(), normal: normalFromHeight(heightCanvas(), 6), roughness: roughnessMap(), reeding: reedingNormal() };
}
