import { ThreeCanvas } from "@remotion/three";
import { useFrame, useThree } from "@react-three/fiber";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { makeCoinMaps } from "./coinTexture";
import { CAM_D, FOV, ReelData } from "./data";

/** Coin radius in output pixels at the subject plane. */
const COIN_R = 26;
const CANDLES = 40;
/** Motion blur: sub-frame renders averaged over a 180 degree shutter (half a frame). */
const SHUTTER = 0.5;
const SAMPLES = 6;

type Layer = "back" | "front";
type Poser = (t: number) => void;

/** Reflections come from the real room: the empty-background plate becomes the environment. */
const RoomEnvironment: React.FC<{ plate: string }> = ({ plate }) => {
  const { gl, scene } = useThree();
  const [handle] = useState(() => delayRender("Loading room environment"));
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    let env: THREE.Texture | null = null;
    new THREE.TextureLoader().load(
      plate,
      (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        env = pmrem.fromEquirectangular(tex).texture;
        scene.environment = env;
        scene.environmentIntensity = 1.15;
        tex.dispose();
        continueRender(handle);
      },
      undefined,
      (e) => cancelRender(e),
    );
    return () => {
      env?.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, plate, handle]);
  return null;
};

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const WHITE = new THREE.Color("#ffffff");
const LOSS = new THREE.Color("#ff4a4a");

function sample(sim: Float32Array, count: number, stride: number, frames: number, f: number, i: number, out: number[]) {
  const f0 = Math.max(0, Math.min(frames - 1, Math.floor(f)));
  const f1 = Math.min(frames - 1, f0 + 1);
  const a = Math.max(0, Math.min(1, f - f0));
  const o0 = (f0 * count + i) * stride;
  const o1 = (f1 * count + i) * stride;
  for (let k = 0; k < stride; k++) out[k] = sim[o0 + k] + (sim[o1 + k] - sim[o0 + k]) * a;
  return out;
}

const Coins: React.FC<{ data: ReelData; layer: Layer; register: (p: Poser) => void }> = ({ data, layer, register }) => {
  const { meta, sim } = data;
  const N = meta.count;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const maps = useMemo(() => makeCoinMaps(), []);
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 1, 0.13, 64, 1);
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  const materials = useMemo(() => {
    const brass = { metalness: 1, color: new THREE.Color("#ffffff") };
    const edge = new THREE.MeshStandardMaterial({ ...brass, map: maps.color, roughness: 0.42, normalMap: maps.reeding, normalScale: new THREE.Vector2(0.6, 0.6) });
    const face = new THREE.MeshStandardMaterial({ ...brass, map: maps.color, roughnessMap: maps.roughness, roughness: 1, normalMap: maps.normal, normalScale: new THREE.Vector2(1, 1), emissive: new THREE.Color("#E0B04C"), emissiveIntensity: 0 });
    return [edge, face, face];
  }, [maps]);

  useLayoutEffect(() => {
    const tmp: number[] = new Array(meta.stride).fill(0);
    register((t) => {
      const m = mesh.current;
      if (!m) return;
      const glow = meta.glow[Math.max(0, Math.min(meta.frames - 1, Math.round(t)))] ?? 0;
      (materials[1] as THREE.MeshStandardMaterial).emissiveIntensity = glow * 0.25;
      for (let i = 0; i < N; i++) {
        const [x, y, z, rx, ry, rz, s, red] = sample(sim, N, meta.stride, meta.frames, t, i, tmp);
        const inLayer = layer === "front" ? z >= 0 : z < 0;
        dummy.position.set(x - 540, 960 - y, z);
        dummy.rotation.set(rx, ry, rz);
        dummy.scale.setScalar(inLayer ? s * COIN_R : 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        tint.copy(WHITE).lerp(LOSS, red);
        m.setColorAt(i, tint);
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }, [N, layer, materials, meta, sim, register]);

  return <instancedMesh ref={mesh} args={[geometry, materials, N]} frustumCulled={false} castShadow />;
};

/** Red candlesticks raining down during the hook; they slow when the speaker calms down. */
const Candles: React.FC<{ from: number; slowAt: number; to: number; layer: Layer; register: (p: Poser) => void }> = ({ from, slowAt, to, layer, register }) => {
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
  const material = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#D12E3A", metalness: 0, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1, emissive: new THREE.Color("#4a0a10"), emissiveIntensity: 0.5 }), []);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useLayoutEffect(() => {
    register((frame) => {
      const t = frame / fps;
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
        const v = t >= from && t <= to && inLayer ? fade : 0;
        dummy.position.set(s.x - 540, 960 - y, s.z);
        dummy.rotation.set(s.tilt, s.spin * local, s.tilt * 0.5 + s.spin * local * 0.3);
        dummy.scale.set(38 * v, s.h * v, 38 * v);
        dummy.updateMatrix();
        bodyRef.current?.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(7 * v, (s.h + 90) * v, 7 * v);
        dummy.updateMatrix();
        wickRef.current?.setMatrixAt(i, dummy.matrix);
      });
      if (bodyRef.current) bodyRef.current.instanceMatrix.needsUpdate = true;
      if (wickRef.current) wickRef.current.instanceMatrix.needsUpdate = true;
    });
  }, [fps, from, slowAt, to, layer, seeds, register]);

  return (
    <>
      <instancedMesh ref={bodyRef} args={[box, material, CANDLES]} frustumCulled={false} castShadow />
      <instancedMesh ref={wickRef} args={[box, material, CANDLES]} frustumCulled={false} castShadow />
    </>
  );
};

