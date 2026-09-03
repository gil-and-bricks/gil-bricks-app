import { describe, expect, it } from 'vitest';
import { parseDimensionPair, roomFit, metresPerPixel, measureMetres, rectArea, HMO_MIN_SQM } from './floorplan';
import { sqmToSqft } from '../maths/area';

/** Manual dimension entry + HMO room-fit + measure geometry (E9.1 — OCR removed). */

describe('parseDimensionPair — both conventions, typed by the user', () => {
  it('metric with and without units', () => {
    expect(parseDimensionPair('3.50m x 4.20m')).toMatchObject({ widthM: 3.5, lengthM: 4.2, unit: 'm' });
    expect(parseDimensionPair('3.50 x 4.20 m')).toMatchObject({ widthM: 3.5, lengthM: 4.2, unit: 'm' });
    expect(parseDimensionPair('3.5 x 4.2')).toMatchObject({ widthM: 3.5, lengthM: 4.2, unit: 'm' });
    expect(parseDimensionPair('3.5 × 4.2 m')).toMatchObject({ widthM: 3.5, lengthM: 4.2 });
    expect(parseDimensionPair('approx 3.50 x 4.20 m')).toMatchObject({ widthM: 3.5, lengthM: 4.2 });
  });
  it('imperial feet/inches → metres', () => {
    const d = parseDimensionPair('11\'6" x 13\'9"')!;
    expect(d.unit).toBe('ft');
    expect(d.widthM).toBeCloseTo(3.51, 1);
    expect(d.lengthM).toBeCloseTo(4.19, 1);
  });
  it('mixed metric + imperial gloss → metric wins', () => {
    expect(parseDimensionPair('3.50m (11\'6") x 4.20m (13\'9")')).toMatchObject({ widthM: 3.5, lengthM: 4.2, unit: 'm' });
  });
  it('treats an OCR/typo comma as a decimal point', () => {
    expect(parseDimensionPair('5,5 x 4,2')).toMatchObject({ widthM: 5.5, lengthM: 4.2 });
  });
  it('a numbered room label is never read as the width', () => {
    expect(parseDimensionPair('Bed 4 2.5 x 2.0')).toMatchObject({ widthM: 2.5, lengthM: 2 });
  });
  it('refuses an ambiguous bare-integer pair rather than guess (m vs ft)', () => {
    expect(parseDimensionPair('8 x 4')).toBeNull();
    expect(parseDimensionPair('12 x 7')).toBeNull();
    expect(parseDimensionPair('4 x 5')).toMatchObject({ unit: 'm', widthM: 4 });
    expect(parseDimensionPair('11 x 13')).toMatchObject({ unit: 'ft' });
  });
  it('rejects non-dimension text', () => {
    expect(parseDimensionPair('Living Room')).toBeNull();
    expect(parseDimensionPair('14 sq m')).toBeNull();
    expect(parseDimensionPair('')).toBeNull();
  });
});

describe('HMO room-fit vs England statutory minimums', () => {
  it('boundaries: 4.64 child, 6.51 one adult, 10.22 two adults', () => {
    expect(roomFit(6.51)).toEqual({ meetsChild: true, meetsOneAdult: true, meetsTwoAdults: false });
    expect(roomFit(6.50)).toMatchObject({ meetsOneAdult: false });
    expect(roomFit(10.22)).toMatchObject({ meetsTwoAdults: true });
    expect(roomFit(4.63)).toMatchObject({ meetsChild: false });
    expect(HMO_MIN_SQM).toEqual({ childUnder10: 4.64, oneAdultOver10: 6.51, twoAdultsOver10: 10.22 });
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
    expect(Math.round(sqmToSqft(rect.areaSqm))).toBeGreaterThan(140);
    const tiny = rectArea(100, 100, mpp); // 2x2 = 4m²
    expect(tiny.fit.meetsOneAdult).toBe(false);
    // negative drags are fine (abs)
    expect(rectArea(-200, -175, mpp).areaSqm).toBeCloseTo(14, 1);
  });
  it('guards bad scale input', () => {
    expect(metresPerPixel(0, 4)).toBeNull();
    expect(metresPerPixel(200, 0)).toBeNull();
  });
});
