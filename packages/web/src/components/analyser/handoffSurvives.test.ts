// @vitest-environment happy-dom
/**
 * NOTHING THAT ARRIVES WITH THE DEAL MAY BE LOST BY EDITING IT (M3).
 *
 * The URL this page writes is rebuilt from the form's own state. Anything that
 * arrived and is not a form field used to be discarded on the FIRST write —
 * before the page had even been touched. The listing's photographs and its
 * floor plan went that way: they came from the listing, nobody can retype them,
 * and editing one number threw them away.
 *
 * This drives the REAL writer: it loads a full handoff, changes a field the way
 * a person would, and fails if any arriving parameter is not still there.
 */
import { describe, expect, it, vi } from 'vitest';
import { features } from '../../config/features';
import { READ_ONCE } from './arrival';
import { CRITERIA_PARAMS, FLOORPLAN_PARAM, PHOTOS_PARAM, MEASURED_PARAMS } from '@gil-bricks/core';

/** A handoff with every field the extension can send, all at once. */
const ARRIVING: Record<string, string> = {
  postcode: 'SA1 2QJ', price: '100000', type: 'T', area: '73', beds: '2', baths: '1',
  paon: '9', saon: 'Flat 1', age: 'pre1900', garden: 'none', parking: '1',
  // not form fields — these are the deal's own facts
  areaSrc: 'epc-register',
  [MEASURED_PARAMS.roomSizeFailures]: '2',
  [MEASURED_PARAMS.roomsMeasured]: '5',
  [CRITERIA_PARAMS.minCashflow]: '150',
  [CRITERIA_PARAMS.minRoi]: '8',
  [CRITERIA_PARAMS.minIcr]: '1.25',
  [CRITERIA_PARAMS.minProfit]: '20000',
  [FLOORPLAN_PARAM]: 'https://media.rightmove.co.uk/property-floorplan/a/1/plan.png',
  [PHOTOS_PARAM]: 'https://media.rightmove.co.uk/property-photo/a/1/one.jpeg https://media.rightmove.co.uk/property-photo/a/1/two.jpeg',
  /**
   * THE ONE THAT WARNS ABOUT THE LEGAL PACK (M6). It is metadata, not a field,
   * so it is exactly the shape of thing the first write used to discard — and
   * losing it is not a cosmetic loss: the board warns about the legal pack off
   * this flag, and somebody can commit to a reservation fee on an auction lot
   * without ever being told to read the pack.
   */
  auction: '1',
  // a strategy field, so the edit below is a real one
  gdv: '128889',
};

const FIELDS = [
  { key: 'gdv', kind: 'number' as const, default: '' },
  { key: 'refurbCost', kind: 'number' as const, default: '' },
];

/**
 * The criteria module reads the URL when it is IMPORTED, exactly as it does in
 * the browser. So the URL is set first and the modules are loaded fresh for
 * each test — this drives the real code rather than a rearranged copy of it.
 */
async function loadWith(query: string) {
  vi.resetModules();
  window.history.replaceState(null, '', `/flip/analyser/?${query}`);
  const mod = await import('./state');
  mod.state.value = mod.parseQuery(query);
  mod.initStrategyParams(FIELDS);
  return {
    ...mod,
    /** What the writer would put in the bar right now. */
    written: (): URLSearchParams =>
      new URLSearchParams(mod.toQuery(mod.state.value, mod.strategyParams.value).replace(/^\?/, '')),
  };
}

const FULL = new URLSearchParams(ARRIVING).toString();

/**
 * What must survive, and what must NOT.
 *
 * Two exceptions, both deliberate and both worth naming so nobody later
 * "fixes" them:
 *
 *  - READ_ONCE (arrival.ts) is stripped on purpose, by AnalyserApp, the moment
 *    it is captured. A link copied before the first edit must never tell a
 *    stranger which deal it came from or that their numbers are evidenced.
 *    Those values live in memory for this view; their absence from the address
 *    is the privacy feature working.
 *  - The D4 criteria are emitted only when their own flag is on. That flag IS
 *    the switch, so with it off their absence is not a loss either.
 *
 * Everything else came from the listing, cannot be retyped, and must survive.
 */
const readOnce: string[] = [...READ_ONCE];
const mustSurvive = (): string[] => {
  const criteria: string[] = Object.values(CRITERIA_PARAMS);
  return Object.keys(ARRIVING)
    .filter((k) => !readOnce.includes(k))
    .filter((k) => features.criteriaHandoff || !criteria.includes(k));
};

