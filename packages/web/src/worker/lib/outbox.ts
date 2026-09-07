/**
 * Kit outbox processing (S6.2). THE APP NEVER SENDS EMAIL — it only tells
 * Kit who consented (subscribe) and who withdrew (unsubscribe); Kit does the
 * emailing. Only consented users ever reach this table.
 *
 * Kit API v4 (verified live against developers.kit.com on 2026-08-31):
 *  - upsert:      POST /v4/subscribers { email_address, first_name } → 200/201 (202 async)
 *  - find:        GET  /v4/subscribers?email_address=… (exact match)
 *  - unsubscribe: POST /v4/subscribers/{id}/unsubscribe → 204
 *  - tag:         POST /v4/tags/{tag_id}/subscribers { email_address } → 200/201
 * Auth header: X-Kit-Api-Key (server-side only, never logged).
 *
 * F2 adds ONE more, 'factfind-ready', and it is the only row addressed to the
 * BROKER rather than to a user. It carries his email and a single-use link, and
 * nothing else: the fact-find's own answers — a date of birth, a home address, a
 * credit answer — never enter Kit at all.
 *
 * F1 adds two actions, 'bridging-qualified' and 'bridging-not-yet': the person
 * is upserted and TAGGED, and Kit's own automations send the broker's
 * notification and the follow-up. The app still sends no email itself. Until
 * the operator fills in the tag ids the push fails honestly and the row waits
 * in D1 for the cron — the enquiry is never lost.
 */
import { strategies } from '@gil-bricks/core';

import { BROKER } from '../../config/bridging';
import { captureFor, KIT_FIELDS } from '../../config/capture';

const KIT_API = 'https://api.kit.com/v4';

export interface OutboxRow {
  id: string;
  email: string;
  first_name: string;
  action: string; // 'subscribe' | 'unsubscribe' | 'bridging-*' | 'lead-<tool>'
  attempts: number;
  last_attempt: string | null;
  created_at: string;
  /** T3: the person's own figures, as Kit custom fields. Leads only. */
  fields_json?: string | null;
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
  row: Pick<OutboxRow, 'email' | 'first_name' | 'action'> & { fields_json?: string | null },
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  tags: { qualified: string; notYet: string; factFind: string } =
    { qualified: BROKER.kitTagQualified, notYet: BROKER.kitTagNotYet, factFind: BROKER.kitTagFactFind },
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
    if (row.action === 'bridging-qualified' || row.action === 'bridging-not-yet') {
      const tagId = row.action === 'bridging-qualified' ? tags.qualified : tags.notYet;
      if (tagId.trim() === '') return { ok: false, error: `kit tag id not configured for ${row.action}` };
      const up = await fetchImpl(`${KIT_API}/subscribers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email_address: row.email, first_name: row.first_name }),
      });
      if (!(up.status === 200 || up.status === 201 || up.status === 202)) {
        return { ok: false, error: `kit subscribe HTTP ${up.status}` };
      }
      const res = await fetchImpl(`${KIT_API}/tags/${encodeURIComponent(tagId)}/subscribers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email_address: row.email }),
      });
      if (res.status === 200 || res.status === 201 || res.status === 202) return { ok: true };
      return { ok: false, error: `kit tag HTTP ${res.status}` };
    }
    if (row.action === 'factfind-ready') {
      // F2: the BROKER is told a fact-find is waiting, and given the link. Kit
      // receives his own address and that link — never the applicant's name,
      // date of birth, address or credit answer. Those never leave D1.
      if (tags.factFind.trim() === '') return { ok: false, error: 'kit tag id not configured for factfind-ready' };
      let fields: Record<string, string> = {};
      try {
        const parsed = row.fields_json === null || row.fields_json === undefined ? {} : JSON.parse(row.fields_json);
        if (parsed !== null && typeof parsed === 'object') fields = parsed as Record<string, string>;
      } catch {
        fields = {};
      }
      const up = await fetchImpl(`${KIT_API}/subscribers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email_address: row.email, first_name: row.first_name, fields }),
      });
      if (!(up.status === 200 || up.status === 201 || up.status === 202)) {
        return { ok: false, error: `kit subscribe HTTP ${up.status}` };
      }
      const res = await fetchImpl(`${KIT_API}/tags/${encodeURIComponent(tags.factFind)}/subscribers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email_address: row.email }),
      });
      if (res.status === 200 || res.status === 201 || res.status === 202) return { ok: true };
      return { ok: false, error: `kit tag HTTP ${res.status}` };
    }
    if (row.action.startsWith('lead-')) {
      // T3: a tool lead. The person asked for THEIR figures by email, so the
      // subscriber carries them as custom fields and the tool's own tag tells
      // Kit which automation sends it. The app still sends no email itself.
      const slug = row.action.slice('lead-'.length);
      const tool = captureFor(slug);
      if (!tool || tool.kitTag.trim() === '') return { ok: false, error: `kit tag id not configured for ${row.action}` };
      let fields: Record<string, string> = {};
      try {
        const parsed = row.fields_json === null || row.fields_json === undefined ? {} : JSON.parse(row.fields_json);
        if (parsed !== null && typeof parsed === 'object') fields = parsed as Record<string, string>;
      } catch {
        fields = {};
      }
      const up = await fetchImpl(`${KIT_API}/subscribers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email_address: row.email, first_name: row.first_name, fields: { ...fields, [KIT_FIELDS.tool]: slug } }),
      });
      if (!(up.status === 200 || up.status === 201 || up.status === 202)) {
        return { ok: false, error: `kit subscribe HTTP ${up.status}` };
      }
      const res = await fetchImpl(`${KIT_API}/tags/${encodeURIComponent(tool.kitTag)}/subscribers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email_address: row.email }),
      });
      if (res.status === 200 || res.status === 201 || res.status === 202) return { ok: true };
      return { ok: false, error: `kit tag HTTP ${res.status}` };
    }
    return { ok: false, error: `unknown action "${row.action}"` };
  } catch {
    return { ok: false, error: 'kit unreachable' };
  }
}

/**
 * Saved-deal strategies the API accepts — READ FROM THE STRATEGY CONFIGS, so
 * adding a strategy stays a config edit and the button can never appear on a
 * page the API then refuses. 'comparables' was in this list until A1: a
 * deal saved from the comps page has no strategy behind it, so it could never
 * be scored and the board had to carry it for ever as unscoreable. The save is
 * gone from that page and refused here too, so a stale open tab cannot make a
 * new one. Rows already in the database are untouched and still render.
 */
export const DEAL_STRATEGIES: readonly string[] = strategies.map((s) => s.id);

export function isDealStrategy(s: string): boolean {
  return (DEAL_STRATEGIES as readonly string[]).includes(s);
}
