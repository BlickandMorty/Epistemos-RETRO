'use client';

import { useEffect, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   SunsetWallpaper — Animated pixel art mountain sunset background

   Warm sunset scene with layered pixel-art mountains, animated sky
   gradient, floating particles, and ambient glow effects:
   - Multi-layer parallax mountains (3 layers, dark to silhouette)
   - Animated sky gradient (shifting warm hues over time)
   - Glowing sun disc (sinking/pulsing near horizon)
   - Floating warm dust motes / embers
   - Drifting wispy clouds catching sunset light
   - Occasional firefly sparkles
   - Canvas at 1/4 resolution upscaled with nearest-neighbor for pixel look
   - prefers-reduced-motion safe
   ═══════════════════════════════════════════════════════════════════ */

const PARTICLE_FPS = 18;
const PARTICLE_FRAME_MS = 1000 / PARTICLE_FPS;
const PIXEL_SCALE = 4;
const EMBER_COUNT = 30;
const CLOUD_COUNT = 6;
const FIREFLY_COUNT = 12;

// ── Mountain layer generator ──
interface MountainLayer {
  points: number[]; // normalized y values (0–1), one per column
  baseY: number;    // base y position (0–1 from top)
  color: string;
  parallaxSpeed: number;
}

function generateMountainLayer(
  peaks: number,
  baseY: number,
  amplitude: number,
  color: string,
  parallaxSpeed: number,
  seed: number,
): MountainLayer {
  const columns = 80; // enough columns for smooth terrain
  const points: number[] = [];

  // Seeded random for deterministic terrain
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

  // Generate peak positions
  const peakPositions: number[] = [];
  for (let i = 0; i < peaks; i++) {
    peakPositions.push((i + 0.3 + rand() * 0.4) / peaks);
  }

  for (let i = 0; i < columns; i++) {
    const x = i / (columns - 1);
    let y = baseY;

    // Add peaks via gaussian-like bumps
    for (const px of peakPositions) {
      const dist = Math.abs(x - px);
      const width = 0.08 + rand() * 0.12;
      const height = amplitude * (0.6 + rand() * 0.4);
      y -= height * Math.exp(-(dist * dist) / (2 * width * width));
    }

    // Add subtle noise
    y += (rand() - 0.5) * amplitude * 0.15;

    points.push(Math.max(0.1, Math.min(0.95, y)));
  }

  return { points, baseY, color, parallaxSpeed };
}

// ── Embers (floating warm particles) ──
interface Ember {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  life: number;
  maxLife: number;
  r: number; g: number; b: number;
  brightness: number;
}

function resetEmber(e: Ember): Ember {
  e.x = Math.random();
  e.y = 0.3 + Math.random() * 0.7; // lower half mostly
  e.size = 1 + Math.random() * 2;
  e.speedX = (Math.random() - 0.3) * 6; // slight rightward drift
  e.speedY = -(2 + Math.random() * 5); // float upward
  e.life = 0;
  e.maxLife = 4 + Math.random() * 8;
  // Warm palette: orange, amber, soft red
  const t = Math.random();
  if (t < 0.4) { e.r = 255; e.g = 180; e.b = 80; }       // amber
  else if (t < 0.7) { e.r = 255; e.g = 140; e.b = 60; }   // orange
  else { e.r = 255; e.g = 200; e.b = 120; }                // golden
  e.brightness = 0.3 + Math.random() * 0.7;
  return e;
}

function createEmbers(): Ember[] {
  return Array.from({ length: EMBER_COUNT }, () => resetEmber({} as Ember));
}

// ── Wispy sunset clouds ──
interface SunsetCloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  alpha: number;
  r: number; g: number; b: number;
}

function createSunsetClouds(): SunsetCloud[] {
  return Array.from({ length: CLOUD_COUNT }, () => {
    const t = Math.random();
    let r: number, g: number, b: number;
    if (t < 0.3) { r = 255; g = 160; b = 100; }       // warm orange
    else if (t < 0.6) { r = 255; g = 120; b = 80; }    // deep orange
    else { r = 220; g = 140; b = 160; }                 // pink
    return {
      x: Math.random(),
      y: 0.08 + Math.random() * 0.3,
      width: 30 + Math.random() * 60,
      height: 4 + Math.random() * 10,
      speed: 2 + Math.random() * 5,
      alpha: 0.08 + Math.random() * 0.12,
      r, g, b,
    };
  });
}

// ── Fireflies ──
interface Firefly {
  x: number;
  y: number;
  phase: number;
  speed: number;
  brightness: number;
  size: number;
}

function createFireflies(): Firefly[] {
  return Array.from({ length: FIREFLY_COUNT }, () => ({
    x: Math.random(),
    y: 0.5 + Math.random() * 0.45,
    phase: Math.random() * Math.PI * 2,
    speed: 1 + Math.random() * 2,
    brightness: 0.3 + Math.random() * 0.7,
    size: 1.5 + Math.random() * 2,
  }));
}

