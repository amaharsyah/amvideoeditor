import * as THREE from "three";
import { colors, fonts } from "../brand";

/**
 * Coin face: struck-gold look with a raised rim and an embossed "Rp".
 * Drawn on a canvas so the coin stays on brand without an external asset.
 */
export function makeCoinFace(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;

  const base = g.createRadialGradient(r * 0.75, r * 0.7, r * 0.1, r, r, r);
  base.addColorStop(0, "#FBE7A6");
  base.addColorStop(0.45, colors.gold);
  base.addColorStop(1, "#8A6318");
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);

  // Raised rim: a light and a dark ring offset to read as relief under lighting.
  g.lineWidth = 18;
  g.strokeStyle = "rgba(255,240,200,0.55)";
  g.beginPath();
  g.arc(r - 2, r - 2, r * 0.84, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "rgba(90,60,10,0.55)";
  g.beginPath();
  g.arc(r + 3, r + 3, r * 0.84, 0, Math.PI * 2);
  g.stroke();

  // Reeded edge ticks just inside the rim.
  g.strokeStyle = "rgba(110,75,15,0.45)";
  g.lineWidth = 4;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    g.beginPath();
    g.moveTo(r + Math.cos(a) * r * 0.92, r + Math.sin(a) * r * 0.92);
    g.lineTo(r + Math.cos(a) * r * 0.99, r + Math.sin(a) * r * 0.99);
    g.stroke();
  }

  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `900 ${size * 0.36}px ${fonts.sans}`;
  g.fillStyle = "rgba(95,62,8,0.75)";
  g.fillText("Rp", r + 5, r + 8);
  g.fillStyle = "rgba(255,238,190,0.9)";
  g.fillText("Rp", r - 2, r);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
