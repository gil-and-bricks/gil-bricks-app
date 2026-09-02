import { describe, expect, it } from 'vitest';
import {
  parseDimensionPair, parseFloorPlan, roomFit, roomFitSummary, crossCheckArea,
  editRoom, metresPerPixel, measureMetres, rectArea, HMO_MIN_SQM,
} from './floorplan';
import { sqmToSqft } from '../maths/area';

describe('parseDimensionPair — both conventions (E9)', () => {
  it('metric with and without units', () => {
    expect(parseDimensionPair('3.50m x 4.20m')).toMatchObject({ widthM: 3.5, lengthM: 4.2, unit: 'm' });
    expect(parseDimensionPair('3.50 x 4.20 m')).toMatchObject({ widthM: 3.5, lengthM: 4.2, unit: 'm' });
    expect(parseDimensionPair('3.5 x 4.2')).toMatchObject({ widthM: 3.5, lengthM: 4.2, unit: 'm' });
    expect(parseDimensionPair('3.5 × 4.2 m')).toMatchObject({ widthM: 3.5, lengthM: 4.2 }); // × glyph
    expect(parseDimensionPair('approx 3.50 x 4.20 m')).toMatchObject({ widthM: 3.5, lengthM: 4.2 });
  });
  it('imperial feet/inches → metres', () => {
    const d = parseDimensionPair('11\'6" x 13\'9"')!;
    expect(d.unit).toBe('ft');
    expect(d.widthM).toBeCloseTo(3.51, 1);
    expect(d.lengthM).toBeCloseTo(4.19, 1);
    expect(parseDimensionPair("11' x 13'")).toMatchObject({ unit: 'ft' });
  });
  it('mixed metric + imperial gloss → metric wins', () => {
    expect(parseDimensionPair('3.50m (11\'6") x 4.20m (13\'9")')).toMatchObject({ widthM: 3.5, lengthM: 4.2, unit: 'm' });
  });
  it('bare integers that are implausible in metres are read as feet', () => {
    const d = parseDimensionPair('11 x 13')!; // a room, so feet
    expect(d.unit).toBe('ft');
    expect(d.widthM).toBeCloseTo(3.35, 1);
  });
  it('a numbered room label is NEVER read as the width (E9 review must-fix)', () => {
    // "Bed 4 2.5 x 2.0" must be 2.5×2.0=5m², not 4×2=8m²
    expect(parseDimensionPair('Bed 4 2.5 x 2.0')).toMatchObject({ widthM: 2.5, lengthM: 2 });
    expect(parseDimensionPair('Reception 2 3.9 x 3.2')).toMatchObject({ widthM: 3.9, lengthM: 3.2 });
  });
  it('an ambiguous bare-integer pair falls back to manual, never a huge m² room (must-fix)', () => {
    // 8×4 or 12×7 are plausible as BOTH metres and feet → refuse to guess
    expect(parseDimensionPair('8 x 4')).toBeNull();
    expect(parseDimensionPair('12 x 7')).toBeNull();
    // clearly-metres and clearly-feet still resolve
    expect(parseDimensionPair('4 x 5')).toMatchObject({ unit: 'm', widthM: 4 });
    expect(parseDimensionPair('11 x 13')).toMatchObject({ unit: 'ft' });
  });
  it('an undersized feet bedroom is NOT silently passed as a huge m² room', () => {
    const r = parseFloorPlan('Bedroom 3\n8 x 4', 90);
    // the ambiguous 8x4 is dropped → no fabricated 32 m² bedroom
    expect(r.rooms.find((x) => /bedroom/i.test(x.name ?? ''))).toBeUndefined();
  });
  it('treats an OCR comma as a decimal point (no silent wrong area)', () => {
    expect(parseDimensionPair('5,5 x 4,2')).toMatchObject({ widthM: 5.5, lengthM: 4.2 });
  });
  it('strips a leading room number from the read text', () => {
    const d = parseDimensionPair('Bedroom 2 3.5m x 4.2m')!;
    expect(d).toMatchObject({ widthM: 3.5, lengthM: 4.2 });
    expect(d.text.startsWith('2')).toBe(false);
  });
  it('rejects non-dimension text', () => {
    expect(parseDimensionPair('Living Room')).toBeNull();
    expect(parseDimensionPair('Energy Rating C')).toBeNull();
    expect(parseDimensionPair('')).toBeNull();
  });
});

