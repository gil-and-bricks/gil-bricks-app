/**
 * P12 — THE BOARD'S THREE STRUCTURAL RULES.
 *
 * A deal is in exactly one place; a control is offered only where it leads
 * somewhere; and every stage is reachable. The first two are held here as pure
 * functions. The third is a layout fact and is proved in a real browser
 * (scripts/verify-board — 0px hidden, all 7 stage headings inside the viewport
 * at 320, 390 and 1512); what this file can hold is that the CSS still asks for
 * a layout that cannot push a column off-screen.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appendUnseen, hasScoreHistory, parkedDeals, stageColumns, type BoardDeal } from './board';
import { PROGRESS_STAGES } from '../../config/pipeline';

const deal = (over: Partial<BoardDeal> & { id: string }): BoardDeal => ({
  strategy: 'buy-to-let', title: `deal ${over.id}`, url_params: '', stage: 'worth-a-look',
  current_score: 7, status: 'live', headline_figure: null, key_figure: '', stage_since: '2026-09-01T00:00:00Z',
  is_auction: false, verdict_line: 'fine', updated_at: '2026-09-01T00:00:00Z', ...over,
} as BoardDeal);

describe('a deal is in exactly ONE place on the board', () => {
  it('moving a stage moves the card — it never appears in both', () => {
    const before = stageColumns([deal({ id: 'a' }), deal({ id: 'b', stage: 'offer-in' })]);
    expect(before.find((c) => c.stage.key === 'worth-a-look')?.deals.map((d) => d.id)).toEqual(['a']);

    // the same array after the optimistic move the board performs
    const after = stageColumns([deal({ id: 'a', stage: 'bought-it', status: 'done' }), deal({ id: 'b', stage: 'offer-in' })]);
    expect(after.find((c) => c.stage.key === 'worth-a-look')).toBeUndefined();
    expect(after.find((c) => c.stage.key === 'bought-it')?.deals.map((d) => d.id)).toEqual(['a']);
    // and it is in ONE column across the whole board
    expect(after.flatMap((c) => c.deals.map((d) => d.id)).filter((id) => id === 'a')).toHaveLength(1);
  });

  it('a bought deal is never ALSO in the graveyard', () => {
    const deals = [deal({ id: 'a', stage: 'bought-it', status: 'done' })];
    expect(parkedDeals(deals)).toEqual([]);
    expect(stageColumns(deals).flatMap((c) => c.deals)).toHaveLength(1);
  });

  it('no deal can be in two stage columns, whatever the stage', () => {
    const deals = PROGRESS_STAGES.map((s, i) => deal({ id: `d${i}`, stage: s.key }));
    const ids = stageColumns(deals).flatMap((c) => c.deals.map((d) => d.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('appending a page of rows can never repeat one (the duplication race)', () => {
  it('drops rows the list already holds', () => {
    expect(appendUnseen([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('THE ACTUAL BUG: a board reload landing mid-fetch cannot cause a double', () => {
    // what the click captured
    const captured = [{ id: 'a' }];
    // a visibilitychange reload replaced the list WHILE the page was in flight,
    // and the fresh list already carries 'b'
    const afterReload = [{ id: 'a' }, { id: 'b' }];
    // the page that comes back still contains 'b'
    const page = [{ id: 'b' }, { id: 'c' }];

    // the old code filtered against `captured` and appended to `afterReload`
    const known = new Set(captured.map((x) => x.id));
    const old = [...afterReload, ...page.filter((x) => !known.has(x.id))];
    expect(old.filter((x) => x.id === 'b')).toHaveLength(2); // the duplicate, reproduced

    // de-duping against the list being appended to cannot do that
    const fixed = appendUnseen(afterReload, page);
    expect(fixed.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(new Set(fixed.map((x) => x.id)).size).toBe(fixed.length);
  });

  it('keeps the order it was given and never drops a genuinely new row', () => {
    expect(appendUnseen([{ id: 'a' }], [{ id: 'b' }, { id: 'c' }]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('a control is offered only where it leads somewhere', () => {
  it('score history needs TWO scores — one point is the number already on the card', () => {
    expect(hasScoreHistory(deal({ id: 'a', score_points: 0 }))).toBe(false);
    expect(hasScoreHistory(deal({ id: 'a', score_points: 1 }))).toBe(false);
    expect(hasScoreHistory(deal({ id: 'a', score_points: 2 }))).toBe(true);
    expect(hasScoreHistory(deal({ id: 'a', score_points: 9 }))).toBe(true);
  });

  it('a board answered before P12 counted them still offers it, rather than hiding something real', () => {
    expect(hasScoreHistory(deal({ id: 'a' }))).toBe(true);
  });
});

describe('every stage is reachable: the layout can never push one off-screen', () => {
  const css = readFileSync(new URL('../../styles/analyser.css', import.meta.url), 'utf8');
  const rule = (sel: string): string => {
    const at = css.indexOf(sel + ' {');
    if (at < 0) throw new Error(`no rule for ${sel}`);
    return css.slice(at, css.indexOf('}', at));
  };

  it('a stage is a full-width BAND, so no stage can sit outside the box', () => {
    const stages = rule('.board-stages');
    expect(stages).toContain('flex-direction: column');
    expect(stages).not.toContain('overflow-x');
    expect(stages).not.toContain('grid-template-columns');
  });

  it('and no rule anywhere puts the horizontal scroll or the fixed column back', () => {
    expect(css).not.toMatch(/\.board-stages[^{]*\{[^}]*overflow-x/);
    // the fixed-width column was what overflowed the row in the first place
    expect(css).not.toMatch(/\.board-col\s*\{[^}]*flex:\s*0 0/);
    // a bare `width:` — `min-width: 0` is fine and is what keeps a band's
    // children from overflowing, so the pattern must not catch it
    expect(css).not.toMatch(/\.board-col\s*\{[^}]*[;{]\s*width:\s*\d/);
  });

  it('cards flow across a band and wrap — never demanding more width than there is', () => {
    const cards = rule('.board-col-cards');
    expect(cards).toContain('display: grid');
    // auto-FILL, not auto-fit: one deal in a stage keeps a card-sized card
    expect(cards).toMatch(/repeat\(auto-fill/);
    // min(…, 100%) is what stops a bare minmax overflowing below the track width
    expect(cards).toMatch(/minmax\(min\([\d.]+rem,\s*100%\)/);
    // a short card is never stretched to match a tall neighbour
    expect(cards).toContain('align-items: start');
  });
});

describe('a pressable chip is a real touch target', () => {
  const css = readFileSync(new URL('../../styles/analyser.css', import.meta.url), 'utf8');
  it('the interactive evidence strip asks for 44px, like every other control', () => {
    const block = css.slice(css.indexOf('.ev-chips-fixable .ev-chip {'));
    expect(block.slice(0, 200)).toContain('min-height: 44px');
  });
});
