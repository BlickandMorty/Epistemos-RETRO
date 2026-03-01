/**
 * In-memory sliding-window rate limiter.
 *
 * Appropriate for solo / small-team deployments. Resets on server restart,
 * which is acceptable for abuse prevention vs strict enforcement.
 */

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup to prevent memory leaks from stale IPs
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanupStale(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs * 2;
  for (const [key, bucket] of buckets) {
    if (bucket.timestamps.length === 0 || bucket.timestamps[bucket.timestamps.length - 1]! < cutoff) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  cleanupStale(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  // Evict timestamps outside the window
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= maxRequests) {
    const oldestInWindow = bucket.timestamps[0]!;
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldestInWindow + windowMs - now,
    };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - bucket.timestamps.length,
    resetMs: windowMs,
  };
}

/** Reset all buckets — useful for testing. */
export function resetRateLimits() {
  buckets.clear();
}
