import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractListing, priceVsSector, smartDefaults, rentFitsProperty, isOutOfMarket, FALLBACK_CONFIG } from './index';
import type { SectorFile } from '../data/types';

/** Suggestion sanity (E7.1). */
const CORPUS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'listings');
function rmFlat() {
  const url = 'https://www.rightmove.co.uk/properties/159999001';
  const html = readFileSync(join(CORPUS, 'rightmove', 'rightmove-leasehold-flat-added.html'), 'utf8');
  const w = new Window({ url, settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  w.document.write(html);
  const res = extractListing('rightmove', w.document as unknown as Document, FALLBACK_CONFIG, url);
  if (!res.ok) throw new Error('fixture failed to extract');
  return res.listing; // £170,000
}
const sector = (over: Partial<SectorFile['stats']> = {}): SectorFile =>
  ({ schemaVersion: 1, sector: 'SA1 8', country: 'W92000004', updatedAt: 'x', sales: [],
     stats: { count: 20, typicalPrice: 180000, typicalPpsqm: 2200, p10Price: 120000, p90Price: 230000, ...over } }) as SectorFile;

const { rentSanityYieldMin: LO, rentSanityYieldMax: HI } = FALLBACK_CONFIG.thresholds;

describe('rentFitsProperty (remembered-rent sanity)', () => {
  it('applies a sane rent, rejects an absurd one for this property', () => {
    expect(rentFitsProperty(850, 170000, LO, HI)).toBe(true); // ~6% — fine
    // £344/mo remembered from a cheaper home, on a £1.5m house ⇒ 0.28% ⇒ reject
    expect(rentFitsProperty(344, 1_500_000, LO, HI)).toBe(false);
    // implausibly high (a per-room figure applied whole) ⇒ reject
    expect(rentFitsProperty(9000, 170000, LO, HI)).toBe(false);
    expect(rentFitsProperty(0, 170000, LO, HI)).toBe(false);
    expect(rentFitsProperty(850, 0, LO, HI)).toBe(false);
    // the band is inclusive — a yield exactly on either edge fits
    expect(rentFitsProperty(250, 150000, LO, HI)).toBe(true); // 250×12/150000 = 0.02 = LO
    expect(rentFitsProperty(2500, 150000, LO, HI)).toBe(true); // 2500×12/150000 = 0.20 = HI
  });
});

describe('isOutOfMarket', () => {
  it('true only when outside the evidence AND no strategy works', () => {
    expect(isOutOfMarket('outside-evidence', [null, null, null, null])).toBe(true);
    expect(isOutOfMarket('outside-evidence', ['walk away', null, 'walk away', null])).toBe(true);
    // any working strategy ⇒ not out of market
    expect(isOutOfMarket('outside-evidence', ['marginal', 'walk away', null, null])).toBe(false);
    // a merely weak deal is within evidence ⇒ never trips
    expect(isOutOfMarket('red', ['walk away', 'walk away', 'walk away', 'walk away'])).toBe(false);
    expect(isOutOfMarket('green', [null, null, null, null])).toBe(false);
  });
});

describe('a suggested end value and "outside-evidence" can NEVER appear together (E7.1)', () => {
  const factor = FALLBACK_CONFIG.thresholds.evidenceOutsideFactor;
  it('outside-evidence ⇒ no end-value suggestion (both tabs)', () => {
    // £1.5m in a £230k-p90 sector ⇒ price is outside the evidence
    const big = { ...rmFlat(), askingPrice: { value: 1_500_000, status: 'found' as const } };
    expect(priceVsSector(1_500_000, sector(), 5, null, factor).status).toBe('outside-evidence');
    for (const strategy of ['flip', 'brrrr'] as const) {
      const key = strategy === 'flip' ? 'gdv' : 'arv';
      const sug = smartDefaults(strategy, big, sector(), 90, { evidenceOutsideFactor: factor, minSectorSales: 5 })[key];
      expect(sug.value, strategy).toBeNull();
      expect(sug.label).toMatch(/no nearby sales at this level/i);
    }
  });
  it('within evidence ⇒ a suggestion IS offered', () => {
    const sug = smartDefaults('flip', rmFlat(), sector(), 90, { evidenceOutsideFactor: factor, minSectorSales: 5 }).gdv;
    expect(sug.value).not.toBeNull();
    expect(priceVsSector(170000, sector(), 5, null, factor).status).not.toBe('outside-evidence');
  });
});
