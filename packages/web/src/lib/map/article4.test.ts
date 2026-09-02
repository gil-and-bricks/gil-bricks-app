import { describe, expect, it } from 'vitest';
import { article4Flag, fetchArticle4AtPoint, pointInGeometry, pointInPolygon, type Article4Result } from './article4';

// A square around (0,0) with a square hole in the middle.
const SQUARE: number[][][] = [
  [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ],
  [
    [-0.2, -0.2],
    [0.2, -0.2],
    [0.2, 0.2],
    [-0.2, 0.2],
    [-0.2, -0.2],
  ],
];

describe('pointInPolygon', () => {
  it('is inside the ring but outside the hole', () => {
    expect(pointInPolygon(0.5, 0.5, SQUARE)).toBe(true);
    expect(pointInPolygon(0, 0, SQUARE)).toBe(false); // in the hole
    expect(pointInPolygon(2, 2, SQUARE)).toBe(false); // outside
  });
  it('edges and far points', () => {
    expect(pointInPolygon(-0.9, -0.9, SQUARE)).toBe(true);
    expect(pointInPolygon(1.0001, 0, SQUARE)).toBe(false);
  });
});

describe('pointInGeometry', () => {
  it('handles Polygon and MultiPolygon', () => {
    expect(pointInGeometry(0.5, 0.5, { type: 'Polygon', coordinates: SQUARE })).toBe(true);
    const mp: GeoJSON.Geometry = {
      type: 'MultiPolygon',
      coordinates: [SQUARE, [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]]],
    };
    expect(pointInGeometry(10.5, 10.5, mp)).toBe(true);
    expect(pointInGeometry(5, 5, mp)).toBe(false);
  });
  it('non-area geometry is never inside', () => {
    expect(pointInGeometry(0, 0, { type: 'Point', coordinates: [0, 0] })).toBe(false);
  });
});

describe('article4Flag (honest verdict copy)', () => {
  const res = (areas: Article4Result['areas'], ok = true): Article4Result => ({ areas, ok });

  it('Wales says the dataset is England-only, never a false clear', () => {
    const f = article4Flag(res([]), 'W92000004');
    expect(f.state).toBe('wales');
    expect(f.detail).toMatch(/England only/);
  });
  it('inside with the structured 3L HMO right → likely-affects-HMO copy', () => {
    const f = article4Flag(res([{ reference: '1', name: 'A4D01', notes: '', pdr: '3L', hmoRight: 'yes', mentionsHmo: false }]), 'E92000001');
    expect(f.state).toBe('inside');
    expect(f.mentionsHmo).toBe(true);
    expect(f.headline).toMatch(/likely affects small HMOs/);
    expect(f.detail).toMatch(/C3→C4/);
  });
  it('inside with a structured NON-HMO right → says so, not "unknown"', () => {
    const f = article4Flag(res([{ reference: '2', name: 'Conservation area', notes: 'painting', pdr: '1A;1C', hmoRight: 'no', mentionsHmo: false }]), 'E92000001');
    expect(f.state).toBe('inside');
    expect(f.headline).toMatch(/not small-HMO/);
  });
  it('inside with no recorded right and no HMO text → honest "doesn\'t specify" copy', () => {
    const f = article4Flag(res([{ reference: '3', name: 'X', notes: '', pdr: '', hmoRight: 'unknown', mentionsHmo: false }]), 'E92000001');
    expect(f.detail).toMatch(/doesn.t specify which right/);
  });
  it('clear England point still carries the confirm-with-council caveat', () => {
    const f = article4Flag(res([]), 'E92000001');
    expect(f.state).toBe('clear');
    expect(f.detail).toMatch(/confirm with the council/);
  });
  it('a failed lookup is distinct from a clear result', () => {
    const f = article4Flag(res([], false), 'E92000001');
    expect(f.state).toBe('unknown');
  });
});

describe('fetchArticle4AtPoint', () => {
  it('derives hmoRight from the 3L field (authoritative), regex only as fallback', async () => {
    const okFetch = (async () =>
      new Response(
        JSON.stringify({
          entities: [
            { reference: '1', name: 'A4D01', notes: '', 'permitted-development-rights': '3L' }, // structured HMO
            { reference: '2', name: 'Painting', notes: 'exterior', 'permitted-development-rights': '2A' }, // structured non-HMO
            { reference: '3', name: 'Canterbury HMO', notes: 'Multiple Occupation', 'permitted-development-rights': '' }, // regex fallback
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const r = await fetchArticle4AtPoint(51.29, 1.07, okFetch);
    expect(r.ok).toBe(true);
    expect(r.areas.map((a) => a.hmoRight)).toEqual(['yes', 'no', 'yes']);

    const badFetch = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect((await fetchArticle4AtPoint(0, 0, badFetch)).ok).toBe(false);
  });
});
