// @vitest-environment happy-dom
/**
 * THE KILL AND THE WAY BACK (P9), through the board itself.
 *
 * Two taps kill a deal — the note is optional and never in the way — and what
 * comes back from the server is what the headstone shows. The change line's
 * "Park it" is the same kill with the reason already chosen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, h } from 'preact';
import { act } from 'preact/test-utils';
import { DealBoard } from './DealBoard';
import { BOARD_COPY, CHANGE_COPY, GRAVEYARD_COPY, PARK_REASONS, parkReason } from '../../config/pipeline';
import { features } from '../../config/features';
import { resetMe } from '../../lib/auth/session';
import { buildDeathSnapshot } from '../../lib/deals/graveyard';

const ID = '11111111-1111-4111-8111-111111111111';
const PARAMS = 'postcode=CF37+1HR&price=200000&rent=1200&refurbCost=20000';
const deal = (over: Record<string, unknown> = {}) => ({
  id: ID, strategy: 'btl', title: '12 Test Street', url_params: PARAMS, stage: 'offer-in',
  current_score: 7.2, status: 'live', headline_figure: 'ROI 8%', key_figure: 'ROI 8%',
  stage_since: '2026-09-01T00:00:00Z', is_auction: false, verdict_line: 'Cashflows.',
  updated_at: '2026-09-01T00:00:00Z', sold_evidence: 'null', ...over,
});

const snapshot = buildDeathSnapshot(
  { ...deal(), current_score: 7.2, verdict_line: 'Cashflows.' } as never,
  [],
);
const deathRow = (over: Record<string, unknown> = {}) => ({
  id: 'x1', deal_id: ID, reason_key: 'refurb-too-high', note: '',
  snapshot_json: JSON.stringify(snapshot), at: '2026-09-04T09:00:00Z', revived_at: null, ...over,
});

let host: HTMLDivElement;
let posts: { url: string; body: Record<string, unknown> }[];

const mount = async (deals: Record<string, unknown>[], extra: Record<string, unknown> = {}) => {
  posts = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push({ url: String(url), body: JSON.parse(String(init.body ?? '{}')) as Record<string, unknown> });
      if (String(url).endsWith('/dead')) return { ok: true, status: 200, json: async () => ({ ok: true, death: deathRow() }) };
      if (String(url).endsWith('/revive')) return { ok: true, status: 200, json: async () => ({ ok: true, stage: 'offer-in', status: 'live' }) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    return {
      ok: true,
      json: async () => (String(url).includes('/api/me')
        ? { email: 'u1@t.test', name: 'T', avatar: '', marketingConsent: false }
        : { pipeline: true, deals, facts: [], changes: [], deaths: [], liveCount: 1, cap: 100, ...extra }),
    };
  }));
  await act(async () => { render(h(DealBoard, null), host); });
  for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); });
};

const click = async (el: Element | null | undefined) => {
  expect(el, 'the control must exist').toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); });
  for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); });
};
const byText = (text: string): HTMLElement | undefined =>
  Array.from(host.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim().startsWith(text));

beforeEach(() => {
  features.dealPipeline = true;
  features.dealFacts = true;
  features.dealGraveyard = true;
  features.verdictChanges = true;
  resetMe();
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  render(null, host);
  host.remove();
  vi.unstubAllGlobals();
});

describe('killing a deal from the board', () => {
  it('is two taps: Park, then the reason — and the note never gets in the way', async () => {
    await mount([deal()]);
    await click(byText(BOARD_COPY.card.park));
    // every reason is on offer, and the note is optional
    for (const r of PARK_REASONS) expect(byText(r.label), r.label).toBeTruthy();
    const note = host.querySelector('.dc-kill-note input') as HTMLInputElement;
    expect(note).toBeTruthy();
    expect(note.required).toBe(false);

    await click(byText(parkReason('refurb-too-high')!.label));
    expect(posts.map((p) => p.url)).toEqual([`/api/deals/${ID}/dead`]);
    expect(posts[0].body).toEqual({ reason_key: 'refurb-too-high', note: '' });
  });

  it('carries the one line you typed', async () => {
    await mount([deal()]);
    await click(byText(BOARD_COPY.card.park));
    const note = host.querySelector('.dc-kill-note input') as HTMLInputElement;
    await act(async () => {
      note.value = 'Quote came back at twice my guess';
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(byText(parkReason('survey')!.label));
    expect(posts[0].body).toEqual({ reason_key: 'survey', note: 'Quote came back at twice my guess' });
  });

  it('says what happened where the deal has GONE, and shows the frozen headstone', async () => {
    await mount([deal()]);
    await click(byText(BOARD_COPY.card.park));
    await click(byText(parkReason('refurb-too-high')!.label));
    // the confirmation is on the board, not on a card that has left it
    expect(host.textContent).toContain(BOARD_COPY.card.parked(parkReason('refurb-too-high')!.label));
    expect(host.querySelector('.graveyard .board-col-n')?.textContent).toBe('1');
    await click(host.querySelector('.board-parked-toggle'));
    expect(host.textContent).toContain(GRAVEYARD_COPY.lead);
    expect(host.textContent).toContain('7.2'); // the score it died on, from the server's snapshot
  });

  it('the change line’s "Park it" is the same kill, with the reason already chosen', async () => {
    const change = {
      id: 'c1', deal_id: ID, fact_type: 'builder-quote', fact_value: 48000, previous_value: 20000,
      from_score: 7.2, to_score: 4.1, to_verdict_line: 'The quote eats the margin', at: '2026-09-04T09:00:00Z',
      acknowledged_at: null,
    };
    await mount([deal()], { changes: [change] });
    await click(byText(CHANGE_COPY.killPark));
    const dead = posts.find((p) => p.url.endsWith('/dead'));
    expect(dead?.body).toEqual({ reason_key: CHANGE_COPY.killReasonKey, note: '' });
    expect(parkReason(CHANGE_COPY.killReasonKey), 'the pre-filled reason is a real chip').toBeTruthy();
  });
});

describe('when a kill does not save', () => {
  it('puts the deal back, reopens the sheet, and keeps the line you typed', async () => {
    await mount([deal()]);
    // the write fails from here on
    const failing = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => ({ pipeline: true, deals: [deal()], facts: [], changes: [], deaths: [], liveCount: 1, cap: 100 }) };
    });
    vi.stubGlobal('fetch', failing);
    await click(byText(BOARD_COPY.card.park));
    const note = host.querySelector('.dc-kill-note input') as HTMLInputElement;
    await act(async () => {
      note.value = 'Quote came back at twice my guess';
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(byText(parkReason('survey')!.label));
    expect(host.textContent).toContain(BOARD_COPY.card.parkFailed);
    expect(host.querySelector(`#deal-${ID}`), 'the deal is back on the board').toBeTruthy();
    const again = host.querySelector('.dc-kill-note input') as HTMLInputElement;
    expect(again, 'the sheet is open again').toBeTruthy();
    expect(again.value, 'with the words still in it').toBe('Quote came back at twice my guess');
  });
});

describe('bringing one back', () => {
  it('re-scores it against today’s rules and puts it back on the board', async () => {
    await mount([deal({ status: 'dead', stage: 'parked-dead' })], { deaths: [deathRow()] });
    await click(host.querySelector('.board-parked-toggle'));
    await click(byText(GRAVEYARD_COPY.revive));
    const back = posts.find((p) => p.url.endsWith('/revive'));
    expect(back, 'it asks the server, and sends the re-score with it').toBeTruthy();
    expect(typeof back?.body.score).toBe('number');
    expect(host.textContent).toContain(GRAVEYARD_COPY.revived('Offer in'));
    // the headstone is gone and the deal is back in its column
    expect(host.querySelector('.graveyard .board-col-n')?.textContent).toBe('0');
    expect(host.querySelector(`#deal-${ID}`)).toBeTruthy();
  });
});

describe('with the graveyard switched off', () => {
  it('the board is exactly P4 again: the parked list, no note, no way back', async () => {
    features.dealGraveyard = false;
    await mount([deal({ status: 'dead', stage: 'parked-dead' })], { deaths: [] });
    expect(host.querySelector('.graveyard')).toBeNull();
    expect(host.textContent).not.toContain(GRAVEYARD_COPY.lead);
    expect(host.textContent).not.toContain(GRAVEYARD_COPY.revive);
  });
});
