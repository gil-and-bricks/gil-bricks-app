import { describe, expect, it } from 'vitest';
import { features } from '../../config/features';
import { withFlags } from '../../testing/flags';
import {
  cardFigure, parkedDeals, scoreClass, stageColumns,
  daysInStage, dwellState, nextStepLine, stageMeta, cardVerdict, missingRequiredInput, boardCounts, counterLine, type BoardDeal,
} from './board';

// The card verdict only speaks when the Deal Score is on (A1).
withFlags({ dealScore: true });

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
  verdict_line: o.verdict_line === undefined ? 'Just 6.5% back, short of the 12% you set' : o.verdict_line,
  updated_at: o.updated_at ?? '2026-01-01T00:00:00Z',
  chase_date: o.chase_date ?? null,
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

describe('nextStepLine — an instruction (a verb), not a description', () => {
  it('leads with the stage verb and says how long it has sat', () => {
    expect(nextStepLine(mk({ stage: 'going-to-view', stage_since: daysAgo(3) }), NOW)).toBe('Book the viewing, or bin it — 3 days sat here');
    expect(nextStepLine(mk({ stage: 'going-to-view', stage_since: daysAgo(1) }), NOW)).toBe('Book the viewing, or bin it — 1 day sat here');
    expect(nextStepLine(mk({ stage: 'offer-in', stage_since: daysAgo(9) }), NOW)).toBe('Chase the agent on your offer — 9 days, no update');
    expect(nextStepLine(mk({ stage: 'offer-in', stage_since: daysAgo(12) }), NOW)).toBe('Chase the agent on your offer — 12 days, gone cold');
  });
  it('is empty for a terminal deal (nothing to do)', () => {
    expect(nextStepLine(mk({ stage: 'bought-it', status: 'done' }), NOW)).toBe('');
  });
});

describe('missingRequiredInput — names the input a deal needs before it can score', () => {
  it('flags a missing price for any strategy', () => {
    expect(missingRequiredInput('btl', 'postcode=CF37+1HR')).toBe('a price');
  });
  it('flags a missing rent for BTL/BRRRR, a room rent for HMO', () => {
    expect(missingRequiredInput('btl', 'price=150000')).toBe('a rent');
    expect(missingRequiredInput('brrrr', 'price=150000')).toBe('a rent');
    expect(missingRequiredInput('hmo', 'price=150000')).toBe('a room rent');
  });
  it('is scoreable (null) when the required inputs are present; flip needs only a price (gdv pre-fills)', () => {
    expect(missingRequiredInput('btl', 'price=150000&rent=1100')).toBeNull();
    expect(missingRequiredInput('hmo', 'price=85000&roomRent=350')).toBeNull();
    expect(missingRequiredInput('flip', 'price=150000')).toBeNull();
  });
  it('never promises a score for a sui-generis (7+ room) HMO the analyser refuses to score', () => {
    expect(missingRequiredInput('hmo', 'price=85000&roomRent=350&rooms=7plus')).toBe('a smaller HMO (6 rooms or fewer)');
  });
});

describe('cardVerdict — a verdict or an honest reason, never a bare dash', () => {
  it('a scored deal shows the analyser reason line + its colour', () => {
    const v = cardVerdict(mk({ current_score: 5.2, verdict_line: 'Just 6.5% back, short of the 12% you set' }));
    expect(v).toEqual({ scored: true, cls: 'ds-walk', line: 'Just 6.5% back, short of the 12% you set', action: 'none' });
  });
  it('a scored deal with no stored reason falls back to the figure (still a verdict, no dash)', () => {
    const v = cardVerdict(mk({ current_score: 8.4, verdict_line: null, headline_figure: '£312/mo' }));
    expect(v).toEqual({ scored: true, cls: 'ds-good', line: '£312/mo', action: 'none' });
  });
  it('an unscored but SCOREABLE live deal offers a one-tap score — never a dash', () => {
    const v = cardVerdict(mk({ current_score: null, verdict_line: null, url_params: 'postcode=CF37+1HR&price=150000&rent=1100' }));
    expect(v).toEqual({ scored: false, cls: 'ds-none', line: 'Tap to score this', action: 'score' });
  });
  it('an existing comps deal never promises a score that no page can produce', () => {
    const v = cardVerdict(mk({ strategy: 'comparables', current_score: null, verdict_line: null, headline_figure: '', key_figure: 'typical £120,000', url_params: 'postcode=CF37+1HR&price=120000' }));
    expect(v).toEqual({ scored: false, cls: 'ds-none', line: 'typical £120,000', action: 'none' });
  });
  it('an unscored deal MISSING an input names it', () => {
    const v = cardVerdict(mk({ current_score: null, verdict_line: null, url_params: 'postcode=CF37+1HR&price=150000' }));
    expect(v).toEqual({ scored: false, cls: 'ds-none', line: 'Add a rent to score this', action: 'add' });
  });
  it('with the Deal Score switched off, cards never beg for a score that cannot happen', () => {
    // withFlags' beforeEach puts dealScore back on for the next test, and its
    // afterAll restores the file's real snapshot — no hand-rolled restore.
    features.dealScore = false;
    const v = cardVerdict(mk({ current_score: null, verdict_line: null, url_params: 'postcode=CF37+1HR&price=150000&rent=1100', headline_figure: '£312/mo' }));
    expect(v).toEqual({ scored: false, cls: 'ds-none', line: '£312/mo', action: 'none' });
  });
  it('a terminal unscored deal shows its figure quietly, no prompt', () => {
    const v = cardVerdict(mk({ current_score: null, verdict_line: null, status: 'done', stage: 'bought-it', headline_figure: 'ROI 6.5%' }));
    expect(v).toEqual({ scored: false, cls: 'ds-none', line: 'ROI 6.5%', action: 'none' });
  });
});

describe('boardCounts + counterLine — the four combinations', () => {
  const live = mk({ status: 'live', stage: 'offer-in' });
  const bought = mk({ status: 'done', stage: 'bought-it' });
  const dead = mk({ status: 'dead', stage: 'parked-dead' });
  it('nothing at all', () => {
    expect(boardCounts([])).toEqual({ live: 0, done: 0, dead: 0, isEmpty: true });
  });
  it('only live', () => {
    expect(counterLine(boardCounts([live, live]), 100)).toBe('2 of 100 live');
  });
  it('only terminal — a bought-only board reads as a result, never "0 of 100 live" alone', () => {
    const c = boardCounts([bought]);
    expect(c).toEqual({ live: 0, done: 1, dead: 0, isEmpty: false });
    expect(counterLine(c, 100)).toBe('0 of 100 live · 1 bought');
  });
  it('both', () => {
    expect(counterLine(boardCounts([live, bought, dead]), 100)).toBe('1 of 100 live · 1 bought · 1 parked');
  });
});

/* The today line moved to urgency.ts in P8 — its ranking now reads unread
   changes and evidence as well as dwell. Tested in urgency.test.ts. */

describe('stageMeta', () => {
  it('exposes the config dwell + copy, and never throws on an unknown key', () => {
    expect(stageMeta('offer-in').dwellNormalDays).toBe(4);
    expect(stageMeta('nonsense').key).toBe('worth-a-look'); // safe fallback to initial
  });
});
