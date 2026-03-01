'use client';

import { useEffect, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   SunnyWallpaper — Animated pixel art sky background

   Light-mode counterpart to ThematicWallpaper (cosmic mode).
   Single fluffy-clouds scene with a canvas overlay for animated
   enhancements:
   - Large chunky pixel-art clouds (multi-blob clusters, 40–100px)
   - A glowing pulsing sun (top-right, radial glow + rotating rays)
   - Floating 4-pointed sparkles that twinkle
   - Drifting warm dust motes
   - CSS parallax drift animation (compositor-thread, 0 JS overhead)
   - prefers-reduced-motion safe
   - Dynamic blur when chat is active (blurred prop)
   ═══════════════════════════════════════════════════════════════════ */

const WALLPAPER_SRC = '/wallpapers/fluffy-clouds.png';
const CLOUD_COUNT = 12;
const DUST_COUNT = 25;
const SPARKLE_COUNT = 15;
const PARTICLE_FPS = 18;
const PARTICLE_FRAME_MS = 1000 / PARTICLE_FPS;
const PIXEL_SCALE = 4; // draw at 1/4 resolution, upscale with nearest-neighbor → chunky pixel look

// ══════════════════════════════════════════════════════════════════
// Cloud — chunky multi-blob cluster with shadow layer
// ══════════════════════════════════════════════════════════════════

interface Cloud {
  x: number;           // 0–1 normalized center
  y: number;
  width: number;       // base width in CSS px
  speed: number;       // px/sec rightward
  alpha: number;       // base opacity
  phase: number;       // pulse phase offset
  period: number;      // pulse period ms
  blobs: { dx: number; dy: number; rx: number; ry: number }[];
  shadowBlobs: { dx: number; dy: number; rx: number; ry: number }[];
  tint: number;        // 0=white, 1=cream, 2=light-blue
}

function createClouds(): Cloud[] {
  const clouds: Cloud[] = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const w = 40 + Math.random() * 70; // 40–110 CSS px
    const blobCount = 4 + Math.floor(Math.random() * 5); // 4–8 blobs
    const blobs: Cloud['blobs'] = [];
    const shadowBlobs: Cloud['shadowBlobs'] = [];

    for (let b = 0; b < blobCount; b++) {
      const dx = (Math.random() - 0.5) * w * 0.8;
      const dy = (Math.random() - 0.5) * w * 0.2;
      const rx = w * (0.18 + Math.random() * 0.22);
      const ry = rx * (0.5 + Math.random() * 0.3);
      blobs.push({ dx, dy, rx, ry });
      // Shadow blob — offset down+right slightly
      shadowBlobs.push({ dx: dx + 2, dy: dy + 3, rx: rx * 1.05, ry: ry * 1.05 });
    }
    // Add a big central blob for body
    blobs.push({ dx: 0, dy: 0, rx: w * 0.35, ry: w * 0.18 });
    shadowBlobs.push({ dx: 2, dy: 4, rx: w * 0.37, ry: w * 0.2 });

    const tint = Math.random();
    clouds.push({
      x: Math.random(),
      y: 0.04 + Math.random() * 0.5,
      width: w,
      speed: 4 + Math.random() * 12,
      alpha: 0.18 + Math.random() * 0.2,
      phase: Math.random() * Math.PI * 2,
      period: 4000 + Math.random() * 6000,
      blobs,
      shadowBlobs,
      tint: tint < 0.45 ? 0 : tint < 0.75 ? 1 : 2,
    });
  }
  return clouds;
}

// ── Sparkles — twinkling 4-pointed stars ──

interface Sparkle {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;       // twinkle speed
  brightness: number;  // 0–1
}

function createSparkles(): Sparkle[] {
  return Array.from({ length: SPARKLE_COUNT }, () => ({
    x: Math.random(),
    y: 0.03 + Math.random() * 0.55,
    size: 2 + Math.random() * 4,
    phase: Math.random() * Math.PI * 2,
    speed: 1.5 + Math.random() * 2.5,
    brightness: 0.3 + Math.random() * 0.7,
  }));
}

// ── Dust motes ──

interface DustMote {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  life: number;
  maxLife: number;
  r: number; g: number; b: number;
}

function resetDust(d: DustMote): DustMote {
  const angle = Math.random() * Math.PI * 2;
  const speed = 3 + Math.random() * 8;
  const warm = Math.random() > 0.3;
  d.x = Math.random();
  d.y = Math.random();
  d.size = 1.5 + Math.random() * 2.5;
  d.speedX = Math.cos(angle) * speed;
  d.speedY = Math.sin(angle) * speed;
  d.life = 0;
  d.maxLife = 6 + Math.random() * 10;
  d.r = warm ? 255 : 220;
  d.g = warm ? 245 : 240;
  d.b = warm ? 210 : 255;
  return d;
}

