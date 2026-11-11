import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { colors } from "../brand";
import { makeCoinFace } from "./coinTexture";
import { CAM_D, FOV, ReelData } from "./data";

/** Coin radius in output pixels at the subject plane. */
const COIN_R = 27;
/** Motion trail: copies of each coin a fraction of a frame back in time. */
const TRAIL = [0.33, 0.66, 1.0];
const TRAIL_OPACITY = [0.32, 0.18, 0.08];
const CANDLES = 40;

type Layer = "back" | "front";

const Environment: React.FC = () => {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
};

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const WHITE = new THREE.Color("#ffffff");
const LOSS = new THREE.Color("#ff5a5a");

/** Read one coin at a fractional frame, interpolating between stored frames. */
function sample(sim: Float32Array, count: number, stride: number, frames: number, f: number, i: number, out: number[]) {
  const f0 = Math.max(0, Math.min(frames - 1, Math.floor(f)));
  const f1 = Math.min(frames - 1, f0 + 1);
  const a = Math.max(0, Math.min(1, f - f0));
  const o0 = (f0 * count + i) * stride;
  const o1 = (f1 * count + i) * stride;
  for (let k = 0; k < stride; k++) out[k] = sim[o0 + k] + (sim[o1 + k] - sim[o0 + k]) * a;
  return out;
}

const Coins: React.FC<{ data: ReelData; layer: Layer }> = ({ data, layer }) => {
  const frame = useCurrentFrame();
  const { meta, sim } = data;
  const N = meta.count;
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);

  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 1, 0.12, 48, 1);
    g.rotateX(Math.PI / 2); // face the camera at rotation 0
    return g;
  }, []);
  const materials = useMemo(() => {
    const face = makeCoinFace();
    const mk = (opacity: number) => {
      const transparent = opacity < 1;
      // Edge in brand maroon: the identity motif that makes the coins ours, not stock gold.
      const edge = new THREE.MeshStandardMaterial({ color: colors.maroon, metalness: 0.7, roughness: 0.35, transparent, opacity, depthWrite: !transparent });
      const faceMat = new THREE.MeshStandardMaterial({ map: face, metalness: 0.95, roughness: 0.28, emissive: new THREE.Color(colors.gold), emissiveIntensity: 0, transparent, opacity, depthWrite: !transparent });
      return [edge, faceMat, faceMat];
    };
    return [mk(1), ...TRAIL_OPACITY.map(mk)];
  }, []);

  useLayoutEffect(() => {
    const tmp: number[] = new Array(meta.stride).fill(0);
    const glow = meta.glow[Math.min(frame, meta.frames - 1)] ?? 0;
    const offsets = [0, ...TRAIL];
    offsets.forEach((back, m) => {
      const mesh = meshes.current[m];
      if (!mesh) return;
      (materials[m][1] as THREE.MeshStandardMaterial).emissiveIntensity = glow * 0.35;
      for (let i = 0; i < N; i++) {
        const [x, y, z, rx, ry, rz, s, red] = sample(sim, N, meta.stride, meta.frames, frame - back, i, tmp);
        const inLayer = layer === "front" ? z >= 0 : z < 0;
        // Trails only show for fast coins, otherwise they just thicken a resting coin.
        let scale = inLayer ? s * COIN_R : 0;
        if (back > 0 && scale > 0) {
          const [px, py] = sample(sim, N, meta.stride, meta.frames, frame - back + 0.33, i, new Array(meta.stride).fill(0));
          if (Math.hypot(px - x, py - y) < 6) scale = 0;
        }
        dummy.position.set(x - 540, 960 - y, z);
        dummy.rotation.set(rx, ry, rz);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tint.copy(WHITE).lerp(LOSS, red);
        mesh.setColorAt(i, tint);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [frame, N, layer, materials, meta, sim]);

  return (
    <>
      {materials.map((mats, m) => (
        <instancedMesh
          key={m}
          ref={(el) => {
            meshes.current[m] = el;
          }}
          args={[geometry, mats, N]}
          frustumCulled={false}
          renderOrder={m === 0 ? 0 : 1}
        />
      ))}
    </>
  );
};

/** Red candlesticks raining down during the hook; they slow when the speaker calms down. */
const Candles: React.FC<{ from: number; slowAt: number; to: number; layer: Layer }> = ({ from, slowAt, to, layer }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const wickRef = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: CANDLES }, (_, i) => {
        const r = (n: number) => {
          const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
          return x - Math.floor(x);
        };
        return { x: 60 + r(1) * 960, z: (r(2) - 0.5) * 900, h: 80 + r(3) * 170, speed: 520 + r(4) * 520, y0: -200 - r(5) * 1900, spin: (r(6) - 0.5) * 1.2, tilt: (r(7) - 0.5) * 0.6 };
      }),
    [],
  );
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#C8343F", metalness: 0.2, roughness: 0.45, emissive: new THREE.Color("#5a0d14"), emissiveIntensity: 0.6 }), []);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useLayoutEffect(() => {
    const t = frame / fps;
    // Time warp: full speed until "tenang", then the fall eases to a drift.
    const warp = (tt: number) => {
      if (tt < slowAt) return tt - from;
      const k = 0.18;
      return slowAt - from + (tt - slowAt) * k + (1 - k) * 0.6 * (1 - Math.exp(-(tt - slowAt) / 0.6));
    };
    const local = warp(t);
    const fade = Math.max(0, Math.min(1, (to - t) / 0.5)) * Math.min(1, (t - from) / 0.2);
    seeds.forEach((s, i) => {
      const inLayer = layer === "front" ? s.z >= 0 : s.z < 0;
      const y = s.y0 + s.speed * local;
      const visible = t >= from && t <= to && inLayer ? fade : 0;
      dummy.position.set(s.x - 540, 960 - y, s.z);
      dummy.rotation.set(s.tilt, s.spin * local, s.tilt * 0.5 + s.spin * local * 0.3);
      dummy.scale.set(38 * visible, s.h * visible, 38 * visible);
      dummy.updateMatrix();
      bodyRef.current?.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(7 * visible, (s.h + 90) * visible, 7 * visible);
      dummy.updateMatrix();
      wickRef.current?.setMatrixAt(i, dummy.matrix);
    });
    if (bodyRef.current) bodyRef.current.instanceMatrix.needsUpdate = true;
    if (wickRef.current) wickRef.current.instanceMatrix.needsUpdate = true;
  }, [frame, fps, from, slowAt, to, layer, seeds]);

  return (
    <>
      <instancedMesh ref={bodyRef} args={[box, material, CANDLES]} frustumCulled={false} />
      <instancedMesh ref={wickRef} args={[box, material, CANDLES]} frustumCulled={false} />
    </>
  );
};

export const CoinLayer: React.FC<{
  data: ReelData;
  layer: Layer;
  candles?: { from: number; slowAt: number; to: number };
}> = ({ data, layer, candles }) => {
  return (
    <ThreeCanvas
      width={1080}
      height={1920}
      style={{ position: "absolute", inset: 0 }}
      camera={{ fov: FOV, position: [0, 0, CAM_D], near: 10, far: 10000 }}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
    >
      <Environment />
      {/* Warm key from the upper left to sit with indoor daylight footage. */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[-600, 900, 1200]} intensity={2.2} color="#fff1dc" />
      <directionalLight position={[700, -300, 600]} intensity={0.6} color={colors.maroonLight} />
      <Coins data={data} layer={layer} />
      {candles ? <Candles {...candles} layer={layer} /> : null}
    </ThreeCanvas>
  );
};
