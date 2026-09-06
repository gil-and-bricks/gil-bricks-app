/**
 * EVIDENCE-STABLE RE-SCORING (P5.1).
 *
 * A deal's Deal Score includes "price vs nearby sold prices" — 2.5 of 10, 3.0 on
 * a flip — computed from the comparables the analyser had loaded. The board
 * re-scores in the browser and has no comparables, so that component used to fall
 * to "unknown" and the score moved for a reason that had nothing to do with the
 * fact. The band the save was judged against is stored with the deal now and
 * handed back to the SAME core call, so adding a fact and removing it again puts
 * the deal back exactly where it was — score, figure and verdict line.
 */
import { describe, expect, it } from 'vitest';
import { scoreDeal, strategies } from '@gil-bricks/core';
import { applyFacts, type DealFact } from './facts';
import { parseStoredEvidence, scoreFromParams } from './scoreFromParams';

/** A green-ish band around the deal's own end value, the shape a valuation gives. */
const band = (v: number) => ({ estimate: Math.round(v * 1.05), high: Math.round(v * 1.15) });
const quote = (value: number): DealFact =>
  ({ id: 'f1', deal_id: 'd1', fact_type: 'builder-quote', value, entered_at: '2026-09-06T09:00:00.000Z' });

interface Case { strategy: string; strength: string; params: string; endValue: number; quote: number }
const CASES: Case[] = [
  { strategy: 'btl', strength: 'strong', params: 'postcode=CF24+4AA&price=150000&type=T&rent=1400&refurbCost=30000', endValue: 150_000, quote: 48_000 },
  { strategy: 'btl', strength: 'mid', params: 'postcode=CF24+4AA&price=185000&type=T&rent=1250&refurbCost=30000', endValue: 185_000, quote: 48_000 },
  { strategy: 'btl', strength: 'weak', params: 'postcode=CF24+4AA&price=200000&type=T&rent=950&refurbCost=30000', endValue: 200_000, quote: 48_000 },
  { strategy: 'brrrr', strength: 'strong', params: 'postcode=CF11+9AB&price=95000&type=T&rent=1250&arv=190000&refurbCost=30000', endValue: 190_000, quote: 48_000 },
  { strategy: 'brrrr', strength: 'mid', params: 'postcode=CF11+9AB&price=120000&type=T&rent=1150&arv=200000&refurbCost=30000', endValue: 200_000, quote: 48_000 },
  { strategy: 'brrrr', strength: 'weak', params: 'postcode=CF11+9AB&price=150000&type=T&rent=850&arv=200000&refurbCost=30000', endValue: 200_000, quote: 48_000 },
  { strategy: 'flip', strength: 'strong', params: 'postcode=NP20+1AA&price=160000&type=S&gdv=260000&refurbCost=30000', endValue: 260_000, quote: 48_000 },
  { strategy: 'flip', strength: 'mid', params: 'postcode=NP20+1AA&price=240000&type=D&gdv=340000&refurbCost=30000', endValue: 340_000, quote: 48_000 },
  { strategy: 'flip', strength: 'weak', params: 'postcode=NP20+1AA&price=260000&type=D&gdv=310000&refurbCost=30000', endValue: 310_000, quote: 48_000 },
  { strategy: 'hmo', strength: 'strong', params: 'postcode=SA1+6HW&price=85000&type=S&roomRent=550&refurbCost=40000&rooms=5', endValue: 85_000, quote: 58_000 },
  { strategy: 'hmo', strength: 'mid', params: 'postcode=SA1+6HW&price=220000&type=T&roomRent=650&refurbCost=45000&rooms=6', endValue: 220_000, quote: 63_000 },
  { strategy: 'hmo', strength: 'weak', params: 'postcode=SA3+1AA&price=200000&type=S&roomRent=300&refurbCost=50000&rooms=5', endValue: 200_000, quote: 68_000 },
];