function createDust(): DustMote[] {
  return Array.from({ length: DUST_COUNT }, () => resetDust({} as DustMote));
}

// ══════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════

export function SunnyWallpaper({ blurred = false }: { blurred?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const cloudsRef = useRef<Cloud[]>(createClouds());
  const dustRef = useRef<DustMote[]>(createDust());
  const sparklesRef = useRef<Sparkle[]>(createSparkles());
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(0);

  // ── Main particle loop ──
  // All particles are drawn at 1/PIXEL_SCALE resolution on an offscreen canvas,
  // then upscaled with nearest-neighbor (imageSmoothingEnabled=false) for a
  // chunky pixel-art look that matches the wallpaper PNG.
  const drawParticles = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(drawParticles); return; }
    if (now - lastFrameRef.current < PARTICLE_FRAME_MS) { rafRef.current = requestAnimationFrame(drawParticles); return; }
    const dt = (now - lastFrameRef.current) / 1000;
    lastFrameRef.current = now;

    const mainCtx = canvas.getContext('2d', { alpha: true });
    if (!mainCtx) { rafRef.current = requestAnimationFrame(drawParticles); return; }
    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) { rafRef.current = requestAnimationFrame(drawParticles); return; }

    // ── Set up low-res offscreen canvas ──
    const lw = Math.ceil(w / PIXEL_SCALE);
    const lh = Math.ceil(h / PIXEL_SCALE);

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }
    const off = offscreenRef.current;
    if (off.width !== lw || off.height !== lh) {
      off.width = lw;
      off.height = lh;
    }

    const ctx = off.getContext('2d', { alpha: true });
    if (!ctx) { rafRef.current = requestAnimationFrame(drawParticles); return; }
    ctx.clearRect(0, 0, lw, lh);

    // All coordinates are now in low-res space (divided by PIXEL_SCALE)
    const s = 1 / PIXEL_SCALE; // scale factor for positions

    // ── Glowing sun (top-right) ──
    const sunX = w * 0.82 * s;
    const sunY = h * 0.10 * s;
    const sunBaseR = Math.min(w, h) * 0.055 * s;
    const sunPulse = 0.88 + 0.12 * Math.sin(now / 1800);

    // Wide ambient glow
    const ambient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunBaseR * 6);
    ambient.addColorStop(0, 'rgba(255, 245, 180, 0.18)');
    ambient.addColorStop(0.3, 'rgba(255, 230, 140, 0.08)');
    ambient.addColorStop(0.7, 'rgba(255, 215, 100, 0.02)');
    ambient.addColorStop(1, 'rgba(255, 200, 80, 0)');
    ctx.fillStyle = ambient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunBaseR * 6 * sunPulse, 0, Math.PI * 2);
    ctx.fill();

    // Inner glow
    const glow = ctx.createRadialGradient(sunX, sunY, sunBaseR * 0.3, sunX, sunY, sunBaseR * 3);
    glow.addColorStop(0, 'rgba(255, 248, 200, 0.35)');
    glow.addColorStop(0.4, 'rgba(255, 230, 130, 0.12)');
    glow.addColorStop(1, 'rgba(255, 210, 90, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunBaseR * 3 * sunPulse, 0, Math.PI * 2);
    ctx.fill();

    // Rotating rays
    const rayCount = 10;
    for (let i = 0; i < rayCount; i++) {
      const angle = (Math.PI * 2 * i) / rayCount + now * 0.00015;
      const rayLen = sunBaseR * (2.5 + 0.8 * Math.sin(now / 1000 + i * 0.7));
      const innerR = sunBaseR * 1.05;
      const halfWidth = 0.06 + 0.02 * Math.sin(now / 1500 + i);
      ctx.beginPath();
      ctx.moveTo(sunX + Math.cos(angle - halfWidth) * innerR, sunY + Math.sin(angle - halfWidth) * innerR);
      ctx.lineTo(sunX + Math.cos(angle) * rayLen, sunY + Math.sin(angle) * rayLen);
      ctx.lineTo(sunX + Math.cos(angle + halfWidth) * innerR, sunY + Math.sin(angle + halfWidth) * innerR);
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 240, 160, ${(0.14 * sunPulse).toFixed(3)})`;
      ctx.fill();
    }

    // Sun disc
    const disc = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunBaseR);
    disc.addColorStop(0, 'rgba(255, 252, 220, 0.55)');
    disc.addColorStop(0.5, 'rgba(255, 240, 150, 0.35)');
    disc.addColorStop(1, 'rgba(255, 220, 100, 0.12)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunBaseR * sunPulse, 0, Math.PI * 2);
    ctx.fill();

    // ── Clouds — chunky overlapping ellipses with shadows ──
    for (const c of cloudsRef.current) {
      c.x += (c.speed / w) * dt;
      if (c.x > 1.18) { c.x = -0.18; c.y = 0.04 + Math.random() * 0.5; }

      const pulse = 0.85 + 0.15 * Math.sin(now / c.period + c.phase);
      const a = c.alpha * pulse;

      const cx = c.x * lw;
      const cy = c.y * lh;

      // Shadow layer
      for (const sb of c.shadowBlobs) {
        ctx.beginPath();
        ctx.ellipse(cx + sb.dx * s, cy + sb.dy * s, sb.rx * s, sb.ry * s, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 215, 235, ${(a * 0.4).toFixed(3)})`;
        ctx.fill();
      }

      // Main cloud layer
      let r: number, g: number, b: number;
      if (c.tint === 0) { r = 255; g = 255; b = 255; }
      else if (c.tint === 1) { r = 255; g = 252; b = 240; }
      else { r = 240; g = 248; b = 255; }

      for (const blob of c.blobs) {
        ctx.beginPath();
        ctx.ellipse(cx + blob.dx * s, cy + blob.dy * s, blob.rx * s, blob.ry * s, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
        ctx.fill();
      }
    }

    // ── Sparkles — twinkling 4-pointed stars ──
    for (const sp of sparklesRef.current) {
      const twinkle = 0.3 + 0.7 * ((Math.sin(now / (1000 / sp.speed) + sp.phase) + 1) * 0.5);
      const alpha = sp.brightness * twinkle * 0.6;
      if (alpha < 0.05) continue;

      const sx = sp.x * lw;
      const sy = sp.y * lh;
      const sz = sp.size * twinkle * s;

      ctx.strokeStyle = `rgba(255, 255, 240, ${alpha.toFixed(3)})`;
      ctx.lineWidth = Math.max(1, 1.2 * s);

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(sx - sz, sy);
      ctx.lineTo(sx + sz, sy);
      ctx.stroke();

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(sx, sy - sz);
      ctx.lineTo(sx, sy + sz);
      ctx.stroke();

      // Center bright dot
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.5, 0.8 * s), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 250, ${(alpha * 1.2).toFixed(3)})`;
      ctx.fill();
    }

    // ── Dust motes ──
    for (const d of dustRef.current) {
      d.life += dt;
      if (d.life >= d.maxLife) { resetDust(d); continue; }

      d.x += (d.speedX / w) * dt;
      d.y += (d.speedY / h) * dt;

      const lifeRatio = d.life / d.maxLife;
      let fade: number;
      if (lifeRatio < 0.15) fade = lifeRatio / 0.15;
      else if (lifeRatio > 0.8) fade = (1 - lifeRatio) / 0.2;
      else fade = 1;

      const alpha = 0.06 + fade * 0.16;
      const px = d.x * lw;
      const py = d.y * lh;
      if (px < 0 || px >= lw || py < 0 || py >= lh) { resetDust(d); continue; }

      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.5, d.size * s), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${d.r}, ${d.g}, ${d.b}, ${alpha.toFixed(3)})`;
      ctx.fill();
    }

    // ── Upscale offscreen → main canvas with nearest-neighbor (pixelated!) ──
    mainCtx.clearRect(0, 0, w, h);
    mainCtx.imageSmoothingEnabled = false;
    mainCtx.drawImage(off, 0, 0, lw, lh, 0, 0, w, h);

    rafRef.current = requestAnimationFrame(drawParticles);
  }, []);

  // ── Canvas setup + animation loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      // Main canvas at CSS pixel size — the offscreen canvas handles
      // low-res rendering; we upscale with imageSmoothingEnabled=false
      sizeRef.current = { w: width, h: height };
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
    });
    ro.observe(canvas);

    let visible = true;
    const wrappedDraw = (now: number) => {
      if (!visible) { rafRef.current = requestAnimationFrame(wrappedDraw); return; }
      drawParticles(now);
    };
    rafRef.current = requestAnimationFrame(wrappedDraw);

    const handleVis = () => { visible = document.visibilityState === 'visible'; };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', handleVis);
      ro.disconnect();
    };
  }, [drawParticles]);

  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    : false;

  const driftStyle = prefersReducedMotion
    ? { transform: 'scale(1.06)' }
    : { animation: 'wallpaper-drift 55s ease-in-out infinite' };

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        filter: blurred ? 'blur(18px) brightness(1.04)' : 'blur(0px)',
        transition: 'filter 0.6s ease',
        // Slight scale-up when blurred to avoid transparent edges from blur radius
        transform: blurred ? 'scale(1.06)' : 'scale(1)',
      }}
    >
      {/* Wallpaper image */}
      <img
        src={WALLPAPER_SRC}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          imageRendering: 'pixelated',
          opacity: 0.35,
          willChange: 'transform',
          filter: 'brightness(1.1) saturate(1.2)',
          ...driftStyle,
        }}
      />

      {/* Animated particle overlay — clouds, sun, sparkles, dust */}
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
