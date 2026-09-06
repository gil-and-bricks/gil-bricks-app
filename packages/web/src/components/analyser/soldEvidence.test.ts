/**
 * D4 — THE ANALYSER AND THE PANEL MUST READ SOLD EVIDENCE THE SAME WAY.
 *
 * This is the test the whole sprint turns on. It runs the panel's own entry
 * point (`scoreListing`, which the extension calls) and the analyser's
 * (`evidenceFromComps`) over the same sector and the same subject, and fails if
 * they hand `scoreDeal` anything different.
 */
import { describe, expect, it } from 'vitest';
import { scoreListing, soldEvidenceFor, type SectorFile } from '@gil-bricks/core';
import { FALLBACK_CONFIG } from '@gil-bricks/core';
import { evidenceFromComps, SOLD_EVIDENCE_OPTS } from './soldEvidence';

const sector = (over: Partial<SectorFile['stats']> = {}): SectorFile => ({
  schemaVersion: 1, sector: 'LS28 9', country: 'E92000001', updatedAt: '2026-08-31T00:00:00Z', sales: [],
  stats: { count: 40, typicalPrice: 180000, typicalPpsqm: 2200, p10Price: 120000, p90Price: 240000, ...over },
} as SectorFile);

describe('one rule, both surfaces', () => {
  it('the analyser uses the SAME two thresholds the panel does', () => {
    expect(SOLD_EVIDENCE_OPTS.minSales).toBe(FALLBACK_CONFIG.thresholds.minSectorSales);
    expect(SOLD_EVIDENCE_OPTS.outsideFactor).toBe(FALLBACK_CONFIG.thresholds.evidenceOutsideFactor);
  });

  it.each([
    ['a normal price', 150000, sector()],
    ['a price above typical', 220000, sector()],
    ['a thin sector', 150000, sector({ count: 2 })],
    ['far outside the local evidence', 900000, sector()],
  ])('%s: the analyser and the panel agree exactly', (_label, price, sec) => {
    const web = evidenceFromComps(price, { subjectSector: sec } as never);
    const panel = soldEvidenceFor(price, sec, {
      minSales: FALLBACK_CONFIG.thresholds.minSectorSales,
      outsideFactor: FALLBACK_CONFIG.thresholds.evidenceOutsideFactor,
    }).evidence;
    expect(web).toEqual(panel);
  });

  it('no sector at all is the same answer on both', () => {
    expect(evidenceFromComps(150000, null)).toBeUndefined();
    expect(soldEvidenceFor(150000, null, SOLD_EVIDENCE_OPTS).evidence).toBeUndefined();
  });

  it('and it is the evidence scoreListing itself hands the engine', () => {
    // scoreListing is the extension's entry point. Its hasSoldEvidence flag is
    // set from the very object it passes scoreDeal, so this ties the analyser's
    // helper to what the panel actually scores with.
    const listing = {
      portal: 'rightmove', extractorVersion: 'x', configVersion: 'x', source: 'embedded',
      listingId: { value: '1', status: 'found' }, askingPrice: { value: 150000, status: 'found' },
      postcode: { value: 'LS28 9GD', status: 'found' }, propertyType: { value: 'Flat', status: 'found' },
      bedrooms: { value: 2, status: 'found' }, bathrooms: { value: 1, status: 'found' },
      floorAreaSqm: { value: null, status: 'missing' }, tenure: { value: null, status: 'missing' },
      address: { value: null, status: 'missing' }, isAuction: { value: false, status: 'found' },
      floorPlanImageUrls: { value: null, status: 'missing' }, description: { value: '', status: 'found' },
      firstListedDaysAgo: { value: null, status: 'missing' },
    } as never;
    const r = scoreListing(listing, { strategy: 'btl', unknowns: { rent: '750' }, sector: sector() });
    expect(r.hasSoldEvidence).toBe(evidenceFromComps(150000, { subjectSector: sector() } as never) !== undefined);
  });
});
