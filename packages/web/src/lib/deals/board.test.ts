import { describe, expect, it } from 'vitest';
import {
  cardFigure, parkedDeals, scoreClass, stageColumns,
  daysInStage, dwellState, nextStepLine, todayLine, stageMeta, type BoardDeal,
} from './board';

const NOW = Date.parse('2026-09-03T12:00:00Z');
const daysAgo = (n: number): string => new Date(NOW - n * 86_400_000).toISOString();

const mk = (o: Partial<BoardDeal>): BoardDeal => ({
  id: o.id ?? crypto.randomUUID(),
  strategy: o.strategy ?? 'btl',
  title: o.title ?? 'A · CF37 1HR · £150,000',
  url_params: o.url_params ?? 'postcode=CF37+1HR&price=150000',
  stage: o.stage ?? 'worth-a-look',
  current_score: o.current_score === undefined ? 7 : o.current_score,
  status: o.status ?? 'live',
  headline_figure: o.headline_figure === undefined ? '£250/mo' : o.headline_figure,
  key_figure: o.key_figure ?? 'ROI 6%',
  stage_since: o.stage_since ?? daysAgo(0),
  is_auction: o.is_auction ?? false,
  updated_at: o.updated_at ?? '2026-01-01T00:00:00Z',
  due_date: o.due_date ?? null,
});

describe('stageColumns', () => {
  it('returns the seven progress stages IN ORDER, but only those holding a deal', () => {
    const cols = stageColumns([
      mk({ stage: 'offer-in' }),
      mk({ stage: 'worth-a-look' }),
      mk({ stage: 'worth-a-look' }),
      mk({ stage: 'bought-it', status: 'done' }),
    ]);
    expect(cols.map((c) => c.stage.key)).toEqual(['worth-a-look', 'offer-in', 'bought-it']);
    expect(cols.find((c) => c.stage.key === 'worth-a-look')!.deals).toHaveLength(2);
    // every column carries its editable display label from config
    expect(cols[0].stage.label).toBe('Worth a look');
  });

  it('omits empty stages so a near-empty board never renders columns of nothing', () => {
    const cols = stageColumns([mk({ stage: 'worth-a-look' })]);
    expect(cols).toHaveLength(1);
    expect(cols[0].stage.key).toBe('worth-a-look');
  });

  it('never puts dead/parked deals on the live board', () => {
    const cols = stageColumns([mk({ stage: 'parked-dead', status: 'dead' }), mk({ stage: 'going-to-view' })]);
    expect(cols.map((c) => c.stage.key)).toEqual(['going-to-view']);
  });
});

describe('parkedDeals', () => {
  it('collects dead/parked deals only', () => {
    const parked = parkedDeals([
      mk({ id: 'a', stage: 'parked-dead', status: 'dead' }),
      mk({ id: 'b', stage: 'worth-a-look', status: 'live' }),
    ]);
    expect(parked.map((d) => d.id)).toEqual(['a']);
  });
});

describe('cardFigure', () => {
  it('prefers the stored board figure', () => {
    expect(cardFigure(mk({ headline_figure: '£250/mo', key_figure: 'ROI 6%' }))).toBe('£250/mo');
  });
  it('falls back to key_figure for migrated/older deals with no board figure', () => {
    expect(cardFigure(mk({ headline_figure: null, key_figure: 'ROI 6%' }))).toBe('ROI 6%');
    expect(cardFigure(mk({ headline_figure: '  ', key_figure: 'ROI 6%' }))).toBe('ROI 6%');
  });
});

describe('scoreClass — matches the analyser DealScore thresholds exactly', () => {
  it('green ≥8, amber ≥6, red <6, none for null', () => {
    expect(scoreClass(9)).toBe('ds-good');
    expect(scoreClass(8)).toBe('ds-good');
    expect(scoreClass(7.9)).toBe('ds-marginal');
    expect(scoreClass(6)).toBe('ds-marginal');
    expect(scoreClass(5.9)).toBe('ds-walk');
    expect(scoreClass(0)).toBe('ds-walk');
    expect(scoreClass(null)).toBe('ds-none');
    expect(scoreClass(Number.NaN)).toBe('ds-none');
  });
});

describe('daysInStage', () => {
  it('floors whole days since stage entry, never negative', () => {
    expect(daysInStage(mk({ stage_since: daysAgo(9) }), NOW)).toBe(9);
    expect(daysInStage(mk({ stage_since: daysAgo(0) }), NOW)).toBe(0);
    expect(daysInStage(mk({ stage_since: new Date(NOW + 5 * 86_400_000).toISOString() }), NOW)).toBe(0); // clock skew
    expect(daysInStage(mk({ stage_since: 'not-a-date' }), NOW)).toBe(0);
  });
});

