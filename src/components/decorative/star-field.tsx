'use client';

import { useEffect, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   StarField — Animated starfield with high-quality shooting stars

   Renders ~140 twinkling stars on a fixed canvas background.
   Shooting stars spawn every 2-5s with size variation (small/medium/large),
   smooth anti-aliased trails, glow halos, and graceful fade-outs.
   30fps throttled, pauses when tab hidden, compositor-friendly.
   ═══════════════════════════════════════════════════════════════════ */

interface Star {
  x: number;      // 0-1 normalized position
  y: number;
  size: number;   // 1, 2, or 3 px
  baseAlpha: number;
  phase: number;  // oscillation phase offset
  period: number; // oscillation period in ms (1500-4000)
  warm: boolean;  // true → warm yellow, false → white
}

type ShootingStarSize = 'small' | 'medium' | 'large';

interface ShootingStar {
  x: number;       // current position px
  y: number;
  dx: number;      // velocity px/frame
  dy: number;
  trailLen: number; // trail length in dots
  headSize: number; // head dot size (1-3)
  alpha: number;    // head opacity
  life: number;     // remaining frames
  maxLife: number;  // original life for fade calc
  warm: boolean;
  size: ShootingStarSize;
  glowRadius: number; // glow halo radius (0 = no glow)
}

const STAR_COUNT = 140;
const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;

function createStars(): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    // Size distribution: 55% 1px, 30% 2px, 15% 3px
    const roll = Math.random();
    const size = roll > 0.85 ? 3 : roll > 0.55 ? 2 : 1;
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size,
      baseAlpha: 0.3 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      period: 1500 + Math.random() * 2500,
      warm: Math.random() > 0.82, // ~18% warm yellow
    });
  }
  return stars;
}

