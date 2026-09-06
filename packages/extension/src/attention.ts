/**
 * THE DAILY ATTENTION BADGE (P10).
 *
 * The web app's today line can only reach somebody who opens the board. The
 * extension is the one thing that is open all day, so once a day it asks the web
 * app the SAME question the board asks — "what needs me?" — and wears the answer
 * as a number on the toolbar.
 *
 * WHAT THIS IS NOT. It is not a second idea of urgency: the count and the one
 * critical line both come back from /api/attention, which runs the board's own
 * ranking. Nothing here decides what matters.
 *
 * THE HONEST LIMITS, enforced here and said in the panel's settings:
 *  - signed out, or the fetch fails → NO badge and NO notification, never a
 *    stale number;
 *  - at most ONE system notification a day, and only for a dated deadline that
 *    is nearly here. A quiet day escalates to nothing;
 *  - switched off means silent: no fetch, no badge, no notification;
 *  - it works while Chrome is running. Nothing reaches anybody when it is shut.
 *
 * Every chrome API it touches is injected, so the whole thing is testable
 * without a browser.
 */
import { coreConfig } from '@gil-bricks/core';

export const ATTENTION = {
  /** The daily alarm's name. Re-asserted on install and on startup, because an
   * MV3 service worker sleeps and only an alarm wakes it. */
  alarm: 'gb:attention',
  /** Once a day. */
  periodMinutes: 1440,
  /** The local hour the daily check lands on — morning, before the day starts. */
  hour: 8,
  /** A badge is a glance, not a report: bigger than this reads as "lots". */
  maxBadge: 99,
  /**
   * How long a count is worth showing. It is a DAILY check, so a day: the badge
   * and the panel read the same window, and can never say different things
   * (P10 review).
   */
  freshHours: 24,
  /** How many deadlines we remember having told you about. */
  rememberDeadlines: 20,
  endpoint: '/api/attention',
  board: '/deals',
} as const;

/** Every word this feature can say. The product's name is never typed here. */
export const ATTENTION_COPY = {
  /** The toolbar tooltip while something is waiting. */
  tooltip: (n: number): string => `${n} ${n === 1 ? 'deal needs' : 'deals need'} you today`,
  /** The notification's title: the product, making no claim of its own. */
  title: coreConfig.siteName,
  /** The settings switch — in the panel, and on the extension's own options page. */
  settings: 'Daily reminders',
  /** Said back on the options page, so a tap is never silent. */
  on: 'On. The badge updates once a day.',
  off: 'Off. Nothing will show on the icon.',
  /**
   * Said ONCE, in settings, and nowhere else: exactly what this can and cannot
   * do. Nothing in this product may imply it reaches you when Chrome is shut.
   */
  reach: 'The badge works while Chrome is open. Nothing reaches you when it is closed.',
  /** The panel's line when the board has something waiting. */
  banner: (n: number): string => `${n} ${n === 1 ? 'deal needs' : 'deals need'} you today`,
  open: 'Open the board',
} as const;

/** One dated deadline, as the web app describes it. */
export interface Deadline { dealId: string; text: string; due: string }

/** What /api/attention answers. */
export interface AttentionResult {
  count: number;
  /**
   * Every dated deadline that qualifies, in the board's own order. `due` is the
   * plain day it falls on, which is what makes it ONE identifiable thing rather
   * than "something is urgent again today".
   */
  deadlines: Deadline[];
}

/**
 * The identity of ONE deadline: this deal, this day. A date left uncleared stays
 * urgent for ever, and telling somebody about the same deadline every morning is
 * how a notification becomes noise (P10 review).
 */
export function deadlineKey(deadline: { dealId: string; due: string }): string {
  return `${deadline.dealId}:${deadline.due}`;
}

/** The first deadline nobody has been told about yet, or null. */
export function nextToAnnounce(deadlines: readonly Deadline[], said: readonly string[]): Deadline | null {
  return deadlines.find((d) => !said.includes(deadlineKey(d))) ?? null;
}

/** The badge's text for a count: nothing at zero, capped so it stays a glance. */
export function badgeText(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  return count > ATTENTION.maxBadge ? `${ATTENTION.maxBadge}+` : String(Math.floor(count));
}

