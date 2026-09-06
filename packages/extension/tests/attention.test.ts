/**
 * THE DAILY BADGE (P10). The rules this holds, because breaking any of them
 * would make the extension a liar:
 *   - a number nobody can trust is worse than no number: every failure clears it;
 *   - AT MOST one system notification a day, and only for something dated;
 *   - off means silent — no fetch, no badge, no notification;
 *   - the count is the web app's, never the extension's own idea of urgent.
 */
import { describe, expect, it, vi } from 'vitest';
import { coreConfig } from '@gil-bricks/core';
import {
  ATTENTION, ATTENTION_COPY, badgeText, deadlineKey, localDay, nextRun, refreshAttention, type AttentionDeps,
} from '../src/attention';

const OK = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const DAY = 86_400_000;

/** A fake browser: every call recorded, nothing real touched. */
function harness(over: Partial<AttentionDeps> & { body?: unknown; status?: number } = {}) {
  const calls = { badges: [] as string[], titles: [] as string[], notes: [] as { title: string; message: string }[], urls: [] as string[], credentials: [] as (string | undefined)[] };
  let lastDay = '';
  let keys: string[] = [];
  let now = Date.parse('2026-09-07T09:00:00Z');
  const deps: AttentionDeps = {
    fetch: vi.fn(async (url: string, init?: { credentials?: 'include' | 'omit' }) => {
      calls.urls.push(url);
      calls.credentials.push(init?.credentials);
      if (over.status !== undefined && over.status !== 200) return { ok: false, status: over.status, json: async () => ({}) };
      return OK(over.body ?? { count: 0, deadlines: [] });
    }),
    setBadge: (t) => { calls.badges.push(t); },
    setTitle: (t) => { calls.titles.push(t); },
    notify: (n) => { calls.notes.push(n); },
    remindersOn: async () => true,
    lastNotified: async () => lastDay,
    notifiedKeys: async () => keys,
    rememberNotified: async (d, k) => { lastDay = d; keys = [...keys, k]; },
    now: () => now,
    ...over,
  };
  return {
    deps, calls,
    setNow: (t: number) => { now = t; },
    day: () => lastDay,
    keys: () => keys,
  };
}

describe('the badge itself', () => {
  it('says nothing at zero, and never becomes a report', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(-3)).toBe('');
    expect(badgeText(Number.NaN)).toBe('');
    expect(badgeText(1)).toBe('1');
    expect(badgeText(ATTENTION.maxBadge)).toBe(String(ATTENTION.maxBadge));
    expect(badgeText(ATTENTION.maxBadge + 1)).toBe(`${ATTENTION.maxBadge}+`);
  });

  it('counts deals, and says so in words — never "unread" anything', () => {
    expect(ATTENTION_COPY.tooltip(1)).toBe('1 deal needs you today');
    expect(ATTENTION_COPY.tooltip(4)).toBe('4 deals need you today');
    for (const w of ['unread', 'new', 'alert']) expect(ATTENTION_COPY.tooltip(3)).not.toContain(w);
  });
});

describe('the daily alarm', () => {
  it('lands on the next configured hour, and never in the past', () => {
    const morning = new Date(2026, 8, 7, 6, 30).getTime();
    expect(new Date(nextRun(morning)).getHours()).toBe(ATTENTION.hour);
    expect(nextRun(morning)).toBeGreaterThan(morning);
    // after the hour has passed today, it is tomorrow's
    const afternoon = new Date(2026, 8, 7, 14, 0).getTime();
    expect(nextRun(afternoon) - afternoon).toBeGreaterThan(0);
    expect(new Date(nextRun(afternoon)).getDate()).toBe(8);
  });

  it('repeats once a day', () => {
    expect(ATTENTION.periodMinutes).toBe(24 * 60);
  });
});

describe('asking the web app', () => {
  it('asks the ONE shared address, with the session cookie', async () => {
    const h = harness({ body: { count: 2, deadlines: [] } });
    await refreshAttention(h.deps);
    expect(h.calls.urls).toEqual([`${coreConfig.appBaseUrl}${ATTENTION.endpoint}`]);
    expect(h.calls.credentials).toEqual(['include']);
  });

  it('wears the count, and says what it means', async () => {
    const h = harness({ body: { count: 3, deadlines: [] } });
    const out = await refreshAttention(h.deps);
    expect(out).toMatchObject({ badge: '3', count: 3, notified: false, reason: 'ok' });
    expect(h.calls.titles).toEqual([ATTENTION_COPY.tooltip(3)]);
  });

  it('SIGNED OUT: no badge, no notification, no complaint', async () => {
    const h = harness({ status: 401, body: { count: 9, deadlines: [{ dealId: 'd', due: '2026-09-08', text: 'x' }] } });
    const out = await refreshAttention(h.deps);
    expect(out).toMatchObject({ badge: '', notified: false, reason: 'unauthenticated' });
    expect(h.calls.badges).toEqual(['']);
    expect(h.calls.notes).toEqual([]);
  });

  it('a failed or unreadable answer clears the badge rather than leaving a stale one', async () => {
    for (const bad of [{ status: 500 }, { body: { count: 'lots' } }, { body: null }, { body: { count: -1 } }]) {
      const h = harness(bad as never);
      const out = await refreshAttention(h.deps);
      expect(out.badge, JSON.stringify(bad)).toBe('');
      expect(h.calls.badges).toEqual(['']);
    }
    const thrown = harness({ fetch: async () => { throw new Error('offline'); } });
    expect((await refreshAttention(thrown.deps)).reason).toBe('failed');
    expect(thrown.calls.badges).toEqual(['']);
  });

  it('OFF means silent: nothing is even asked', async () => {
    const h = harness({ remindersOn: async () => false, body: { count: 5, deadlines: [{ dealId: 'd', due: '2026-09-08', text: 'the auction is tomorrow' }] } });
    const out = await refreshAttention(h.deps);
    expect(out).toMatchObject({ badge: '', notified: false, reason: 'off' });
    expect(h.calls.urls, 'no fetch at all').toEqual([]);
    expect(h.calls.notes).toEqual([]);
    expect(h.calls.badges).toEqual(['']);
  });
});