describe('dwellState — stage-aware, never a blanket timer', () => {
  it('the SAME age is fresh in a long-dwell stage but amber/cold in a short one', () => {
    // 8 days: offer-in (normal 4, cold 10) is amber; offer-accepted (normal 21) is still fresh
    expect(dwellState(mk({ stage: 'offer-in', stage_since: daysAgo(8) }), NOW)).toBe('amber');
    expect(dwellState(mk({ stage: 'offer-accepted', stage_since: daysAgo(8) }), NOW)).toBe('fresh');
    // offer-in past its cold threshold
    expect(dwellState(mk({ stage: 'offer-in', stage_since: daysAgo(12) }), NOW)).toBe('cold');
  });
  it('terminal + non-live deals never age', () => {
    expect(dwellState(mk({ stage: 'bought-it', status: 'done', stage_since: daysAgo(400) }), NOW)).toBe('none');
    expect(dwellState(mk({ stage: 'parked-dead', status: 'dead', stage_since: daysAgo(400) }), NOW)).toBe('none');
  });
});

describe('nextStepLine', () => {
  it('states what it is waiting on + how long, with an honest ageing suffix', () => {
    expect(nextStepLine(mk({ stage: 'offer-in', stage_since: daysAgo(9) }), NOW)).toBe('Offer in, no word back · 9 days · no update');
    expect(nextStepLine(mk({ stage: 'going-to-view', stage_since: daysAgo(1) }), NOW)).toBe('Viewing to book · 1 day');
    expect(nextStepLine(mk({ stage: 'offer-in', stage_since: daysAgo(12) }), NOW)).toContain('gone cold');
  });
  it('is empty for a terminal deal', () => {
    expect(nextStepLine(mk({ stage: 'bought-it', status: 'done' }), NOW)).toBe('');
  });
});

describe('todayLine — one deal, one action, honest precedence', () => {
  it('picks the genuinely most urgent across stages (offer-in 9d beats searches 20d)', () => {
    const t = todayLine([
      mk({ id: 'searches', stage: 'offer-accepted', stage_since: daysAgo(20), title: '5 Elm Close' }), // normal 21 → not overdue
      mk({ id: 'offer', stage: 'offer-in', stage_since: daysAgo(9), title: '14 Maple Street' }),        // normal 4 → 2.25x over
      mk({ id: 'fresh', stage: 'worth-a-look', stage_since: daysAgo(1), title: '9 Oak Rd' }),
    ], NOW);
    expect(t.dealId).toBe('offer');
    expect(t.text).toContain('14 Maple Street');
    expect(t.text).toContain('9 days');
  });

  it('a user-set due date outranks dwell (structural tier 1)', () => {
    const t = todayLine([
      mk({ id: 'overdue', stage: 'offer-in', stage_since: daysAgo(20) }),
      mk({ id: 'dated', stage: 'going-to-view', stage_since: daysAgo(1), title: '22 Bryn Road', due_date: daysAgo(0) }),
    ], NOW);
    expect(t.dealId).toBe('dated');
  });

  it('falls to a brand-new unactioned deal when nothing is overdue', () => {
    const t = todayLine([
      mk({ id: 'ok', stage: 'offer-accepted', stage_since: daysAgo(5) }),   // within normal
      mk({ id: 'new', stage: 'worth-a-look', stage_since: daysAgo(2), title: '9 Oak Rd' }), // untouched ≥1d
    ], NOW);
    expect(t.dealId).toBe('new');
    expect(t.text).toContain('9 Oak Rd');
  });

  it('says nothing plainly when all deals are ticking along — no manufactured urgency', () => {
    const t = todayLine([
      mk({ stage: 'offer-accepted', stage_since: daysAgo(3) }),
      mk({ stage: 'getting-real-numbers', stage_since: daysAgo(2) }),
      mk({ stage: 'worth-a-look', stage_since: daysAgo(0) }), // day 0 → not nagged
    ], NOW);
    expect(t.dealId).toBeNull();
    expect(t.text).toBe('Nothing needs you today. 3 deals ticking along.');
  });

  it('ignores dead/done deals entirely', () => {
    const t = todayLine([
      mk({ stage: 'parked-dead', status: 'dead', stage_since: daysAgo(99) }),
      mk({ stage: 'bought-it', status: 'done', stage_since: daysAgo(99) }),
    ], NOW);
    expect(t.dealId).toBeNull();
    expect(t.text).toContain('No live deals');
  });
});

describe('stageMeta', () => {
  it('exposes the config dwell + copy, and never throws on an unknown key', () => {
    expect(stageMeta('offer-in').dwellNormalDays).toBe(4);
    expect(stageMeta('nonsense').key).toBe('worth-a-look'); // safe fallback to initial
  });
});