/** The local day, as the one-a-day notification guard reads it. */
export function localDay(now: number): string {
  const d = new Date(now);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** When the next daily check should land: the next ATTENTION.hour, local. */
export function nextRun(now: number): number {
  const at = new Date(now);
  at.setHours(ATTENTION.hour, 0, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** The slice of chrome this needs — injected, so none of it needs a browser. */
export interface AttentionDeps {
  fetch: (url: string, init?: { credentials?: 'include' | 'omit' }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  setBadge: (text: string) => Promise<void> | void;
  setTitle: (title: string) => Promise<void> | void;
  notify: (n: { title: string; message: string }) => Promise<void> | void;
  /** Is the whole feature switched on? */
  remindersOn: () => Promise<boolean>;
  /** The last local day a notification was shown, or ''. */
  lastNotified: () => Promise<string>;
  /** The deadlines already announced, newest last. */
  notifiedKeys: () => Promise<string[]>;
  rememberNotified: (day: string, key: string) => Promise<void>;
  now: () => number;
  base?: string;
}

export interface RefreshOutcome {
  /** What the toolbar now says. '' means nothing at all. */
  badge: string;
  /** The number behind it, so the panel can say the same thing in words. */
  count: number;
  /** Did we interrupt anybody this run? */
  notified: boolean;
  /** Why it ended where it did — for the log, never for a person. */
  reason: 'off' | 'unauthenticated' | 'failed' | 'ok';
}

/**
 * The once-a-day job: ask, badge, and interrupt only for something genuinely
 * time-critical. Every early exit CLEARS the badge, because a number that is no
 * longer true is worse than no number.
 */
export async function refreshAttention(deps: AttentionDeps): Promise<RefreshOutcome> {
  const clear = async (reason: RefreshOutcome['reason']): Promise<RefreshOutcome> => {
    await deps.setBadge('');
    await deps.setTitle('');
    return { badge: '', count: 0, notified: false, reason };
  };
  if (!(await deps.remindersOn())) return clear('off');

  let body: AttentionResult;
  try {
    const res = await deps.fetch(`${deps.base ?? coreConfig.appBaseUrl}${ATTENTION.endpoint}`, { credentials: 'include' });
    // 401 is the signed-out answer, and it is a normal state, not an error.
    if (!res.ok) return clear(res.status === 401 ? 'unauthenticated' : 'failed');
    const parsed = (await res.json()) as (Partial<AttentionResult> & { critical?: Deadline | null }) | null;
    const count = Number(parsed?.count);
    if (!Number.isFinite(count) || count < 0) return clear('failed');
    // `critical` is the single-deadline shape an older server sends; either way
    // only entries with words in them are kept.
    const listed = Array.isArray(parsed?.deadlines) ? parsed.deadlines : (parsed?.critical ? [parsed.critical] : []);
    body = {
      count,
      deadlines: listed
        .filter((d) => d !== null && typeof d?.text === 'string' && d.text !== '')
        .map((d) => ({ dealId: String(d.dealId ?? ''), text: d.text, due: String(d.due ?? '') })),
    };
  } catch {
    return clear('failed');
  }

  const badge = badgeText(body.count);
  await deps.setBadge(badge);
  await deps.setTitle(body.count > 0 ? ATTENTION_COPY.tooltip(body.count) : '');

  // ONE interruption a day, and ONE PER DEADLINE. The day stops a worker that
  // wakes twice from telling you twice; the deadline's own key stops a date you
  // have not got round to clearing from telling you every morning for ever —
  // while still leaving a NEW deadline behind it something to say. Between them,
  // an ignored day escalates to nothing at all.
  const quiet = { badge, count: body.count, notified: false, reason: 'ok' as const };
  if (body.deadlines.length === 0) return quiet;
  const today = localDay(deps.now());
  if ((await deps.lastNotified()) === today) return quiet;
  const next = nextToAnnounce(body.deadlines, await deps.notifiedKeys());
  if (next === null) return quiet;
  await deps.notify({ title: ATTENTION_COPY.title, message: next.text });
  await deps.rememberNotified(today, deadlineKey(next));
  return { badge, count: body.count, notified: true, reason: 'ok' };
}
