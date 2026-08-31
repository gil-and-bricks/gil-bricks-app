/**
 * Kit outbox processing (S6.2). THE APP NEVER SENDS EMAIL — it only tells
 * Kit who consented (subscribe) and who withdrew (unsubscribe); Kit does the
 * emailing. Only consented users ever reach this table.
 *
 * Kit API v4 (verified live against developers.kit.com on 2026-08-31):
 *  - upsert:      POST /v4/subscribers { email_address, first_name } → 200/201 (202 async)
 *  - find:        GET  /v4/subscribers?email_address=… (exact match)
 *  - unsubscribe: POST /v4/subscribers/{id}/unsubscribe → 204
 * Auth header: X-Kit-Api-Key (server-side only, never logged).
 */

const KIT_API = 'https://api.kit.com/v4';

export interface OutboxRow {
  id: string;
  email: string;
  first_name: string;
  action: string; // 'subscribe' | 'unsubscribe'
  attempts: number;
  last_attempt: string | null;
  created_at: string;
}

export const MAX_ATTEMPTS = 5;

/**
 * Exponential backoff: retry k waits 15min × 2^(k-1) after the previous
 * attempt (15m, 30m, 1h, then 2h). Subscribes give up (status "failed")
 * after MAX_ATTEMPTS; UNSUBSCRIBES NEVER GIVE UP — a consent withdrawal
 * must eventually be honoured, so they keep retrying every 2h for as long
 * as it takes.
 */
export function shouldAttempt(
  row: Pick<OutboxRow, 'attempts' | 'last_attempt' | 'action'>,
  nowMs: number,
): boolean {
  if (row.attempts >= MAX_ATTEMPTS && row.action !== 'unsubscribe') return false;
  if (row.attempts === 0 || row.last_attempt === null) return true;
  const waitMs = 15 * 60 * 1000 * 2 ** Math.min(row.attempts - 1, 3);
  return nowMs >= Date.parse(row.last_attempt) + waitMs;
}

export type PushResult =
  | { ok: true; note?: string }
  | { ok: false; error: string };

/** One attempt against Kit. Never throws; never logs the key or full bodies. */
export async function pushToKit(
  row: Pick<OutboxRow, 'email' | 'first_name' | 'action'>,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> {
  const headers = { 'X-Kit-Api-Key': apiKey, 'content-type': 'application/json' };
  try {
    if (row.action === 'subscribe') {
      const res = await fetchImpl(`${KIT_API}/subscribers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email_address: row.email, first_name: row.first_name }),
      });
      if (res.status === 200 || res.status === 201 || res.status === 202) return { ok: true };
      return { ok: false, error: `kit subscribe HTTP ${res.status}` };
    }
    if (row.action === 'unsubscribe') {
      const find = await fetchImpl(`${KIT_API}/subscribers?email_address=${encodeURIComponent(row.email)}`, { headers });
      if (!find.ok) return { ok: false, error: `kit lookup HTTP ${find.status}` };
      const body = (await find.json()) as { subscribers?: { id: number }[] };
      const sub = body.subscribers?.[0];
      if (!sub) {
        // Never subscribed on Kit's side — nothing to undo. Honest success.
        return { ok: true, note: 'not-in-kit' };
      }
      const res = await fetchImpl(`${KIT_API}/subscribers/${sub.id}/unsubscribe`, { method: 'POST', headers });
      if (res.status === 204) return { ok: true };
      return { ok: false, error: `kit unsubscribe HTTP ${res.status}` };
    }
    return { ok: false, error: `unknown action "${row.action}"` };
  } catch {
    return { ok: false, error: 'kit unreachable' };
  }
}

/** Saved-deal strategies the API accepts ('comparables' = saved from the comps page). */
export const DEAL_STRATEGIES = ['btl', 'flip', 'brrrr', 'hmo', 'comparables'] as const;

export function isDealStrategy(s: string): boolean {
  return (DEAL_STRATEGIES as readonly string[]).includes(s);
}
