import { describe, expect, it } from 'vitest';
import { cardFigure, parkedDeals, scoreClass, stageColumns, type BoardDeal } from './board';

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
  updated_at: o.updated_at ?? '2026-01-01T00:00:00Z',
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