export function StarField({ theme = 'oled' }: { theme?: 'light' | 'dark' | 'oled' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>(createStars());
  const shootingRef = useRef<ShootingStar[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(0);
  const nextShootRef = useRef(0);
  const themeRef = useRef(theme);

  // Keep themeRef in sync without re-running the animation effect
  useEffect(() => { themeRef.current = theme; }, [theme]);

  const spawnShootingStar = useCallback((w: number, h: number) => {
    // Size class distribution: 50% small, 35% medium, 15% large
    const sizeRoll = Math.random();
    const sizeClass: ShootingStarSize = sizeRoll > 0.85 ? 'large' : sizeRoll > 0.5 ? 'medium' : 'small';

    // Properties scale with size class
    const config = {
      small:  { speed: [12, 6], trail: [5, 4],  head: 1, alpha: [0.4, 0.2], life: [25, 15], glow: 0 },
      medium: { speed: [9, 5],  trail: [8, 5],  head: 2, alpha: [0.55, 0.2], life: [35, 20], glow: 3 },
      large:  { speed: [7, 4],  trail: [12, 6], head: 3, alpha: [0.7, 0.15], life: [45, 25], glow: 6 },
    }[sizeClass];

    // Mostly diagonal angles (20-70 degrees or 200-250 degrees)
    const angleBase = Math.random() > 0.5 ? 20 : 200;
    const angle = (angleBase + Math.random() * 50) * (Math.PI / 180);
    const speed = config.speed[0]! + Math.random() * config.speed[1]!;

    // Start from random edge position
    const edge = Math.random();
    let sx: number, sy: number;
    if (edge < 0.5) {
      sx = Math.random() * w;
      sy = -10;
    } else {
      sx = -10;
      sy = Math.random() * h * 0.6;
    }

    const life = config.life[0]! + Math.floor(Math.random() * config.life[1]!);

    shootingRef.current.push({
      x: sx,
      y: sy,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      trailLen: config.trail[0]! + Math.floor(Math.random() * config.trail[1]!),
      headSize: config.head,
      alpha: config.alpha[0]! + Math.random() * config.alpha[1]!,
      life,
      maxLife: life,
      warm: Math.random() > 0.3,
      size: sizeClass,
      glowRadius: config.glow,
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const maybeCtx = canvas.getContext('2d', { alpha: true });
    if (!maybeCtx) return;
    const ctx: CanvasRenderingContext2D = maybeCtx;

    // ResizeObserver for cached dimensions
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: width, h: height };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ro.observe(canvas);

    // Schedule first shooting star
    nextShootRef.current = performance.now() + 1000 + Math.random() * 2000;

    let visible = true;

    function draw(now: number) {
      if (!visible) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Throttle to 30fps
      if (now - lastFrameRef.current < FRAME_MS) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrameRef.current = now;

      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      // Theme-adaptive colors
      const isLight = themeRef.current === 'light';
      const globalAlphaMul = isLight ? 0.35 : 1;

      // ── Draw background stars ──
      ctx.imageSmoothingEnabled = false; // Pixel-crisp stars
      const stars = starsRef.current;
      for (const star of stars) {
        const alpha = star.baseAlpha * (0.5 + 0.5 * Math.sin(now / star.period + star.phase)) * globalAlphaMul;
        const clampedAlpha = Math.max(0.08, Math.min(0.9, alpha));

        if (isLight) {
          ctx.fillStyle = star.warm
            ? `rgba(180, 140, 60, ${clampedAlpha})`
            : `rgba(80, 80, 80, ${clampedAlpha})`;
        } else {
          ctx.fillStyle = star.warm
            ? `rgba(255, 248, 225, ${clampedAlpha})`
            : `rgba(255, 255, 255, ${clampedAlpha})`;
        }

        const px = Math.floor(star.x * w);
        const py = Math.floor(star.y * h);
        ctx.fillRect(px, py, star.size, star.size);
      }

      // ── Spawn shooting stars ──
      if (now >= nextShootRef.current) {
        spawnShootingStar(w, h);
        // Spawn interval: 2-5s (more frequent than before)
        nextShootRef.current = now + 2000 + Math.random() * 3000;
      }

      // ── Draw shooting stars ──
      ctx.imageSmoothingEnabled = true; // Smooth trails
      const shooting = shootingRef.current;
      for (let i = shooting.length - 1; i >= 0; i--) {
        const s = shooting[i]!;
        s.life--;

        if (s.life <= 0 || s.x > w + 80 || s.y > h + 80) {
          shooting.splice(i, 1);
          continue;
        }

        // Life-based fade: smooth ease-out in last 30% of life
        const lifeRatio = s.life / s.maxLife;
        const lifeFade = lifeRatio < 0.3 ? lifeRatio / 0.3 : 1;
        const currentAlpha = s.alpha * lifeFade * globalAlphaMul;

        // Color strings for this shooting star
        const warmColorBase = isLight ? '180, 140, 60' : '255, 248, 225';
        const coolColorBase = isLight ? '80, 80, 80' : '255, 255, 255';
        const colorBase = s.warm ? warmColorBase : coolColorBase;

        // ── Glow halo (medium/large only) ──
        if (s.glowRadius > 0 && currentAlpha > 0.1) {
          const gradient = ctx.createRadialGradient(
            s.x, s.y, 0,
            s.x, s.y, s.glowRadius * (1 + (1 - lifeFade) * 0.5),
          );
          gradient.addColorStop(0, `rgba(${colorBase}, ${currentAlpha * 0.4})`);
          gradient.addColorStop(1, `rgba(${colorBase}, 0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.glowRadius * 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // ── Draw trail as anti-aliased line ──
        ctx.lineCap = 'round';
        for (let j = 0; j < s.trailLen; j++) {
          const trailFade = 1 - j / s.trailLen;
          const trailAlpha = currentAlpha * trailFade * 0.85;
          // Trail gets thinner toward the end
          const trailWidth = s.headSize * trailFade;

          const tx = s.x - s.dx * j * 0.45;
          const ty = s.y - s.dy * j * 0.45;
          const txNext = s.x - s.dx * (j + 1) * 0.45;
          const tyNext = s.y - s.dy * (j + 1) * 0.45;

          if (trailAlpha > 0.02) {
            ctx.strokeStyle = `rgba(${colorBase}, ${trailAlpha})`;
            ctx.lineWidth = Math.max(0.5, trailWidth);
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(txNext, tyNext);
            ctx.stroke();
          }
        }

        // ── Draw head dot ──
        ctx.fillStyle = `rgba(${colorBase}, ${currentAlpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.headSize * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Bright core for medium/large
        if (s.headSize >= 2 && currentAlpha > 0.2) {
          ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha * 0.6})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.headSize * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }

        // Advance position
        s.x += s.dx;
        s.y += s.dy;
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    // Pause when tab hidden
    const handleVisibility = () => {
      visible = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      ro.disconnect();
    };
  }, [spawnShootingStar]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
        willChange: 'transform',
      }}
    />
  );
}
