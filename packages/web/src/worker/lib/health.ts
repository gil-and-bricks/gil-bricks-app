/**
 * Is anything quietly broken? (C3 follow-up)
 *
 * The app's scheduled work is invisible by design: the Kit outbox retry runs
 * every 15 minutes and the staleness stamp daily, both server-side, both
 * silent. If a trigger stops firing or a handler throws, a bridging enquiry or
 * a fact-find sits queued for ever and the site looks perfectly well. Nobody
 * finds out, because the app may never send email (CLAUDE.md rule 6).
 *
 * So it exposes what it knows and lets something else do the telling. Every
 * threshold is in src/config/health.ts; the data-age maths is in
 * @gil-bricks/core. Nothing here decides policy.
 *
 * WHAT AN ANONYMOUS CALLER MAY SEE: one word. The detail — which check, how
 * old, how many — needs the token. See handleHealth in worker/index.ts.
 * No detail line may ever carry an email, a name or an id: they are built from
 * counts and ages only, and a test asserts it.
 */
import { dataFreshness, SCHEMA_VERSION } from '@gil-bricks/core';
import { HEALTH } from '../../config/health';

export interface HealthCheck {
  /** Stable key, safe to match on in a workflow. */
  id: string;
  ok: boolean;
  /** Numbers and ages only — never anybody's data. */
  detail: string;
}

export interface HealthReport {
  status: 'ok' | 'fail';
  checks: HealthCheck[];
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Whole minutes between an ISO timestamp and now; null when unreadable. */
export function minutesSince(iso: string | null | undefined, nowMs: number): number | null {
  const at = typeof iso === 'string' ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((nowMs - at) / MINUTE_MS));
}

interface Heartbeats { outbox: string | null; daily: string | null }

async function readOutbox(db: D1Database, nowMs: number): Promise<HealthCheck[]> {
  const since = new Date(nowMs - HEALTH.outboxFailedWithinDays * DAY_MS).toISOString();
  const [pending, failed] = await Promise.all([
    db.prepare("SELECT MIN(created_at) AS oldest FROM kit_outbox WHERE status = 'pending'").first<{ oldest: string | null }>(),
    db.prepare("SELECT COUNT(*) AS n FROM kit_outbox WHERE status = 'failed' AND created_at >= ?").bind(since).first<{ n: number }>(),
  ]);
  const age = minutesSince(pending?.oldest ?? null, nowMs);
  const failedCount = Number(failed?.n ?? 0);
  return [
    {
      id: 'outboxPending',
      ok: age === null || age <= HEALTH.outboxPendingMaxMinutes,
      detail: age === null
        ? 'nothing waiting'
        : `oldest queued row is ${age} minutes old (limit ${HEALTH.outboxPendingMaxMinutes})`,
    },
    {
      id: 'outboxFailed',
      ok: failedCount === 0,
      detail: failedCount === 0
        ? `none in the last ${HEALTH.outboxFailedWithinDays} days`
        : `${failedCount} row(s) gave up in the last ${HEALTH.outboxFailedWithinDays} days — each is somebody's enquiry that never reached Kit`,
    },
  ];
}

function cronCheck(id: string, iso: string | null, nowMs: number, maxMinutes: number): HealthCheck {
  const age = minutesSince(iso, nowMs);
  if (age === null) return { id, ok: false, detail: 'has never stamped' };
  return {
    id,
    ok: age <= maxMinutes,
    detail: `last completed ${age} minutes ago (limit ${maxMinutes})`,
  };
}

async function readData(fetchImpl: typeof fetch, manifestUrl: string, nowMs: number): Promise<HealthCheck[]> {
  let body: { schemaVersion?: unknown; generatedAt?: string } | null = null;
  let reachable = false;
  let why = '';
  try {
    const res = await fetchImpl(manifestUrl, { signal: AbortSignal.timeout(HEALTH.manifestTimeoutMs) });
    if (!res.ok) why = `HTTP ${res.status}`;
    else {
      body = await res.json();
      reachable = true;
    }
  } catch (err) {
    why = err instanceof Error ? err.name : 'fetch failed';
  }
  if (!reachable || body === null) {
    return [
      { id: 'dataReachable', ok: false, detail: `the manifest could not be read (${why})` },
      { id: 'dataSchema', ok: false, detail: 'not checked — the manifest could not be read' },
      { id: 'dataFresh', ok: false, detail: 'not checked — the manifest could not be read' },
    ];
  }
  const fresh = dataFreshness(body.generatedAt, nowMs, HEALTH.dataStaleAfterDays);
  return [
    { id: 'dataReachable', ok: true, detail: 'the manifest answered' },
    {
      id: 'dataSchema',
      ok: body.schemaVersion === SCHEMA_VERSION,
      detail: body.schemaVersion === SCHEMA_VERSION
        ? `schema v${SCHEMA_VERSION}`
        : `the data says schema v${String(body.schemaVersion)}, this app reads v${SCHEMA_VERSION} — the app cannot use it`,
    },
    {
      id: 'dataFresh',
      ok: fresh.known && !fresh.stale,
      detail: !fresh.known
        ? 'the manifest carries no readable date'
        : `last refreshed ${fresh.ageDays} days ago (limit ${HEALTH.dataStaleAfterDays})`,
    },
  ];
}

/**
 * Every check, run together. Never throws: a failure to answer IS the answer,
 * and a health endpoint that 500s tells a poller nothing it can act on.
 */
export async function runHealthChecks(
  db: D1Database,
  opts: { now: number; manifestUrl: string; fetchImpl?: typeof fetch },
): Promise<HealthReport> {
  const nowMs = opts.now;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const checks: HealthCheck[] = [];

  let beats: Heartbeats = { outbox: null, daily: null };
  try {
    const rows = await db.prepare('SELECT name, last_at FROM cron_heartbeat').all<{ name: string; last_at: string }>();
    for (const r of rows.results ?? []) {
      if (r.name === 'outbox') beats.outbox = r.last_at;
      if (r.name === 'daily') beats.daily = r.last_at;
    }
    checks.push({ id: 'database', ok: true, detail: 'answered' });
    checks.push(...(await readOutbox(db, nowMs)));
  } catch (err) {
    // One failure, said once: with no database the outbox questions are
    // unanswerable, and three copies of the same alarm is noise.
    checks.push({ id: 'database', ok: false, detail: `the database did not answer (${err instanceof Error ? err.name : 'error'})` });
    beats = { outbox: null, daily: null };
  }

  checks.push(cronCheck('outboxCron', beats.outbox, nowMs, HEALTH.outboxCronMaxMinutes));
  checks.push(cronCheck('dailyCron', beats.daily, nowMs, HEALTH.dailyCronMaxHours * 60));
  checks.push(...(await readData(fetchImpl, opts.manifestUrl, nowMs)));

  return { status: checks.every((c) => c.ok) ? 'ok' : 'fail', checks };
}

/** Constant-time compare, so the endpoint is not a slow oracle for its token. */
export function tokenMatches(given: string | null, expected: string | undefined): boolean {
  if (typeof expected !== 'string' || expected === '' || given === null) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  // Length alone must not decide it early, so compare a fixed number of bytes.
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
