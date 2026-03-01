'use client';

import { useEffect, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   ThematicWallpaper — Animated pixel art space background

   Uses purple-nebula.png as the base layer with a canvas overlay
   for animated enhancements:
   - CSS parallax drift animation (compositor-thread, 0 JS overhead)
   - Animated twinkling star particles (~55 stars, 15fps)
   - Drifting dust motes / cosmic dust particles
   - Occasional shooting star streaks
   - prefers-reduced-motion safe
   ═══════════════════════════════════════════════════════════════════ */

const WALLPAPER_IMAGE = '/wallpapers/purple-nebula.png';
const STAR_COUNT = 55;
const DUST_COUNT = 40;
const PARTICLE_FPS = 15;
const PARTICLE_FRAME_MS = 1000 / PARTICLE_FPS;

// ══════════════════════════════════════════════════════════════════
// Animated particles — stars + cosmic dust
// ══════════════════════════════════════════════════════════════════

interface Star {
  x: number; // 0-1 normalized
  y: number;
  size: number;
  baseAlpha: number;
  phase: number;
  period: number;
  driftX: number;
  driftY: number;
  driftSpeed: number;
  // Color tint: 0=blue-white, 1=warm-white, 2=cool-white
  tint: number;
}

interface DustMote {
  x: number;
  y: number;
  size: number;
  alpha: number;
  speedX: number;
  speedY: number;
  life: number; // 0-1
  maxLife: number; // in seconds
  // Color: subtle warm or cool tint
  r: number;
  g: number;
  b: number;
}

interface ShootingStar {
  x: number;
  y: number;
  angle: number;
  speed: number;
  length: number;
  life: number;
  maxLife: number;
  alpha: number;
}

function createStars(): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const tint = Math.random();
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() > 0.85 ? 2 : 1,
      baseAlpha: 0.15 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      period: 2000 + Math.random() * 4000,
      driftX: (Math.random() - 0.5) * 0.00003,
      driftY: (Math.random() - 0.5) * 0.00002,
      driftSpeed: 0.5 + Math.random() * 1.5,
      tint: tint < 0.35 ? 0 : tint < 0.55 ? 1 : 2,
    });
  }
  return stars;
}

function createDustMotes(): DustMote[] {
  const motes: DustMote[] = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    motes.push(resetDustMote({} as DustMote));
  }
  return motes;
}

function resetDustMote(mote: DustMote): DustMote {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.0001 + Math.random() * 0.0003;
  const warm = Math.random() > 0.5;
  mote.x = Math.random();
  mote.y = Math.random();
  mote.size = 1 + Math.random() * 1.5;
  mote.alpha = 0;
  mote.speedX = Math.cos(angle) * speed;
  mote.speedY = Math.sin(angle) * speed;
  mote.life = 0;
  mote.maxLife = 3 + Math.random() * 6; // 3-9 seconds
  mote.r = warm ? 200 + Math.floor(Math.random() * 40) : 160 + Math.floor(Math.random() * 40);
  mote.g = warm ? 180 + Math.floor(Math.random() * 30) : 180 + Math.floor(Math.random() * 40);
  mote.b = warm ? 160 + Math.floor(Math.random() * 20) : 210 + Math.floor(Math.random() * 45);
  return mote;
}

// ══════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════