// ── Static mountain layers (generated once) ──
const MOUNTAIN_LAYERS: MountainLayer[] = [
  generateMountainLayer(3, 0.62, 0.18, 'rgba(60, 30, 50, ALPHA)', 0.55, 42),   // far: muted purple
  generateMountainLayer(4, 0.68, 0.15, 'rgba(40, 20, 35, ALPHA)', 0.75, 137),  // mid: dark plum
  generateMountainLayer(5, 0.76, 0.12, 'rgba(20, 12, 22, ALPHA)', 0.95, 293),  // near: near-black
];

// ══════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════

export function SunsetWallpaper({ blurred = false }: { blurred?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const embersRef = useRef<Ember[]>(createEmbers());
  const cloudsRef = useRef<SunsetCloud[]>(createSunsetClouds());
  const firefliesRef = useRef<Firefly[]>(createFireflies());
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(0);

  // drawFrame: pure render function — does NOT self-schedule.
  // Scheduling is handled exclusively by the wrappedDraw loop in useEffect.
  const drawFrame = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (now - lastFrameRef.current < PARTICLE_FRAME_MS) return;
    const dt = (now - lastFrameRef.current) / 1000;
    lastFrameRef.current = now;

    const mainCtx = canvas.getContext('2d', { alpha: true });
    if (!mainCtx) return;
    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return;

    // Low-res offscreen canvas
    const lw = Math.ceil(w / PIXEL_SCALE);
    const lh = Math.ceil(h / PIXEL_SCALE);
    if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas');
    const off = offscreenRef.current;
    if (off.width !== lw || off.height !== lh) { off.width = lw; off.height = lh; }

    const ctx = off.getContext('2d', { alpha: true });
    if (!ctx) { rafRef.current = requestAnimationFrame(drawFrame); return; }
    ctx.clearRect(0, 0, lw, lh);

    const s = 1 / PIXEL_SCALE;

    // ── Animated sky gradient ──
    const cyclePhase = (now % 60000) / 60000; // 60s full cycle
    const skyShift = Math.sin(cyclePhase * Math.PI * 2) * 0.1;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, lh * 0.75);
    skyGrad.addColorStop(0, `rgba(${40 + skyShift * 20}, ${10 + skyShift * 15}, ${60 + skyShift * 10}, 0.7)`);
    skyGrad.addColorStop(0.3, `rgba(${140 + skyShift * 30}, ${50 + skyShift * 20}, 40, 0.6)`);
    skyGrad.addColorStop(0.55, `rgba(255, ${140 + skyShift * 30}, 60, 0.5)`);
    skyGrad.addColorStop(0.75, `rgba(255, ${180 + skyShift * 20}, 100, 0.35)`);
    skyGrad.addColorStop(1, 'rgba(20, 12, 22, 0.1)');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, lw, lh);

    // ── Glowing sun ──
    const sunX = lw * 0.55;
    const sunY = lh * 0.42;
    const sunR = Math.min(lw, lh) * 0.07;
    const sunPulse = 0.9 + 0.1 * Math.sin(now / 2000);

    // Wide ambient glow
    const ambient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 8);
    ambient.addColorStop(0, 'rgba(255, 200, 80, 0.4)');
    ambient.addColorStop(0.2, 'rgba(255, 160, 60, 0.25)');
    ambient.addColorStop(0.5, 'rgba(255, 120, 40, 0.1)');
    ambient.addColorStop(1, 'rgba(255, 80, 20, 0)');
    ctx.fillStyle = ambient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 8 * sunPulse, 0, Math.PI * 2);
    ctx.fill();

    // Inner glow
    const inner = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.5);
    inner.addColorStop(0, 'rgba(255, 240, 180, 0.6)');
    inner.addColorStop(0.5, 'rgba(255, 180, 80, 0.3)');
    inner.addColorStop(1, 'rgba(255, 140, 50, 0)');
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 2.5 * sunPulse, 0, Math.PI * 2);
    ctx.fill();

    // Sun disc
    const disc = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
    disc.addColorStop(0, 'rgba(255, 250, 200, 0.85)');
    disc.addColorStop(0.5, 'rgba(255, 200, 100, 0.6)');
    disc.addColorStop(1, 'rgba(255, 160, 60, 0.3)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * sunPulse, 0, Math.PI * 2);
    ctx.fill();

    // ── Wispy sunset clouds ──
    for (const c of cloudsRef.current) {
      c.x += (c.speed / w) * dt;
      if (c.x > 1.2) { c.x = -0.2; c.y = 0.08 + Math.random() * 0.3; }

      const cx = c.x * lw;
      const cy = c.y * lh;
      const cw = c.width * s;
      const ch = c.height * s;

      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${c.alpha.toFixed(3)})`;
      ctx.fill();
    }

    // ── Mountain silhouettes ──
    for (const layer of MOUNTAIN_LAYERS) {
      const cols = layer.points.length;
      const colW = lw / (cols - 1);

      // Time-based parallax offset
      const parallaxOffset = (Math.sin(now * 0.00003 * layer.parallaxSpeed) * lw * 0.01);

      ctx.beginPath();
      ctx.moveTo(0, lh);

      for (let i = 0; i < cols; i++) {
        const px = i * colW + parallaxOffset;
        const py = layer.points[i]! * lh;
        if (i === 0) ctx.lineTo(px, py);
        else {
          // Smooth with quadratic bezier
          const prevX = (i - 1) * colW + parallaxOffset;
          const prevY = layer.points[i - 1]! * lh;
          const cpx = (prevX + px) / 2;
          ctx.quadraticCurveTo(prevX, prevY, cpx, (prevY + py) / 2);
        }
      }

      ctx.lineTo(lw + 10, lh);
      ctx.closePath();

      const alpha = 0.7 + 0.1 * Math.sin(now * 0.0001);
      ctx.fillStyle = layer.color.replace('ALPHA', alpha.toFixed(3));
      ctx.fill();
    }

    // ── Embers / floating warm particles ──
    for (const e of embersRef.current) {
      e.life += dt;
      if (e.life >= e.maxLife) { resetEmber(e); continue; }

      e.x += (e.speedX / w) * dt;
      e.y += (e.speedY / h) * dt;

      const lifeRatio = e.life / e.maxLife;
      let fade: number;
      if (lifeRatio < 0.15) fade = lifeRatio / 0.15;
      else if (lifeRatio > 0.75) fade = (1 - lifeRatio) / 0.25;
      else fade = 1;

      const alpha = fade * e.brightness * 0.25;
      const px = e.x * lw;
      const py = e.y * lh;

      if (px < 0 || px >= lw || py < 0 || py >= lh) { resetEmber(e); continue; }

      // Warm glow halo
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, (e.size + 2) * s), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${e.r}, ${e.g}, ${e.b}, ${(alpha * 0.3).toFixed(3)})`;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.5, e.size * s), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${e.r}, ${e.g}, ${e.b}, ${alpha.toFixed(3)})`;
      ctx.fill();
    }

    // ── Fireflies (twinkling warm sparkles in lower area) ──
    for (const f of firefliesRef.current) {
      const twinkle = 0.2 + 0.8 * ((Math.sin(now / (1000 / f.speed) + f.phase) + 1) * 0.5);
      const alpha = f.brightness * twinkle * 0.4;
      if (alpha < 0.05) continue;

      const fx = f.x * lw;
      const fy = f.y * lh;
      const sz = f.size * twinkle * s;

      // Warm glow
      ctx.beginPath();
      ctx.arc(fx, fy, Math.max(1, sz * 2), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 200, 100, ${(alpha * 0.3).toFixed(3)})`;
      ctx.fill();

      // Core sparkle
      ctx.beginPath();
      ctx.arc(fx, fy, Math.max(0.5, sz), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 240, 180, ${alpha.toFixed(3)})`;
      ctx.fill();
    }

    // ── Upscale to main canvas ──
    mainCtx.clearRect(0, 0, w, h);
    mainCtx.imageSmoothingEnabled = false;
    mainCtx.drawImage(off, 0, 0, lw, lh, 0, 0, w, h);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      sizeRef.current = { w: width, h: height };
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
    });
    ro.observe(canvas);

    let visible = true;
    const wrappedDraw = (now: number) => {
      if (!visible) return; // pause loop entirely when hidden; resumed in handleVis
      drawFrame(now);
      rafRef.current = requestAnimationFrame(wrappedDraw);
    };
    rafRef.current = requestAnimationFrame(wrappedDraw);

    const handleVis = () => {
      visible = document.visibilityState === 'visible';
      if (visible) {
        lastFrameRef.current = performance.now(); // prevent huge dt spike
        rafRef.current = requestAnimationFrame(wrappedDraw);
      }
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', handleVis);
      ro.disconnect();
    };
  }, [drawFrame]);

  // Safe: only evaluated client-side after mount; SSR always gets false
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        filter: blurred ? 'blur(18px) brightness(1.02)' : 'blur(0px)',
        transition: 'filter 0.6s ease',
        transform: blurred ? 'scale(1.06)' : 'scale(1)',
      }}
    >
      {/* Base gradient background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #1A0A20 0%, #3D1530 20%, #8B3A2A 45%, #D4762B 60%, #F5B84A 72%, #2A1525 90%, #0F0815 100%)',
          opacity: 0.6,
          animation: prefersReducedMotion.current ? undefined : 'wallpaper-drift 55s ease-in-out infinite',
          willChange: 'transform',
          transform: prefersReducedMotion.current ? 'scale(1.06)' : undefined,
        }}
      />

      {/* Animated particle overlay */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          willChange: 'transform',
        }}
      />
    </div>
  );
}