describe('add a fact, remove it, and the deal is exactly where it was', () => {
  for (const c of CASES) {
    it(`${c.strategy} · ${c.strength}: back to the saved score, byte for byte`, () => {
      const ev = band(c.endValue);
      const saved = scoreFromParams(c.strategy, c.params, ev);
      const added = scoreFromParams(c.strategy, applyFacts(c.strategy, c.params, [quote(c.quote)]), ev);
      // the fact really did something — otherwise the equality below proves nothing
      expect(added, `${c.strategy}/${c.strength}`).not.toEqual(saved);
      const removed = scoreFromParams(c.strategy, applyFacts(c.strategy, c.params, []), ev);
      expect(removed).toEqual(saved);
      expect(removed.score).toBe(saved.score);
      expect(removed.figure).toBe(saved.figure);
      expect(removed.verdict).toBe(saved.verdict);
    });
  }
});

describe('the stored band is genuinely what moves it', () => {
  it('dropping the band changes the score on every strategy that scores sold evidence', () => {
    const scored: string[] = strategies.filter((s) => s.score.some((c) => c.key === 'evidence')).map((s) => String(s.id));
    expect(scored.sort()).toEqual(['brrrr', 'btl', 'flip']);
    for (const c of CASES.filter((x) => scored.includes(x.strategy))) {
      const withBand = scoreFromParams(c.strategy, c.params, band(c.endValue));
      const without = scoreFromParams(c.strategy, c.params, null);
      expect(withBand.score, `${c.strategy}/${c.strength}`).not.toBe(without.score);
    }
  });

  it('an HMO has no sold-evidence component, so its score was never exposed to this', () => {
    expect(strategies.find((s) => s.id === 'hmo')?.score.map((c) => c.key)).not.toContain('evidence');
    for (const c of CASES.filter((x) => x.strategy === 'hmo')) {
      expect(scoreFromParams('hmo', c.params, band(c.endValue))).toEqual(scoreFromParams('hmo', c.params, null));
    }
  });

  it('the band reaches @gil-bricks/core: the same inputs scored directly agree', () => {
    // Rebuilt exactly as BtlVerdict builds it, then scored with core + the band.
    const c = CASES[0];
    const config = strategies.find((s) => s.id === 'btl');
    const p = new URLSearchParams(c.params);
    const num = (k: string): number => {
      const raw = p.get(k);
      if (raw !== null && raw !== '') return Number(raw);
      return Number([...(config?.strategyInputs ?? []), ...(config?.assumptions ?? [])].find((x) => x.key === k)?.default ?? 0);
    };
    const inputs = {
      price: Number(p.get('price')), country: 'W92000004', monthlyRent: num('rent'),
      depositPct: num('deposit'), ratePct: num('rate'), buyingAs: 'basic', selfManaged: false,
      voidWeeks: num('voidWeeks'), agentPct: num('agentPct'), maintPct: num('maintPct'),
      insurancePerYear: num('insurance'), legals: num('legals'), refurb: num('refurbCost'),
      stressRatePct: num('stressRate'), taxBasis: 'additional',
      thresholds: (config as unknown as { thresholds: Record<string, number> }).thresholds,
    } as never;
    const ev = band(c.endValue);
    expect(scoreFromParams('btl', c.params, ev).score).toBe(scoreDeal('btl', inputs, ev).score);
    expect(scoreFromParams('btl', c.params, null).score).toBe(scoreDeal('btl', inputs).score);
  });
});

describe('reading a stored band', () => {
  it('reads a real band, and treats every other shape as no evidence', () => {
    expect(parseStoredEvidence('{"estimate":210000,"high":232000}')).toEqual({ estimate: 210_000, high: 232_000 });
    for (const bad of ['null', '', 'not json', '{"estimate":0,"high":1}', '{"estimate":-5,"high":9}', '{}', null, undefined]) {
      expect(parseStoredEvidence(bad as string | null), String(bad)).toBeNull();
    }
  });

  it('a deal saved before we stored bands scores exactly as one that had none', () => {
    const c = CASES[1];
    expect(scoreFromParams(c.strategy, c.params, parseStoredEvidence(null)))
      .toEqual(scoreFromParams(c.strategy, c.params, parseStoredEvidence('null')));
  });
});