export function ThematicWallpaper({ blurred = false }: { blurred?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>(createStars());
  const dustRef = useRef<DustMote[]>(createDustMotes());
  const shootingRef = useRef<ShootingStar[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(0);

  // Particle canvas animation (15fps)
  const drawParticles = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      rafRef.current = requestAnimationFrame(drawParticles);
      return;
    }

    if (now - lastFrameRef.current < PARTICLE_FRAME_MS) {
      rafRef.current = requestAnimationFrame(drawParticles);
      return;
    }
    const dt = (now - lastFrameRef.current) / 1000; // delta in seconds
    lastFrameRef.current = now;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(drawParticles);
      return;
    }

    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) {
      rafRef.current = requestAnimationFrame(drawParticles);
      return;
    }

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    // ── Twinkling stars ──
    for (const s of starsRef.current) {
      s.x += s.driftX * s.driftSpeed;
      s.y += s.driftY * s.driftSpeed;
      if (s.x < 0) s.x = 1;
      if (s.x > 1) s.x = 0;
      if (s.y < 0) s.y = 1;
      if (s.y > 1) s.y = 0;

      const twinkle = 0.3 + 0.7 * ((Math.sin(now / s.period + s.phase) + 1) / 2);
      const alpha = Math.max(0.02, Math.min(0.65, s.baseAlpha * twinkle));

      let r: number, g: number, b: number;
      if (s.tint === 0) { r = 180; g = 200; b = 255; }       // blue-white
      else if (s.tint === 1) { r = 240; g = 220; b = 190; }   // warm-white
      else { r = 220; g = 225; b = 240; }                     // cool-white

      const px = Math.floor(s.x * w);
      const py = Math.floor(s.y * h);

      // Glow halo for larger stars
      if (s.size >= 2) {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(alpha * 0.25).toFixed(3)})`;
        ctx.fillRect(px - 1, py - 1, 4, 4);
      }
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
      ctx.fillRect(px, py, s.size, s.size);

      // Cross sparkle on bright moments
      if (alpha > 0.5 && s.size >= 2) {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(alpha * 0.15).toFixed(3)})`;
        ctx.fillRect(px - 2, py, 1, 1);
        ctx.fillRect(px + s.size + 1, py, 1, 1);
        ctx.fillRect(px, py - 2, 1, 1);
        ctx.fillRect(px, py + s.size + 1, 1, 1);
      }
    }

    // ── Cosmic dust motes — gentle floating particles ──
    for (const d of dustRef.current) {
      d.life += dt;
      if (d.life >= d.maxLife) {
        resetDustMote(d);
        continue;
      }

      d.x += d.speedX;
      d.y += d.speedY;

      // Fade in → sustain → fade out lifecycle
      const lifeRatio = d.life / d.maxLife;
      let fadeAlpha: number;
      if (lifeRatio < 0.15) fadeAlpha = lifeRatio / 0.15;         // fade in
      else if (lifeRatio > 0.8) fadeAlpha = (1 - lifeRatio) / 0.2; // fade out
      else fadeAlpha = 1;                                           // sustain

      const dustAlpha = 0.08 + fadeAlpha * 0.14;
      const px = Math.floor(d.x * w);
      const py = Math.floor(d.y * h);

      if (px < 0 || px >= w || py < 0 || py >= h) {
        resetDustMote(d);
        continue;
      }

      ctx.fillStyle = `rgba(${d.r}, ${d.g}, ${d.b}, ${dustAlpha.toFixed(3)})`;
      ctx.fillRect(px, py, Math.ceil(d.size), Math.ceil(d.size));
    }

    // ── Shooting stars (rare) ──
    // Spawn occasionally
    if (Math.random() < 0.002) {
      shootingRef.current.push({
        x: Math.random() * 0.8 + 0.1,
        y: Math.random() * 0.4,
        angle: Math.PI * 0.2 + Math.random() * 0.3,
        speed: 0.003 + Math.random() * 0.004,
        length: 15 + Math.random() * 25,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4,
        alpha: 0.3 + Math.random() * 0.35,
      });
    }

    // Draw & update shooting stars
    shootingRef.current = shootingRef.current.filter((ss) => {
      ss.life += dt;
      if (ss.life >= ss.maxLife) return false;

      const fade = ss.life < 0.1 ? ss.life / 0.1 : (ss.maxLife - ss.life) / (ss.maxLife * 0.5);
      const a = Math.max(0, Math.min(ss.alpha, ss.alpha * fade));

      ss.x += Math.cos(ss.angle) * ss.speed;
      ss.y += Math.sin(ss.angle) * ss.speed;

      const headX = Math.floor(ss.x * w);
      const headY = Math.floor(ss.y * h);

      // Draw trail
      for (let i = 0; i < ss.length; i++) {
        const trailFade = 1 - i / ss.length;
        const tx = headX - Math.floor(Math.cos(ss.angle) * i * 1.5);
        const ty = headY - Math.floor(Math.sin(ss.angle) * i * 1.5);
        ctx.fillStyle = `rgba(220, 230, 255, ${(a * trailFade * 0.5).toFixed(3)})`;
        ctx.fillRect(tx, ty, 1, 1);
      }
      // Bright head
      ctx.fillStyle = `rgba(240, 245, 255, ${a.toFixed(3)})`;
      ctx.fillRect(headX, headY, 2, 2);

      return true;
    });

    rafRef.current = requestAnimationFrame(drawParticles);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: width, h: height };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ro.observe(canvas);

    let visible = true;

    const wrappedDraw = (now: number) => {
      if (!visible) {
        rafRef.current = requestAnimationFrame(wrappedDraw);
        return;
      }
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

  // Check reduced motion preference
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
        filter: blurred ? 'blur(24px) brightness(0.35)' : 'blur(0px)',
        transition: 'filter 0.8s ease, transform 0.8s ease',
        transform: blurred ? 'scale(1.08)' : 'scale(1)',
      }}
    >
      {/* Single wallpaper image — purple nebula pixel art */}
      <img
        src={WALLPAPER_IMAGE}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          imageRendering: 'pixelated',
          opacity: 0.28,
          willChange: 'transform',
          filter: 'brightness(0.55) saturate(1.6) contrast(1.2)',
          ...driftStyle,
        }}
      />

      {/* Animated particle overlay — twinkling stars, cosmic dust, shooting stars */}
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
