/**
 * Device performance detection — scales particle counts and effects
 * for lower-spec machines (integrated GPU, low core count, etc.).
 *
 * Cached at module load — never changes during session.
 */

export type PerfTier = 'low' | 'mid' | 'high';

function detectTier(): PerfTier {
  // 1. Reduced motion always = low tier (accessibility + perf)
  if (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'low';
  }

  // 2. Hardware concurrency (logical cores)
  const cores = navigator?.hardwareConcurrency ?? 4;
  if (cores <= 2) return 'low';

  // 3. Device memory API (Chrome/Edge only, in GB)
  const mem = (navigator as any)?.deviceMemory;
  if (typeof mem === 'number' && mem <= 4) return 'low';

  // 4. Mobile / touch = mid at best
  if (typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
    return 'mid';
  }

  return cores >= 8 ? 'high' : 'mid';
}

/** Cached performance tier — computed once at startup */
export const PERF_TIER: PerfTier = detectTier();

/** Scale a count based on device tier. */
export function scaleCount(base: number, tier: PerfTier = PERF_TIER): number {
  switch (tier) {
    case 'low': return Math.max(1, Math.round(base * 0.3));
    case 'mid': return Math.max(1, Math.round(base * 0.6));
    case 'high': return base;
  }
}

/** Scale FPS target based on device tier. */
export function scaleFps(base: number, tier: PerfTier = PERF_TIER): number {
  switch (tier) {
    case 'low': return Math.max(8, Math.round(base * 0.5));
    case 'mid': return Math.max(10, Math.round(base * 0.75));
    case 'high': return base;
  }
}
