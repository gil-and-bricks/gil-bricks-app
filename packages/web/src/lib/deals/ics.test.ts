/**
 * THE CALENDAR FILE (P10). An .ics that half-imports is worse than none, so this
 * holds the file to the strict reading of RFC 5545 that Google, Apple and
 * Outlook all share — and to the honesty rule: nothing is estimated into a
 * calendar entry.
 */
import { describe, expect, it } from 'vitest';
import { CALENDAR, CALENDAR_ALARM, parkReason } from '../../config/pipeline';
import { buildIcs, escapeText, eventsForDeal, fold, hasExportableDate, icsFilename, nextDay } from './ics';
import type { BoardDeal } from './board';

const HOST = 'gil-bricks-app.gil-782.workers.dev';
const URL_TO_DEAL = `https://${HOST}/buy-to-let/analyser?price=120000&deal=d1`;
const NOW = Date.parse('2026-09-06T09:30:00Z');

const deal = (over: Partial<BoardDeal> = {}): BoardDeal => ({
  id: 'd1', strategy: 'btl', title: 'Terraced · CF37 1HR · £120,000',
  url_params: 'postcode=CF37+1HR&price=120000&rent=950', stage: 'going-to-view',
  current_score: 7.2, status: 'live', headline_figure: 'ROI 8%', key_figure: 'ROI 8%',
  stage_since: '2026-09-01T00:00:00Z', is_auction: false, verdict_line: 'Cashflows.',
  updated_at: '2026-09-01T00:00:00Z', viewing_date: '2026-09-24', ...over,
});
const build = (d: BoardDeal, opts: Parameters<typeof eventsForDeal>[1] = { url: URL_TO_DEAL, host: HOST }) =>
  buildIcs(eventsForDeal(d, opts), NOW, CALENDAR.prodId('PropLaunch'));

/** Unfold the way a calendar does, then read it as properties. */
function parse(ics: string): { lines: string[]; props: [string, string][] } {
  expect(ics.endsWith('\r\n'), 'the file ends with CRLF').toBe(true);
  const raw = ics.slice(0, -2).split('\r\n');
  const lines: string[] = [];
  for (const line of raw) {
    if (line.startsWith(' ') && lines.length > 0) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  const props = lines.map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i), l.slice(i + 1)] as [string, string];
  });
  return { lines, props };
}
const valueOf = (ics: string, name: string): string | undefined =>
  parse(ics).props.find(([k]) => k === name || k.startsWith(`${name};`))?.[1];

