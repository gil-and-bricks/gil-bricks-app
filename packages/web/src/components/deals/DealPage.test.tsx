// @vitest-environment happy-dom
/**
 * X2 — THE DEAL'S OWN PAGE, and the uniform cards that made it necessary.
 *
 * The board is a glance. Everything that used to make no two cards the same
 * height lives here now — so this proves both halves: that the page shows what
 * moved to it, and that the card no longer does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, h } from 'preact';
import { act } from 'preact/test-utils';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DealPage, dealIdFromUrl, findingCodesOf } from './DealPage';
import { DealBoard } from './DealBoard';
import { FINDING_COPY, FINDINGS_COPY } from '@gil-bricks/core';
import { features } from '../../config/features';
import { resetMe } from '../../lib/auth/session';

const ID = '11111111-1111-4111-8111-111111111111';

const deal = (over: Record<string, unknown> = {}) => ({
  id: ID, strategy: 'btl', title: '12 Test Street',
  url_params: 'postcode=CF37+1HR&price=200000&rent=1200&finds=LEASE+NOCT',
  stage: 'worth-a-look', current_score: 7.2, status: 'live',
  headline_figure: 'ROI 8%', key_figure: 'ROI 8%', stage_since: '2026-09-01T00:00:00Z',
  is_auction: false, verdict_line: 'Cashflows.', updated_at: '2026-09-01T00:00:00Z',
  sold_evidence: '{"estimate":210000,"high":230000}', ...over,
});

let host: HTMLDivElement;
const mountPage = async (d: Record<string, unknown> | null, search = `?id=${ID}`) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true, status: 200,
    json: async () => (String(url).includes('/api/me')
      ? { email: 'u1@t.test', name: 'T', avatar: '', marketingConsent: false }
      : { pipeline: true, deals: d ? [d] : [], facts: [], liveCount: d ? 1 : 0, cap: 100 }),
  })));
  window.history.replaceState(null, '', `/deals/deal/${search}`);
  await act(async () => { render(h(DealPage, null), host); });
  for (let i = 0; i < 12; i += 1) await act(async () => { await Promise.resolve(); });
};

const mountBoard = async (d: Record<string, unknown>) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true, status: 200,
    json: async () => (String(url).includes('/api/me')
      ? { email: 'u1@t.test', name: 'T', avatar: '', marketingConsent: false }
      : { pipeline: true, deals: [d], facts: [], liveCount: 1, cap: 100 }),
  })));
  await act(async () => { render(h(DealBoard, null), host); });
  for (let i = 0; i < 12; i += 1) await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  features.dealPipeline = true;
  features.dealFacts = true;
  resetMe();
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => { render(null, host); host.remove(); vi.unstubAllGlobals(); });

describe('reading the deal it was asked for', () => {
  it('takes the id from its own address', () => {
    expect(dealIdFromUrl('?id=abc')).toBe('abc');
    expect(dealIdFromUrl('?id=')).toBe('');
    expect(dealIdFromUrl(''), 'no id is not a crash').toBe('');
  });

  it('reads the findings out of the deal’s own saved params', () => {
    expect(findingCodesOf({ url_params: 'price=1&finds=LEASE+NOCT' } as never)).toBe('LEASE NOCT');
    expect(findingCodesOf({ url_params: 'price=1' } as never), 'a deal with none').toBeNull();
    expect(findingCodesOf(null)).toBeNull();
  });

  it('says so plainly when there is no such deal, rather than showing an empty page', async () => {
    await mountPage(null);
    expect(host.textContent).toContain('could not find that deal');
  });
});

describe('what the deal page shows', () => {
  it('the address, the score and the verdict', async () => {
    await mountPage(deal());
    expect(host.textContent).toContain('12 Test Street');
    expect(host.textContent).toContain('7.2');
    expect(host.textContent).toContain('Cashflows.');
  });

  /** The reason this page exists in this sprint. */
  it('what the listing said, grouped under two plain headings', async () => {
    await mountPage(deal());
    expect(host.textContent).toContain(FINDINGS_COPY.riskHeading);
    expect(host.textContent).toContain(FINDINGS_COPY.gapHeading);
    expect(host.textContent, 'LEASE is a risk').toContain(FINDING_COPY.LEASE.label);
    expect(host.textContent, 'NOCT is a question for the agent').toContain(FINDING_COPY.NOCT.label);
    expect(host.textContent, 'and each carries its one line').toContain(FINDING_COPY.LEASE.why);
  });

  /** Silence is not an all clear — the same law as the panel and the chips. */
  it('a deal with no findings says so, and says it is not an all clear', async () => {
    await mountPage(deal({ url_params: 'postcode=CF37+1HR&price=200000' }));
    expect(host.textContent).toContain(FINDINGS_COPY.none);
    expect(host.textContent).toContain(FINDINGS_COPY.noneWhy);
  });

  it('a risk and a gap are told apart by a heading, never by colour alone', async () => {
    await mountPage(deal());
    // The tone classes come from core's own table — pink and yellow, the same
    // two the chips use on the portal's page.
    const risk = host.querySelector('.df-pink');
    const gap = host.querySelector('.df-yellow');
    expect(risk, 'the risk group must actually carry a tone class').not.toBeNull();
    expect(gap).not.toBeNull();
    expect(risk?.querySelector('.df-head')?.textContent).toBe(FINDINGS_COPY.riskHeading);
    expect(gap?.querySelector('.df-head')?.textContent).toBe(FINDINGS_COPY.gapHeading);
  });

  it('offers the way on to the analyser and the way back to the board', async () => {
    await mountPage(deal());
    const hrefs = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.startsWith('/buy-to-let/analyser'))).toBe(true);
    expect(hrefs).toContain('/deals');
  });
});