describe('parseFloorPlan — rooms, names, totals, honesty', () => {
  const ocr = ['Living Room', '3.50m x 4.20m', 'Kitchen / Diner', '2.80m x 5.10m', 'Bedroom 1', '11\'6" x 13\'9"', 'random noise', '0.2 x 0.1'].join('\n');
  const r = parseFloorPlan(ocr, 85);
  it('reads named rooms with areas in m² and ft²', () => {
    expect(r.rooms.length).toBe(3); // the 0.2x0.1 noise is implausible → dropped? it parses but low
    const lr = r.rooms.find((x) => /living/i.test(x.name ?? ''))!;
    expect(lr.areaSqm).toBeCloseTo(14.7, 1);
    expect(lr.areaSqft).toBe(Math.round(sqmToSqft(14.7)));
    expect(lr.confidence).toBe('high');
  });
  it('the total is the sum of readable rooms — labelled, never GIA', () => {
    expect(r.totalLabel).toMatch(/sum of \d+ rooms? we could read/);
    expect(r.totalLabel).not.toMatch(/GIA|gross internal/i);
    expect(r.sumSqm).toBeCloseTo(r.rooms.reduce((s, x) => s + x.areaSqm, 0), 1);
  });
  it('reads nothing usable → empty, honest, never a wrong number', () => {
    const empty = parseFloorPlan('EPC rating C\nTenure: Freehold\nFor illustration only');
    expect(empty.rooms.length).toBe(0);
    expect(empty.totalLabel).toBe('no rooms read');
    expect(empty.sumSqm).toBe(0);
  });
});

describe('HMO room-fit vs England statutory minimums (E9)', () => {
  it('boundaries: 4.64 child, 6.51 one adult, 10.22 two adults', () => {
    expect(roomFit(6.51)).toEqual({ meetsChild: true, meetsOneAdult: true, meetsTwoAdults: false });
    expect(roomFit(6.50)).toMatchObject({ meetsOneAdult: false });
    expect(roomFit(10.22)).toMatchObject({ meetsTwoAdults: true });
    expect(roomFit(4.63)).toMatchObject({ meetsChild: false });
    expect(HMO_MIN_SQM).toEqual({ childUnder10: 4.64, oneAdultOver10: 6.51, twoAdultsOver10: 10.22 });
  });
  it('summary counts lettable adult rooms and failures', () => {
    const rooms = [{ areaSqm: 12 }, { areaSqm: 7 }, { areaSqm: 5 }].map((x) => ({ ...x, name: null, raw: '', widthM: 0, lengthM: 0, areaSqft: 0, unit: 'm' as const, confidence: 'high' as const }));
    const s = roomFitSummary(rooms);
    expect(s.lettableAdultRooms).toBe(2); // 12 and 7 meet 6.51
    expect(s.failures).toBe(1); // the 5m² room
    expect(s.total).toBe(3);
  });
});

describe('cross-check against a known floor area — honest, never asserts GIA', () => {
  it('consistent when the sum is a plausible subset', () => {
    expect(crossCheckArea(70, 95).status).toBe('consistent');
  });
  it('flags reading HIGHER than the stated area (OCR misread)', () => {
    expect(crossCheckArea(110, 95).status).toBe('reads-higher');
  });
  it('flags reading only a small fraction', () => {
    expect(crossCheckArea(20, 95).status).toBe('reads-much-lower');
  });
  it('no reference → says so', () => {
    expect(crossCheckArea(70, null).status).toBe('no-reference');
    expect(crossCheckArea(70, 0).status).toBe('no-reference');
  });
});

describe('user edits own the value', () => {
  it('editRoom recomputes area and marks it theirs at high confidence', () => {
    const base = { name: 'Bed', raw: '3 x 3', widthM: 3, lengthM: 3, areaSqm: 9, areaSqft: 97, unit: 'm' as const, confidence: 'low' as const };
    const e = editRoom(base, 3.6, 4.1);
    expect(e.areaSqm).toBeCloseTo(14.76, 1);
    expect(e.edited).toBe(true);
    expect(e.confidence).toBe('high');
  });
});

describe('measure / reconfigure overlay geometry', () => {
  it('scale from a known dimension, then measure and rectangle-fit', () => {
    const mpp = metresPerPixel(200, 4.0)!; // 200px = 4.0m
    expect(mpp).toBeCloseTo(0.02, 5);
    expect(measureMetres(150, mpp)).toBeCloseTo(3.0, 2);
    const rect = rectArea(200, 175, mpp); // 4.0m x 3.5m = 14m²
    expect(rect.areaSqm).toBeCloseTo(14, 1);
    expect(rect.fit.meetsOneAdult).toBe(true);
    const tiny = rectArea(100, 100, mpp); // 2x2 = 4m²
    expect(tiny.fit.meetsOneAdult).toBe(false);
  });
  it('guards bad scale input', () => {
    expect(metresPerPixel(0, 4)).toBeNull();
    expect(metresPerPixel(200, 0)).toBeNull();
  });
});