/**
 * Renders the scene SAMPLES times across the shutter interval and averages the
 * results, like a real camera exposing a moving object. Accumulation happens in
 * premultiplied linear light; the final pass tone-maps and writes sRGB.
 */
const MotionBlurRenderer: React.FC<{ posers: React.MutableRefObject<Poser[]> }> = ({ posers }) => {
  const frame = useCurrentFrame();
  const { gl, scene, camera, size } = useThree();
  const res = useMemo(() => {
    const opts = { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, samples: 4 };
    const one = new THREE.WebGLRenderTarget(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio(), opts);
    const acc = new THREE.WebGLRenderTarget(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio(), { ...opts, samples: 0 });
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const addMat = new THREE.ShaderMaterial({
      uniforms: { src: { value: one.texture }, w: { value: 1 / SAMPLES } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
      fragmentShader: "uniform sampler2D src; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = texture2D(src, vUv) * w; }",
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
    });
    const outMat = new THREE.ShaderMaterial({
      uniforms: { src: { value: acc.texture } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
      fragmentShader: `
        uniform sampler2D src; varying vec2 vUv;
        vec3 aces(vec3 x){ x *= 0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0., 1.); }
        vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4))-0.055, step(0.0031308, c)); }
        void main(){
          vec4 p = texture2D(src, vUv);
          if (p.a < 0.0005) { gl_FragColor = vec4(0.); return; }
          vec3 c = toSRGB(aces(p.rgb / p.a));
          gl_FragColor = vec4(c * p.a, p.a);
        }`,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.ZeroFactor,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), addMat);
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    return { one, acc, quadCam, addMat, outMat, quad, quadScene };
  }, [gl, size.width, size.height]);

  useFrame(() => {
    const { one, acc, quadCam, addMat, outMat, quad, quadScene } = res;
    gl.autoClear = false;
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(acc);
    gl.clear(true, true, true);
    for (let s = 0; s < SAMPLES; s++) {
      const t = frame - SHUTTER * (1 - s / (SAMPLES - 1));
      posers.current.forEach((p) => p(t));
      gl.setRenderTarget(one);
      gl.clear(true, true, true);
      gl.render(scene, camera);
      quad.material = addMat;
      gl.setRenderTarget(acc);
      gl.render(quadScene, quadCam);
    }
    quad.material = outMat;
    gl.setRenderTarget(null);
    gl.clear(true, true, true);
    gl.render(quadScene, quadCam);
  }, 1);
  return null;
};

/** Invisible surfaces that only show the shadows cast on them: the body plane and the wall. */
const ShadowCatcher: React.FC<{ z: number; opacity: number }> = ({ z, opacity }) => (
  <mesh position={[0, 0, z]} receiveShadow>
    <planeGeometry args={[2400, 3600]} />
    <shadowMaterial opacity={opacity} transparent />
  </mesh>
);

const Scene: React.FC<{ data: ReelData; layer: Layer; candles?: { from: number; slowAt: number; to: number }; plate: string }> = ({ data, layer, candles, plate }) => {
  const posers = useRef<Poser[]>([]);
  const register = useMemo(() => (p: Poser) => {
    posers.current.push(p);
  }, []);
  const key = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const l = key.current;
    if (!l) return;
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = -800;
    cam.right = 800;
    cam.top = 1200;
    cam.bottom = -1200;
    cam.near = 10;
    cam.far = 6000;
    cam.updateProjectionMatrix();
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.radius = 6;
    l.shadow.bias = -0.0004;
  }, []);
  return (
    <>
      <RoomEnvironment plate={plate} />
      {/* Ceiling light slightly in front of the speaker, as in the footage; it casts the shadows. */}
      <directionalLight ref={key} position={[-250, 1600, 1500]} intensity={1.6} color="#fff6ea" castShadow />
      <ambientLight intensity={0.15} />
      <Coins data={data} layer={layer} register={register} />
      {candles ? <Candles {...candles} layer={layer} register={register} /> : null}
      {layer === "front" ? <ShadowCatcher z={-20} opacity={0.32} /> : <ShadowCatcher z={-700} opacity={0.22} />}
      <MotionBlurRenderer posers={posers} />
    </>
  );
};

export const CoinLayer: React.FC<{
  data: ReelData;
  layer: Layer;
  reel: string;
  candles?: { from: number; slowAt: number; to: number };
}> = ({ data, layer, reel, candles }) => {
  return (
    <ThreeCanvas
      width={1080}
      height={1920}
      shadows="soft"
      style={{
        position: "absolute",
        inset: 0,
        // Match the footage: CG straight out of the renderer is sharper than a phone
        // camera. Coins behind the body sit further away, so they are softer still.
        filter: layer === "back" ? "blur(1.6px)" : "blur(0.6px)",
      }}
      camera={{ fov: FOV, position: [0, 0, CAM_D], near: 10, far: 10000 }}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: true }}
    >
      <Scene data={data} layer={layer} candles={candles} plate={staticFile(`reels/${reel}/plate.jpg`)} />
    </ThreeCanvas>
  );
};
