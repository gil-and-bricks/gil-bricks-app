/**
 * S1 — A SLIDING-WINDOW RATE LIMIT, kept deliberately small.
 *
 * WHAT IT PROTECTS: the endpoints where an anonymous caller can make US spend
 * something — a third-party credential, or a write. It is not a WAF and does not
 * pretend to be: someone with a botnet has many IPs and will get through. What
 * it stops is the realistic case, which is one script on one connection
 * discovering a free proxy to a rate-limited API.
 *
 * THE KEY IS THE CLOUDFLARE-VERIFIED IP. `CF-Connecting-IP` is set by Cloudflare
 * itself at the edge and cannot be spoofed by a client header — unlike
 * X-Forwarded-For, whose leftmost value is whatever the caller typed. If it is
 * absent (it should never be, on Workers) the request is NOT let through
 * unlimited: it shares a single "unknown" bucket, so the failure mode is a
 * shared limit rather than no limit.
 *
 * BUCKETS, NOT A LOG. One row per (bucket, identity, window), incremented. A
 * request-per-row design would let an attacker fill the table faster than they
 * could exhaust what it guards.
 */

export interface RateLimitRule {
  /** Namespace, so two limits never share a bucket. */
  bucket: string;
  /** How many requests are allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** What to put in Retry-After when refused. */
  retryAfterSeconds: number;
}

/** The identity a limit is counted against. Never a client-supplied header. */
export function identityOf(request: Request): string {
  const ip = request.headers.get('CF-Connecting-IP');
  return ip !== null && ip.trim() !== '' ? ip.trim() : 'unknown';
}

/**
 * Count one request against a rule. FAILS OPEN on a database error, and that is
 * deliberate: this guards a convenience (an EPC lookup), and a D1 blip must not
 * take the analyser down for everybody. A limiter that fails CLOSED would turn
 * a small outage into a total one.
 */
export async function consume(
  db: D1Database, rule: RateLimitRule, identity: string, nowMs = Date.now(),
): Promise<RateLimitResult> {
  const nowSec = Math.floor(nowMs / 1000);
  const windowStart = nowSec - (nowSec % rule.windowSeconds);
  const key = `${rule.bucket}:${identity}:${windowStart}`;
  const expiresAt = windowStart + rule.windowSeconds * 2;
  const retryAfterSeconds = windowStart + rule.windowSeconds - nowSec;
  try {
    // One statement, so two requests arriving together cannot both read 0.
    await db.prepare(
      `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1`,
    ).bind(key, expiresAt).run();
    const row = await db.prepare('SELECT count FROM rate_limits WHERE key = ?')
      .bind(key).first<{ count: number }>();
    const count = row?.count ?? 1;
    return { allowed: count <= rule.limit, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Old buckets, swept by the existing cron. Guarded by its caller. */
export async function sweepRateLimits(db: D1Database, nowMs = Date.now()): Promise<void> {
  await db.prepare('DELETE FROM rate_limits WHERE expires_at < ?')
    .bind(Math.floor(nowMs / 1000)).run();
}
