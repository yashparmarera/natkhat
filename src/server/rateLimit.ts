import type { IncomingHttpHeaders } from 'node:http';

/**
 * Small in-memory fixed-window rate limiter (no dependencies).
 * State is per process: on serverless hosts each warm instance keeps its own counters,
 * so this is a basic abuse guard, not a global quota.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  reset(): void;
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  /** Upper bound on tracked keys; expired windows are dropped first, then the oldest keys. */
  maxKeys?: number;
  now?: () => number;
}

export function createRateLimiter({ windowMs, max, maxKeys = 5000, now = Date.now }: RateLimiterOptions): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  function makeRoom(at: number) {
    for (const [key, w] of windows) {
      if (w.resetAt <= at) windows.delete(key);
    }
    while (windows.size >= maxKeys) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) break;
      windows.delete(oldest);
    }
  }

  return {
    check(key) {
      const at = now();
      let w = windows.get(key);
      if (!w || w.resetAt <= at) {
        if (!w && windows.size >= maxKeys) makeRoom(at);
        w = { count: 0, resetAt: at + windowMs };
        windows.set(key, w);
      }
      w.count += 1;
      if (w.count > max) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - at) / 1000)) };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset() {
      windows.clear();
    },
  };
}

/**
 * Identifies the caller for rate limiting.
 * x-forwarded-for is only used when `trustForwardedFor` is true (Vercel overwrites that header with
 * the real client IP, so it cannot be spoofed there). Otherwise any client could pick its own key.
 */
export function getClientKey(
  req: { headers: IncomingHttpHeaders; ip?: string; socket?: { remoteAddress?: string } },
  trustForwardedFor: boolean
): string {
  if (trustForwardedFor) {
    const raw = req.headers['x-forwarded-for'];
    const first = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