describe('a handoff survives being edited', () => {
  it('every arriving parameter is still there before anything is touched', async () => {
    const { written } = await loadWith(FULL);
    const out = written();
    const lost = mustSurvive().filter((k) => !out.has(k));
    expect(lost, `lost on the first write: ${lost.join(', ')}`).toEqual([]);
  });

  it('and every one is still there after a strategy field is edited', async () => {
    const { written, updateStrategy } = await loadWith(FULL);
    updateStrategy({ gdv: '131000' });
    const out = written();
    const lost = mustSurvive().filter((k) => !out.has(k));
    expect(lost, `lost by editing: ${lost.join(', ')}`).toEqual([]);
    expect(out.get('gdv'), 'and the edit itself took').toBe('131000');
  });

  /**
   * THE AUCTION FLAG, NAMED OUT LOUD (M6).
   *
   * The three tests above build their expectation by subtracting READ_ONCE from
   * the arriving keys — so the moment a key is added to READ_ONCE, they stop
   * asking about it and go green. Adding 'auction' to that list therefore
   * passed every one of them, which is the same round-trip fault as the bug
   * this whole file was written to prevent: two sides reading one list.
   *
   * The legal-pack warning is not something to leave to a derived list. This
   * names the parameter, literally, and fails if it ever stops travelling — no
   * matter what any list says.
   */
  it.each([
    ['nothing touched', (_m: Record<string, any>) => undefined],
    ['a strategy field edited', (m: Record<string, any>) => m.updateStrategy({ gdv: '131000' })],
    ['a property field edited', (m: Record<string, any>) => m.update({ price: '105000' })],
    ['the price cleared and retyped', (m: Record<string, any>) => { m.update({ price: '' }); m.update({ price: '96000' }); }],
  ])('the auction flag is still in the address with %s', async (_label, act) => {
    const mod = await loadWith(FULL);
    act(mod);
    expect(
      mod.written().get('auction'),
      'the board warns about the legal pack off this flag — losing it loses the warning',
    ).toBe('1');
  });

  it('and a deal that is NOT an auction never gains the flag', async () => {
    const notAuction = new URLSearchParams({ ...ARRIVING });
    notAuction.delete('auction');
    const { written, update } = await loadWith(notAuction.toString());
    update({ price: '105000' });
    expect(written().has('auction'), 'a warning nobody earned is its own kind of wrong').toBe(false);
  });

  it('and after a property field is edited', async () => {
    const { written, update } = await loadWith(FULL);
    update({ price: '105000' });
    const out = written();
    const lost = mustSurvive().filter((k) => !out.has(k));
    expect(lost, `lost by editing: ${lost.join(', ')}`).toEqual([]);
    expect(out.get('price')).toBe('105000');
  });

  it('the photographs and the floor plan arrive INTACT, not merely present', async () => {
    const { written, updateStrategy } = await loadWith(FULL);
    updateStrategy({ gdv: '131000' });
    const out = written();
    expect(out.get(PHOTOS_PARAM)).toBe(ARRIVING[PHOTOS_PARAM]);
    expect(out.get(FLOORPLAN_PARAM)).toBe(ARRIVING[FLOORPLAN_PARAM]);
    expect((out.get(PHOTOS_PARAM) ?? '').split(/\s+/).filter(Boolean)).toHaveLength(2);
  });

  it('a form field still wins over a carried value of the same name', async () => {
    // the deal's facts must never resurrect a value the person is editing
    const { written, update } = await loadWith(FULL);
    update({ price: '105000' });
    expect(written().get('price')).toBe('105000');
  });

  it('but the read-once markers are deliberately NOT carried — that is the privacy rule', async () => {
    const { written, updateStrategy } = await loadWith(FULL);
    updateStrategy({ gdv: '131000' });
    // they are still in `written` here because this drives the writer directly;
    // AnalyserApp deletes them from the address on arrival. What matters is that
    // nobody has quietly added them to the must-survive set.
    for (const k of readOnce) {
      expect(mustSurvive(), `${k} must never be required to survive`).not.toContain(k);
    }
    expect(written().get('gdv')).toBe('131000');
  });

  it('and an unknown future parameter is carried too, without anyone adding it here', async () => {
    const { written, updateStrategy } = await loadWith('postcode=SA1+2QJ&price=100000&somethingNew=abc');
    updateStrategy({ gdv: '1' });
    expect(written().get('somethingNew')).toBe('abc');
  });
});
