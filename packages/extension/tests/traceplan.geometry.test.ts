/**
 * T1 — THE MATHS, and the one piece of physical design that is also maths:
 * where the loupe sits relative to the finger.
 */
import { describe, expect, it } from 'vitest';
import {
  areaReading, closesRoom, distance, hitPoint, lengthMetres, loupePosition,
  metresPerPixel, perimeter, shoelaceArea, toImage, toScreen,
} from '../src/traceplan/geometry.ts';
import { TRACEPLAN_TOLERANCES as T } from '../src/traceplan/config.ts';

describe('the shoelace formula', () => {
  it('a 4×3 rectangle is 12', () => {
    expect(shoelaceArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBe(12);
  });

  it('does not care which way round the corners were tapped', () => {
    const clockwise = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    expect(shoelaceArea([...clockwise].reverse())).toBe(shoelaceArea(clockwise));
  });

  it('handles an L-shaped room, which is why we do not assume rectangles', () => {
    // 6×4 with a 2×2 bite out of one corner = 24 − 4 = 20
    expect(shoelaceArea([
      { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 0, y: 4 },
    ])).toBe(20);
  });

  it('a triangle is half its bounding rectangle', () => {
    expect(shoelaceArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }])).toBe(6);
  });

  it('fewer than three corners is not a room', () => {
    expect(shoelaceArea([{ x: 0, y: 0 }, { x: 4, y: 0 }])).toBe(0);
  });

  it('and the perimeter of that rectangle is 14', () => {
    expect(perimeter([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBe(14);
  });
});

describe('the scale, from one printed dimension', () => {
  it('200 px that are really 4 m gives 0.02 m per px', () => {
    expect(metresPerPixel({ x: 0, y: 0 }, { x: 200, y: 0 }, 4, 40)).toBeCloseTo(0.02, 6);
  });

  it('refuses a reference too short to calibrate from', () => {
    // error in the scale is amplified by room ÷ reference, so a stub line is a
    // guess wearing a number
    expect(metresPerPixel({ x: 0, y: 0 }, { x: 30, y: 0 }, 4, 40)).toBeNull();
  });

  it('refuses a nonsense length', () => {
    expect(metresPerPixel({ x: 0, y: 0 }, { x: 200, y: 0 }, 0, 40)).toBeNull();
    expect(metresPerPixel({ x: 0, y: 0 }, { x: 200, y: 0 }, -4, 40)).toBeNull();
  });

  it('a wall reads back in metres', () => {
    expect(lengthMetres({ x: 0, y: 0 }, { x: 250, y: 0 }, 0.02)).toBeCloseTo(5, 6);
  });
});

describe('the area, shown honestly', () => {
  const room = [{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 200 }, { x: 0, y: 200 }];

  it('5 m × 4 m at 0.02 m/px is 20 m²', () => {
    expect(areaReading(room, 0.02, 10)?.sqm).toBe(20);
  });

  it('never comes without a range around it', () => {
    const r = areaReading(room, 0.02, 10);
    expect(r?.lowSqm).toBe(18);
    expect(r?.highSqm).toBe(22);
    expect(r?.lowSqm).toBeLessThan(r?.sqm as number);
    expect(r?.highSqm).toBeGreaterThan(r?.sqm as number);
  });

  it('is rounded to ONE decimal — the second is noise from a fingertip', () => {
    const odd = [{ x: 0, y: 0 }, { x: 237, y: 0 }, { x: 237, y: 191 }, { x: 0, y: 191 }];
    const r = areaReading(odd, 0.0213, 10);
    for (const v of [r?.sqm, r?.lowSqm, r?.highSqm]) {
      expect(String(v).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('AREA GOES AS THE SQUARE OF LENGTH — a 1% scale error is ~2% of area', () => {
    const exact = areaReading(room, 0.02, 10)!.sqm;
    const onePctOut = areaReading(room, 0.0202, 10)!.sqm;
    expect((onePctOut - exact) / exact).toBeGreaterThan(0.019);
    expect((onePctOut - exact) / exact).toBeLessThan(0.021);
  });

  it('refuses to read anything from an unclosed or uncalibrated trace', () => {
    expect(areaReading([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0.02, 10)).toBeNull();
    expect(areaReading(room, 0, 10)).toBeNull();
  });
});

describe('zoom and pan never move what was traced', () => {
  it('an image point round-trips through any transform', () => {
    const v = { scale: 3.4, tx: -120, ty: 88 };
    const p = { x: 137, y: 212 };
    const back = toImage(toScreen(p, v), v);
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });
});

describe('finger tolerances', () => {
  it('closing needs enough corners AND a tap on the first one', () => {
    const first = { x: 100, y: 100 };
    expect(closesRoom({ x: 105, y: 100 }, first, T.closeRadiusPx, 4, T.minPoints)).toBe(true);
    // too few corners: an early second tap near the first must NOT close a room
    expect(closesRoom({ x: 105, y: 100 }, first, T.closeRadiusPx, 2, T.minPoints)).toBe(false);
    // far away
    expect(closesRoom({ x: 400, y: 100 }, first, T.closeRadiusPx, 4, T.minPoints)).toBe(false);
  });

  it('grabbing a corner takes the NEAREST one inside the radius', () => {
    const pts = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 300, y: 0 }];
    expect(hitPoint({ x: 26, y: 0 }, pts, T.grabRadiusPx)).toBe(1);
    expect(hitPoint({ x: 150, y: 0 }, pts, T.grabRadiusPx)).toBeNull();
  });

  it('distance is plain euclidean — 3,4,5', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('THE LOUPE IS NEVER UNDER THE FINGER', () => {
  const surface = { width: 360, height: 640 };
  const size = T.loupeSizePx;
  const offset = T.loupeOffsetPx;

  it('sits above the touch, clear of it, everywhere down the surface', () => {
    for (let y = offset + size; y < surface.height; y += 17) {
      const pos = loupePosition({ x: 180, y }, surface, size, offset);
      expect(pos.below, `y=${y}`).toBe(false);
      // its BOTTOM edge is above the finger by at least the offset
      expect(y - (pos.y + size / 2), `y=${y}`).toBeGreaterThanOrEqual(offset - 0.001);
    }
  });

  it('flips BELOW near the top rather than being clipped off-screen', () => {
    const pos = loupePosition({ x: 180, y: 10 }, surface, size, offset);
    expect(pos.below).toBe(true);
    // and is then clear of the finger the other way
    expect(pos.y - size / 2).toBeGreaterThanOrEqual(10 + offset - 0.001);
  });

  it('never leaves the surface horizontally, at either edge', () => {
    for (const x of [0, 4, 180, 356, 360]) {
      const pos = loupePosition({ x, y: 400 }, surface, size, offset);
      expect(pos.x - size / 2, `x=${x}`).toBeGreaterThanOrEqual(-0.001);
      expect(pos.x + size / 2, `x=${x}`).toBeLessThanOrEqual(surface.width + 0.001);
    }
  });

  it('the offset really does clear a fingertip', () => {
    // ~45-50px is an adult fingertip on a phone; the tolerance must beat it
    expect(T.loupeOffsetPx).toBeGreaterThan(50);
  });
});
