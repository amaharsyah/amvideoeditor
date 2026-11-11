import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

const W = 360;
const H = 640;

/** Fresh, deterministic film grain each frame (seeded by frame so every render worker agrees). */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.09 }) => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    const img = g.createImageData(W, H);
    let seed = (frame * 2654435761) >>> 0;
    for (let i = 0; i < W * H; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const v = 128 + ((seed >>> 24) - 128) * 0.9;
      const o = i * 4;
      img.data[o] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, [frame]);
  return (
    <AbsoluteFill style={{ mixBlendMode: "overlay", opacity, pointerEvents: "none" }}>
      <canvas ref={ref} width={W} height={H} style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};