describe('the file every calendar has to accept', () => {
  const ics = build(deal());

  it('is CRLF throughout, and no line runs over 75 octets', () => {
    expect(ics.includes('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(ics), 'a bare LF would break Outlook').toBe(false);
    for (const line of ics.slice(0, -2).split('\r\n')) {
      expect(new TextEncoder().encode(line).length, line).toBeLessThanOrEqual(75);
    }
  });

  it('carries what Outlook refuses to import without', () => {
    expect(valueOf(ics, 'VERSION')).toBe('2.0');
    expect(valueOf(ics, 'PRODID')).toBe(CALENDAR.prodId('PropLaunch'));
    expect(valueOf(ics, 'CALSCALE')).toBe('GREGORIAN');
    // PUBLISH, or Outlook reads the file as a meeting invitation
    expect(valueOf(ics, 'METHOD')).toBe('PUBLISH');
    expect(valueOf(ics, 'UID')).toBe(`d1-viewing_date@${HOST}`);
    expect(valueOf(ics, 'DTSTAMP')).toBe('20260906T093000Z');
    // with a stable UID, this is what marks a re-export as the newer copy
    expect(valueOf(ics, 'LAST-MODIFIED')).toBe('20260906T093000Z');
  });

  it('opens and closes every block, in order', () => {
    const { lines } = parse(ics);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
    const stack: string[] = [];
    for (const l of lines) {
      if (l.startsWith('BEGIN:')) stack.push(l.slice(6));
      if (l.startsWith('END:')) expect(stack.pop()).toBe(l.slice(4));
    }
    expect(stack).toEqual([]);
  });

  it('is an ALL-DAY event with an exclusive end, which is what a date means', () => {
    const { props } = parse(ics);
    expect(props.find(([k]) => k.startsWith('DTSTART'))).toEqual(['DTSTART;VALUE=DATE', '20260924']);
    // 25th, not the 24th: DTEND is exclusive, and Google draws a two-day event
    // if you get this wrong.
    expect(props.find(([k]) => k.startsWith('DTEND'))).toEqual(['DTEND;VALUE=DATE', '20260925']);
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2026-02-28'), 'not a leap year').toBe('2026-03-01');
  });

  it('asks for a reminder in the way Apple accepts — and only asks', () => {
    const { lines } = parse(ics);
    const alarm = lines.slice(lines.indexOf('BEGIN:VALARM'), lines.indexOf('END:VALARM'));
    expect(alarm).toContain('ACTION:DISPLAY');
    expect(alarm).toContain(`TRIGGER:${CALENDAR_ALARM}`);
    // Apple drops a DISPLAY alarm with no description
    expect(alarm.some((l) => l.startsWith('DESCRIPTION:'))).toBe(true);
  });

  it('says what it is, and how to get back to the deal', () => {
    expect(valueOf(ics, 'SUMMARY')).toBe(escapeText(CALENDAR.summary('Viewing', 'Terraced · CF37 1HR · £120,000')));
    expect(valueOf(ics, 'DESCRIPTION')).toBe(escapeText(CALENDAR.openDeal(URL_TO_DEAL)));
  });
});

describe('the text rules nobody sees until they break', () => {
  it('escapes the four characters that would otherwise split a value', () => {
    expect(escapeText('a,b;c\\d')).toBe(['a', String.raw`\,`, 'b', String.raw`\;`, 'c', String.raw`\\`, 'd'].join(''));
    expect(escapeText('one\ntwo')).toBe('one\\ntwo');
    expect(escapeText('http://x/y'), 'a colon is literal in a TEXT value').toBe('http://x/y');
  });

  it('folds long lines without splitting a character in half', () => {
    // every deal title carries · and £, which are multi-byte
    const long = `SUMMARY:${'£'.repeat(60)}·${'a'.repeat(40)}`;
    const folded = fold(long);
    for (const line of folded.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // unfolding gives back exactly what went in
    expect(folded.split('\r\n').map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(long);
  });

  it('a title full of punctuation survives the round trip', () => {
    const ics = build(deal({ title: 'Flat 2, Bryn; House \\ CF37 1HR' }));
    expect(valueOf(ics, 'SUMMARY')).toContain(String.raw`Flat 2\, Bryn\; House \\ CF37 1HR`);
  });
});

describe('which dates go, and which do not', () => {
  it('exports every date the deal holds that still applies to it', () => {
    const d = deal({ stage: 'offer-accepted', viewing_date: '2026-09-24', chase_date: '2026-10-01', exchange_date: '2026-11-02' });
    const keys = eventsForDeal(d, { url: URL_TO_DEAL, host: HOST }).map((e) => e.key);
    // the viewing is behind it now, so it is not exported — the same one rule
    // the card and the today line use
    expect(keys).toEqual(['chase_date', 'exchange_date']);
  });

  it('never exports an auction date on a deal that is not an auction', () => {
    const d = deal({ auction_date: '2026-09-30', is_auction: false });
    expect(eventsForDeal(d, { url: URL_TO_DEAL, host: HOST }).map((e) => e.key)).not.toContain('auction_date');
    expect(eventsForDeal({ ...d, is_auction: true }, { url: URL_TO_DEAL, host: HOST }).map((e) => e.key)).toContain('auction_date');
  });

  it('a deal you KILLED exports nothing — it does not belong in your calendar', () => {
    const dead = deal({ status: 'dead', stage: 'parked-dead', chase_date: '2026-10-01', viewing_date: null });
    expect(hasExportableDate(dead)).toBe(false);
    expect(eventsForDeal(dead, { url: URL_TO_DEAL, host: HOST })).toEqual([]);
    expect(build(dead)).toBe('');
    // nor one you have already bought: those dates are behind you
    const bought = deal({ status: 'done', stage: 'bought-it', chase_date: '2026-10-01', viewing_date: null });
    expect(hasExportableDate(bought)).toBe(false);
  });

  it('a deal with no usable date builds NO file — never an empty calendar', () => {
    const bare = deal({ viewing_date: null });
    expect(hasExportableDate(bare)).toBe(false);
    expect(build(bare)).toBe('');
    expect(hasExportableDate(deal())).toBe(true);
  });

  it('gives each date its own stable id, so re-importing updates instead of doubling', () => {
    const d = deal({ chase_date: '2026-10-01' });
    const first = eventsForDeal(d, { url: URL_TO_DEAL, host: HOST }).map((e) => e.uid);
    const again = eventsForDeal(d, { url: URL_TO_DEAL, host: HOST }).map((e) => e.uid);
    expect(first).toEqual(again);
    expect(new Set(first).size).toBe(first.length);
  });

  it('ignores a date that is not a date', () => {
    expect(hasExportableDate(deal({ viewing_date: 'soon' }))).toBe(false);
  });
});

describe('the auction event carries the number people forget', () => {
  const auction = deal({ stage: 'offer-in', is_auction: true, auction_date: '2026-09-30', viewing_date: null });

  it('states the cash needed, and whose figures they are', () => {
    const ics = buildIcs(
      eventsForDeal(auction, { url: URL_TO_DEAL, host: HOST, cashNeeded: 46500, auctionFeesIn: false }),
      NOW, CALENDAR.prodId('PropLaunch'),
    );
    const description = valueOf(ics, 'DESCRIPTION') ?? '';
    expect(description).toContain(escapeText(CALENDAR.cash('£46,500')));
    expect(description).toContain(escapeText(CALENDAR.feesOut));
  });

  it('says when the fees ARE in the number', () => {
    const events = eventsForDeal(auction, { url: URL_TO_DEAL, host: HOST, cashNeeded: 49700, auctionFeesIn: true });
    expect(events[0].description.join(' ')).toContain(CALENDAR.feesIn);
    expect(events[0].description.join(' ')).not.toContain(CALENDAR.feesOut);
  });

  it('says NOTHING about cash when the deal does not hold a figure', () => {
    for (const cash of [null, undefined, 0]) {
      const events = eventsForDeal(auction, { url: URL_TO_DEAL, host: HOST, cashNeeded: cash });
      expect(events[0].description.join(' ')).not.toContain('Cash needed');
    }
  });

  it('and never puts cash on a viewing or a chase', () => {
    const d = deal({ stage: 'going-to-view', chase_date: '2026-10-01' });
    const events = eventsForDeal(d, { url: URL_TO_DEAL, host: HOST, cashNeeded: 46500 });
    for (const e of events) expect(e.description.join(' ')).not.toContain('Cash needed');
  });
});

describe('the file name', () => {
  it('is the deal, in plain ASCII every operating system accepts', () => {
    expect(icsFilename('Terraced · CF37 1HR · £120,000')).toBe('terraced-cf37-1hr-120-000.ics');
    expect(icsFilename('   ')).toBe('deal.ics');
    expect(icsFilename('x'.repeat(200)).length).toBeLessThanOrEqual(64);
  });

  it('(and the P9 reason list still has the chain break the operator asked for)', () => {
    expect(parkReason('chain-fell')?.label).toBe('Chain fell through');
  });
});
