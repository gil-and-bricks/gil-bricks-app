// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { h } from 'preact';
import { DealPage } from './DealPage';
import { BOARD_COPY } from '../../config/pipeline';
import { features } from '../../config/features';
import { resetMe } from '../../lib/auth/session';

/**
 * THE ONE LINE THAT MUST NOT LIE (P5.1). A deal saved before we kept the sold
 * prices behind its score cannot be re-scored on the same evidence, so it says
 * so — whether or not it has facts, and until it is saved again. A deal that
 * KNOWS it had no comparables (the string 'null') says nothing, because nothing
 * about its score is uncertain.
 *
 * X2 MOVED IT, IT DID NOT DELETE IT. The line used to sit on the board card,
 * and was one of the blocks that made no two cards the same height. It now
 * lives on the deal's own page, so this drives THAT surface — the guarantee is
 * unchanged and every case below is the one it always was.
 */
const deal = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111', strategy: 'btl', title: '12 Test Street',
  url_params: 'postcode=CF37+1HR&price=200000&rent=1200', stage: 'worth-a-look',
  current_score: 7.2, status: 'live', headline_figure: 'ROI 8%', key_figure: 'ROI 8%',
  stage_since: '2026-09-01T00:00:00Z', is_auction: false, verdict_line: 'Cashflows.',
  updated_at: '2026-09-01T00:00:00Z', ...over,
});

const DEAL_ID = '11111111-1111-4111-8111-111111111111';
let host: HTMLDivElement;
const mount = async (d: Record<string, unknown>, facts: unknown[] = []) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes('/api/me')
      ? { email: 'u1@t.test', name: 'T', avatar: '', marketingConsent: false }
      : { pipeline: true, deals: [d], facts, liveCount: 1, cap: 100 }),
  })));
  // The page reads the id it was asked for out of its own address.
  window.history.replaceState(null, '', `/deals/deal/?id=${DEAL_ID}`);
  await act(async () => { render(h(DealPage, null), host); });
  for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  features.dealPipeline = true;
  features.dealFacts = true;
  resetMe();
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  render(null, host);
  host.remove();
  vi.unstubAllGlobals();
});

const LINE = BOARD_COPY.card.factNoEvidence;

describe('a deal whose sold prices were never stored', () => {
  it('says so with no facts on it at all', async () => {
    await mount(deal({ sold_evidence: null }));
    expect(host.textContent).toContain(LINE);
  });

  it('still says so after its last fact is removed — the drift did not leave with it', async () => {
    await mount(deal({ sold_evidence: undefined }));
    expect(host.textContent).toContain(LINE);
  });

  it('says nothing when the deal knows it had no comparables', async () => {
    await mount(deal({ sold_evidence: 'null' }));
    expect(host.textContent).not.toContain(LINE);
  });

  it('says nothing when the band was stored', async () => {
    await mount(deal({ sold_evidence: '{"estimate":210000,"high":230000}' }));
    expect(host.textContent).not.toContain(LINE);
  });

  it('says nothing on a deal that has no score to be uncertain about', async () => {
    await mount(deal({ sold_evidence: null, current_score: null, verdict_line: null }));
    expect(host.textContent).not.toContain(LINE);
  });
});