/**
 * THE CARD IS A GLANCE. Everything below used to be ON it, and each one is why
 * no two cards were the same height.
 */
describe('the board card carries none of it any more', () => {
  it('shows the address, the score, the verdict and the next step — and links to the deal', async () => {
    await mountBoard(deal());
    const card = host.querySelector('.deal-card')!;
    expect(card.querySelector('.dc-title')?.textContent).toBe('12 Test Street');
    expect(card.querySelector('.board-score')?.textContent).toContain('7.2');
    expect(card.querySelector('.dc-verdict')?.textContent).toContain('Cashflows.');
    expect(card.querySelector('.dc-title')?.getAttribute('href'), 'the card opens the deal’s page')
      .toBe(`/deals/deal/?id=${ID}`);
  });

  it.each([
    ['the recorded facts', '.deal-facts, .df-facts, [data-facts]'],
    ['the evidence chips', '.ev-chips'],
    ['the dates', '.dd-dates, .deal-dates'],
    ['the score history', '.score-history'],
  ])('no longer carries %s', async (_what, sel) => {
    await mountBoard(deal());
    expect(host.querySelector('.deal-card')?.querySelector(sel)).toBeNull();
  });

  it('carries no findings — they are a read, not a glance', async () => {
    await mountBoard(deal());
    const card = host.querySelector('.deal-card')!;
    expect(card.textContent).not.toContain(FINDING_COPY.LEASE.label);
    expect(card.textContent).not.toContain(FINDINGS_COPY.riskHeading);
  });
});

/**
 * THE HEIGHT IS FIXED, NOT MINIMUM. A minimum is not a promise: one long
 * verdict line and the card is taller than its neighbour again, which is the
 * whole thing this sprint set out to stop.
 */
describe('every card is the same size', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'styles', 'analyser.css'), 'utf8');
  const block = css.slice(css.indexOf('.deal-card {'), css.indexOf('.deal-card:hover'));

  it('declares a fixed height, not a minimum', () => {
    expect(block, 'a min-height still lets a long card grow').toMatch(/(^|\s)height:\s*[\d.]+rem/);
    expect(block).not.toMatch(/min-height:/);
  });

  it('and hides anything that would overflow it rather than growing', () => {
    expect(block).toMatch(/overflow:\s*hidden/);
  });

  /** The two lines that can run long are the two that are clamped. */
  it('clamps every line that can run long, so none of them can change the height', () => {
    expect(css).toMatch(/\.deal-card \.dc-verdict \{[^}]*line-clamp/);
    expect(css).toMatch(/\.deal-card \.dc-step \{[^}]*line-clamp/);
    // The ADDRESS too: it used to reserve two lines and let a longer one run
    // on, which with a fixed height ran it straight into the score beneath.
    expect(css).toMatch(/\.dc-title \{[^}]*line-clamp/);
  });

  it('the notices that used to grow the cards now sit above the board', () => {
    expect(css).toMatch(/\.board-notices \{/);
    const board = readFileSync(join(process.cwd(), 'src', 'components', 'deals', 'DealBoard.tsx'), 'utf8');
    const cardStart = board.indexOf('class={`deal-card glass');
    const cardEnd = board.indexOf('return (\n    <div class="board">');
    const cardJsx = board.slice(cardStart, cardEnd);
    for (const gone of ['DealChangeNote', 'ChainRiskCard', 'RetradeRadar', 'EvidenceChips', 'DealFacts', 'DealDates']) {
      expect(cardJsx, `${gone} is still inside the card`).not.toContain(gone);
    }
    // …and they are still rendered SOMEWHERE, with their actions intact.
    for (const kept of ['DealChangeNote', 'ChainRiskCard', 'RetradeRadar']) {
      expect(board, `${kept} lost its home entirely`).toContain(`<${kept}`);
    }
  });
});
