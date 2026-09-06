/**
 * CALENDAR EXPORT (P10) — an .ics file, built entirely in the browser.
 *
 * WHY: the today line can only reach somebody who opens the board. A date weeks
 * away belongs in the calendar they already check. We hand over a file; their
 * calendar owns the reminder from then on, which is exactly what the copy says.
 *
 * WHAT THIS IS: RFC 5545 and nothing else. No prose lives here (every visible
 * word comes from CALENDAR in src/config/pipeline.ts) and no figure is computed
 * here — the cash needed comes back from @gil-bricks/core through the ONE
 * scoring path, and is included only when the deal really holds it.
 *
 * The three calendars this must import into cleanly (Google, Apple, Outlook)
 * agree on the strict reading of the spec, so that is what we write:
 *  - CRLF line endings everywhere, and a trailing CRLF;
 *  - lines folded at 75 OCTETS, never inside a UTF-8 character;
 *  - VERSION, PRODID, and per-event UID + DTSTAMP (Outlook rejects files missing
 *    them);
 *  - METHOD:PUBLISH, so Outlook imports it instead of treating it as an invite.
 *    There is deliberately NO ORGANIZER: nobody is being invited to anything, and
 *    inventing an organiser address would make some clients treat the file as a
 *    meeting and try to RSVP to it;
 *  - all-day events as VALUE=DATE with an EXCLUSIVE DTEND (start + 1 day);
 *  - a VALARM carrying ACTION, TRIGGER and DESCRIPTION (Apple needs the
 *    description or the alarm is dropped).
 */
import { fmtMoney } from '@gil-bricks/core';
import { CALENDAR, CALENDAR_ALARM, DEAL_DATES, dateAppliesAt } from '../../config/pipeline';
import { datesOf, type BoardDeal } from './board';

/** One event, before it becomes text. */
export interface CalendarEvent {
  /** The deal date key it came from (viewing_date, auction_date, …). */
  key: string;
  /** Stable across exports: re-importing updates the event, never doubles it. */
  uid: string;
  /** A plain ISO day (YYYY-MM-DD) — these are all-day events. */
  day: string;
  summary: string;
  /** Description lines, joined with newlines inside the one TEXT value. */
  description: string[];
}

const DAY = 86_400_000;

/** YYYYMMDD from a plain ISO day — the DATE value type. */
export function icsDate(day: string): string {
  return day.replace(/-/g, '');
}

/** The day AFTER a plain ISO day: DTEND on an all-day event is exclusive. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + DAY;
  return new Date(t).toISOString().slice(0, 10);
}

/** A UTC timestamp in the form RFC 5545 wants for DTSTAMP. */
export function icsStamp(now: number): string {
  return `${new Date(now).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** TEXT escaping: backslash, semicolon, comma and newline. Colons are literal. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold to 75 octets per line, continuing with a single leading space. Counted in
 * OCTETS, not characters, and never split inside a character — every deal title
 * carries "·" and "£", which are multi-byte.
 */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let used = 0;
  let limit = 75;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (used + size > limit) {
      out.push(current);
      current = char;
      used = size;
      limit = 74; // the continuation line spends one octet on its leading space
      continue;
    }
    current += char;
    used += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

/**
 * The events a deal can export: every date it holds that still applies to it.
 * A date stranded by a stage move is not exported — the same one rule the card
 * and the today line use (P8/P9).
 */
export function eventsForDeal(
  deal: BoardDeal,
  opts: { url: string; host: string; cashNeeded?: number | null; auctionFeesIn?: boolean },
): CalendarEvent[] {
  // A deal you killed does not belong in your calendar. Neither does one you have
  // already bought: the dates on it are behind you (P10 review).
  if (deal.status !== 'live') return [];
  const held = datesOf(deal);
  const out: CalendarEvent[] = [];
  for (const spec of DEAL_DATES) {
    const day = held[spec.key];
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!dateAppliesAt(spec, deal.stage, deal.is_auction)) continue;
    const description = [CALENDAR.openDeal(opts.url)];
    // The cash needed goes in the AUCTION event only, and only when the deal
    // really holds the analysis behind it. Nothing is estimated into a calendar.
    if (spec.key === 'auction_date' && typeof opts.cashNeeded === 'number' && opts.cashNeeded > 0) {
      description.push(CALENDAR.cash(fmtMoney(opts.cashNeeded)));
      description.push(opts.auctionFeesIn === true ? CALENDAR.feesIn : CALENDAR.feesOut);
    }
    out.push({
      key: spec.key,
      uid: `${deal.id}-${spec.key}@${opts.host}`,
      day,
      summary: CALENDAR.summary(spec.event, deal.title),
      description,
    });
  }
  return out;
}

/**
 * Does this deal hold a date the calendar could take? The cheap question, asked
 * on every render; the file itself is only built when somebody clicks.
 */
export function hasExportableDate(deal: BoardDeal): boolean {
  if (deal.status !== 'live') return false;
  const held = datesOf(deal);
  return DEAL_DATES.some((spec) => {
    const day = held[spec.key];
    return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && dateAppliesAt(spec, deal.stage, deal.is_auction);
  });
}

/** The .ics text for a set of events. Empty in, empty out — never a file with
 * no events in it, which every calendar reports as a broken import. */
export function buildIcs(events: readonly CalendarEvent[], now: number, prodId: string): string {
  if (events.length === 0) return '';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${escapeText(prodId)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(ev.uid)}`,
      `DTSTAMP:${icsStamp(now)}`,
      // Same instant as DTSTAMP: with a stable UID, this is what tells a calendar
      // that a re-exported file is the NEWER copy of an event it already has.
      `LAST-MODIFIED:${icsStamp(now)}`,
      `DTSTART;VALUE=DATE:${icsDate(ev.day)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(ev.day))}`,
      `SUMMARY:${escapeText(ev.summary)}`,
      `DESCRIPTION:${escapeText(ev.description.join('\n'))}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(ev.summary)}`,
      `TRIGGER:${CALENDAR_ALARM}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** A file name from the deal's own title — plain ASCII, so every OS accepts it. */
export function icsFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug === '' ? 'deal' : slug}.ics`;
}