describe('the one interruption a day', () => {
  const one = { dealId: 'd1', due: '2026-09-08', text: 'Chase the agent on 12 Test Street — the auction is tomorrow.' };
  const critical = { count: 2, deadlines: [one] };

  it('fires for a dated deadline, in the BOARD’s words, under the product’s name', async () => {
    const h = harness({ body: critical });
    const out = await refreshAttention(h.deps);
    expect(out.notified).toBe(true);
    expect(h.calls.notes).toEqual([{ title: coreConfig.siteName, message: one.text }]);
  });

  it('NEVER twice in a day, however many times the worker wakes', async () => {
    const h = harness({ body: critical });
    await refreshAttention(h.deps);
    await refreshAttention(h.deps);
    await refreshAttention(h.deps);
    expect(h.calls.notes).toHaveLength(1);
    // and the badge is still repainted every time — the count stays current
    expect(h.calls.badges).toEqual(['2', '2', '2']);
  });

  it('says nothing at all when nothing is time-critical', async () => {
    const h = harness({ body: { count: 6, deadlines: [] } });
    const out = await refreshAttention(h.deps);
    expect(out.notified).toBe(false);
    expect(h.calls.notes).toEqual([]);
    expect(out.badge, 'the badge is the whole story').toBe('6');
  });

  it('and NEVER twice about the SAME deadline, however many days pass', async () => {
    const h = harness({ body: critical });
    await refreshAttention(h.deps);
    // a date you have not got round to clearing stays urgent for ever; telling
    // you about it every morning is how a notification becomes noise
    for (const day of ['2026-09-08', '2026-09-09', '2026-09-10']) {
      h.setNow(Date.parse(`${day}T09:00:00Z`));
      await refreshAttention(h.deps);
    }
    expect(h.calls.notes).toHaveLength(1);
    expect(h.keys()).toEqual([deadlineKey(one)]);
  });

  it('but a NEW deadline behind an already-announced one is still worth saying', async () => {
    const two = { dealId: 'd2', due: '2026-09-09', text: 'Push the solicitor on 2 Bryn Road — exchange is tomorrow.' };
    // the board ranks the bigger deal first, and we have already said that one
    const h = harness({ body: { count: 3, deadlines: [one, two] } });
    h.deps.notifiedKeys = async () => [deadlineKey(one)];
    await refreshAttention(h.deps);
    expect(h.calls.notes).toHaveLength(1);
    expect(h.calls.notes[0].message).toBe(two.text);
  });

  it('and once BOTH have been said, it goes quiet', async () => {
    const two = { dealId: 'd2', due: '2026-09-09', text: 'Push the solicitor on 2 Bryn Road — exchange is tomorrow.' };
    const h = harness({ body: { count: 3, deadlines: [one, two] } });
    h.deps.notifiedKeys = async () => [deadlineKey(one), deadlineKey(two)];
    expect((await refreshAttention(h.deps)).notified).toBe(false);
    expect(h.calls.badges, 'the badge still says what is waiting').toEqual(['3']);
  });

  it('reads the older single-deadline answer too', async () => {
    const h = harness({ body: { count: 1, critical: one } });
    expect((await refreshAttention(h.deps)).notified).toBe(true);
    expect(h.calls.notes[0].message).toBe(one.text);
  });

  it('ignores a deadline with no words in it', async () => {
    const h = harness({ body: { count: 1, deadlines: [{ dealId: 'd1', due: '2026-09-08', text: '' }] } });
    expect((await refreshAttention(h.deps)).notified).toBe(false);
  });

  it('the local day rolls over at midnight, not at UTC', () => {
    const late = new Date(2026, 8, 7, 23, 30).getTime();
    expect(localDay(late)).toBe('2026-09-07');
    expect(localDay(late + DAY)).toBe('2026-09-08');
  });
});

describe('what the copy is allowed to promise', () => {
  it('says exactly how far it reaches, and never further', () => {
    expect(ATTENTION_COPY.reach).toContain('while Chrome is open');
    for (const overclaim of ['always', 'anywhere', 'even when', 'we will remind', 'notify you when']) {
      expect(ATTENTION_COPY.reach.toLowerCase()).not.toContain(overclaim);
    }
  });
});
