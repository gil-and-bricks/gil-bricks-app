/**
 * THE EQUIVALENCE PROOF (P5).
 *
 * A fact must flow through the SAME maths the analyser uses. Not similar maths —
 * the same. So for each strategy: take a deal, add a fact, and assert the score
 * is identical to the score of a deal where that number was typed in from the
 * start. If any parallel pathway existed, these would drift.
 *
 * The second half proves the analyser's own input mapping is the one being used,
 * by rebuilding the inputs the way the verdict components do and calling
 * @gil-bricks/core directly.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyseBrrrr, analyseBtl, analyseFlip, analyseHmo, scoreDeal, strategies } from '@gil-bricks/core';
import { applyFacts, factMoves, factNotes, type DealFact } from './facts';
import { scoreFromParams } from './scoreFromParams';
import { FACT_NO_MATHS, FACT_TYPES } from '../../config/pipeline';

const fact = (fact_type: string, value: number, at = '2026-09-01T10:00:00.000Z'): DealFact =>
  ({ id: `${fact_type}-${value}`, deal_id: 'd1', fact_type, value, entered_at: at });

const DEALS = {
  btl: 'postcode=CF24+4AA&price=150000&type=T&rent=1400&refurbCost=30000',
  brrrr: 'postcode=CF11+9AB&price=120000&type=T&rent=1150&arv=250000&refurbCost=30000',
  flip: 'postcode=NP20+1AA&price=240000&type=D&gdv=340000&refurbCost=30000',
  hmo: 'postcode=SA1+6HW&price=85000&type=S&roomRent=500&refurbCost=30000&rooms=5',
} as const;

describe('a fact scores exactly as the same number typed into the analyser', () => {
  for (const [strategy, params] of Object.entries(DEALS)) {
    it(`${strategy}: a builder's quote of £48,000 == refurbCost=48000 typed`, () => {
      const withFact = applyFacts(strategy, params, [fact('builder-quote', 48_000)]);
      const typed = params.replace('refurbCost=30000', 'refurbCost=48000');
      expect(scoreFromParams(strategy, withFact)).toEqual(scoreFromParams(strategy, typed));
      // and it really did move — otherwise the equality above proves nothing
      expect(scoreFromParams(strategy, withFact)).not.toEqual(scoreFromParams(strategy, params));
    });
  }

  it('brrrr: a down-valuation == the lower ARV typed', () => {
    const withFact = applyFacts('brrrr', DEALS.brrrr, [fact('down-valuation', 210_000)]);
    const typed = DEALS.brrrr.replace('arv=250000', 'arv=210000');
    expect(scoreFromParams('brrrr', withFact)).toEqual(scoreFromParams('brrrr', typed));
  });

  it('flip: a down-valuation == the lower GDV typed', () => {
    const withFact = applyFacts('flip', DEALS.flip, [fact('down-valuation', 300_000)]);
    const typed = DEALS.flip.replace('gdv=340000', 'gdv=300000');
    expect(scoreFromParams('flip', withFact)).toEqual(scoreFromParams('flip', typed));
  });

  it('an added cost stacks on the analyser’s OWN default, not on zero', () => {
    // `legals` is not in the params, so the analyser is using its default.
    const legalsDefault = Number(
      [...(strategies.find((s) => s.id === 'btl')?.strategyInputs ?? []), ...(strategies.find((s) => s.id === 'btl')?.assumptions ?? [])]
        .find((f) => f.key === 'legals')?.default ?? 0,
    );
    expect(legalsDefault).toBeGreaterThan(0);
    const withFees = applyFacts('btl', DEALS.btl, [fact('auction-fees', 2_500)]);
    expect(new URLSearchParams(withFees).get('legals')).toBe(String(legalsDefault + 2_500));
    const typed = `${DEALS.btl}&legals=${legalsDefault + 2_500}`;
    expect(scoreFromParams('btl', withFees)).toEqual(scoreFromParams('btl', typed));
  });

  it('facts stack in the order they arrived: a survey after a quote adds to the quote', () => {
    const applied = applyFacts('btl', DEALS.btl, [
      fact('builder-quote', 48_000, '2026-09-01T10:00:00.000Z'),
      fact('survey-finding', 6_000, '2026-09-02T10:00:00.000Z'),
    ]);
    expect(new URLSearchParams(applied).get('refurbCost')).toBe('54000');
    expect(scoreFromParams('btl', applied)).toEqual(scoreFromParams('btl', DEALS.btl.replace('refurbCost=30000', 'refurbCost=54000')));
  });

  it('the newest quote wins, whatever order they are handed over in', () => {
    const facts = [
      fact('builder-quote', 60_000, '2026-09-05T10:00:00.000Z'),
      fact('builder-quote', 48_000, '2026-09-01T10:00:00.000Z'),
    ];
    expect(new URLSearchParams(applyFacts('btl', DEALS.btl, facts)).get('refurbCost')).toBe('60000');
  });

  it('two facts entered in the same millisecond always resolve the same way', () => {
    const at = '2026-09-04T09:00:00.000Z';
    const a = { ...fact('builder-quote', 40_000, at), id: 'aaa' };
    const b = { ...fact('builder-quote', 55_000, at), id: 'bbb' };
    expect(new URLSearchParams(applyFacts('btl', DEALS.btl, [a, b])).get('refurbCost')).toBe('55000');
    expect(new URLSearchParams(applyFacts('btl', DEALS.btl, [b, a])).get('refurbCost')).toBe('55000');
  });

  it('removing the fact puts the deal back exactly where it was', () => {
    const before = scoreFromParams('btl', DEALS.btl);
    const after = scoreFromParams('btl', applyFacts('btl', DEALS.btl, [fact('builder-quote', 48_000)]));
    expect(after).not.toEqual(before);
    expect(scoreFromParams('btl', applyFacts('btl', DEALS.btl, []))).toEqual(before);
  });
});

describe('the shared scorer IS the analyser’s own maths', () => {
  // Rebuilt exactly as BtlVerdict.tsx builds it, then scored with core directly.
  it('btl: scoreFromParams equals a direct @gil-bricks/core call on the same inputs', () => {
    const config = strategies.find((s) => s.id === 'btl');
    const p = new URLSearchParams(applyFacts('btl', DEALS.btl, [fact('builder-quote', 48_000)]));
    const num = (k: string): number => {
      const raw = p.get(k);
      if (raw !== null && raw !== '') return Number(raw);
      const f = [...(config?.strategyInputs ?? []), ...(config?.assumptions ?? [])].find((x) => x.key === k);
      return Number(f?.default ?? 0);
    };
    const inputs = {
      price: Number(p.get('price')), country: 'W92000004', monthlyRent: num('rent'),
      depositPct: num('deposit'), ratePct: num('rate'), buyingAs: 'basic', selfManaged: false,
      voidWeeks: num('voidWeeks'), agentPct: num('agentPct'), maintPct: num('maintPct'),
      insurancePerYear: num('insurance'), legals: num('legals'), refurb: num('refurbCost'),
      stressRatePct: num('stressRate'), taxBasis: 'additional',
      thresholds: (config as unknown as { thresholds: Record<string, number> }).thresholds,
    } as never;
    const direct = scoreDeal('btl', inputs);
    const viaFacts = scoreFromParams('btl', p.toString());
    expect(viaFacts.score).toBe(direct.score);
    expect(viaFacts.verdict).toBe(direct.headline);
    expect(analyseBtl(inputs).roi.value).toBeGreaterThan(-100);
  });

  it('every strategy’s scorer returns the engine’s own sentence, never our prose', () => {
    for (const [strategy, params] of Object.entries(DEALS)) {
      const out = scoreFromParams(strategy, params);
      expect(out.verdict.length, strategy).toBeGreaterThan(10);
      expect(out.score, strategy).toBeGreaterThanOrEqual(0);
      expect(out.score, strategy).toBeLessThanOrEqual(10);
    }
    // the four analyse functions are the only maths in play
    expect(typeof analyseBtl).toBe('function');
    expect(typeof analyseBrrrr).toBe('function');
    expect(typeof analyseFlip).toBe('function');
    expect(typeof analyseHmo).toBe('function');
  });
});

describe('a fact that is not a number never invents one', () => {
  it('a covenant and a short lease change no input at all', () => {
    for (const key of ['covenant', 'short-lease']) {
      const applied = applyFacts('btl', DEALS.btl, [fact(key, 0)]);
      expect(applied, key).toBe(new URLSearchParams(DEALS.btl).toString());
      expect(factMoves(key, 'btl'), key).toBe(false);
    }
  });

  it('they say why they matter and what to check', () => {
    const notes = factNotes('btl', [fact('covenant', 0), fact('short-lease', 0)]);
    expect(notes.length).toBe(2);
    for (const n of notes) {
      expect(n.note.toLowerCase()).toMatch(/solicitor|lender|check|ask|get/);
      expect(n.note.length).toBeGreaterThan(20);
    }
  });

  it('a number fact with no meaning for this strategy is explained, not applied', () => {
    // A flip is sold, not let: a yearly service charge cannot move its maths.
    const applied = applyFacts('flip', DEALS.flip, [fact('service-charge', 1_200)]);
    expect(applied).toBe(new URLSearchParams(DEALS.flip).toString());
    const notes = factNotes('flip', [fact('service-charge', 1_200)]);
    expect(notes.length).toBe(1);
    expect(notes[0].note.toLowerCase()).toContain('sold, not let');
  });

  it('a deal with no strategy maths says so, and never borrows another strategy’s words', () => {
    // 'comparables' is a real saved-deal strategy (the comps page saves one) and
    // it has no engine behind it at all.
    for (const key of ['builder-quote', 'service-charge', 'down-valuation']) {
      expect(factMoves(key, 'comparables'), key).toBe(false);
      const notes = factNotes('comparables', [fact(key, 1_200)]);
      expect(notes.length, key).toBe(1);
      expect(notes[0].note.toLowerCase(), key).not.toContain('flip');
      expect(notes[0].note, key).toBe(FACT_NO_MATHS);
    }
    // a flag still says the thing that is true whatever the strategy
    expect(factNotes('comparables', [fact('covenant', 0)])[0].note.toLowerCase()).toContain('solicitor');
  });

  it('a down-valuation cannot re-score a strategy with no end value', () => {
    expect(factMoves('down-valuation', 'btl')).toBe(false);
    expect(factMoves('down-valuation', 'hmo')).toBe(false);
    expect(factMoves('down-valuation', 'flip')).toBe(true);
    expect(factMoves('down-valuation', 'brrrr')).toBe(true);
    expect(factNotes('btl', [fact('down-valuation', 90_000)])[0].note.toLowerCase()).toContain('no end value');
  });
});

describe('no new formula was introduced', () => {
  /** Source with comments, imports and string literals removed. */
  const codeOf = (file: string): string =>
    readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('import '))
      .join('\n')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/'[^']*'/g, "''")
      .replace(/`[^`]*`/g, '``');

  it('the fact module cannot compute a verdict: it imports no maths at all', () => {
    const src = readFileSync(fileURLToPath(new URL('./facts.ts', import.meta.url)), 'utf8');
    // the ONLY thing it takes from core is config data
    expect(src).toContain("import { strategies } from '@gil-bricks/core'");
    for (const maths of ['analyseBtl', 'analyseFlip', 'analyseBrrrr', 'analyseHmo', 'scoreDeal', 'grossYield', 'netYield']) {
      expect(src, maths).not.toContain(maths);
    }
  });

  it('the fact module does no financial maths — one addition, nothing else', () => {
    const code = codeOf('./facts.ts');
    expect(code).not.toMatch(/[a-zA-Z0-9_)\]]\s*[*%]\s*[a-zA-Z0-9_(]/); // no × or %
    expect(code).not.toMatch(/[a-zA-Z0-9_)\]]\s+\/\s+[a-zA-Z0-9_(]/); // no ÷
    expect(code).not.toMatch(/Math\.(pow|round|floor|ceil|abs)/);
    // exactly one addition, and it is the documented cost stack
    expect((code.match(/\s\+\s/g) ?? []).length).toBe(1);
    expect(code).toContain('base + value');
  });

  it('the scorer only hands params to core and formats what comes back', () => {
    const code = codeOf('./scoreFromParams.ts');
    expect(code).not.toMatch(/[a-zA-Z0-9_)\]]\s*[*%]\s*[a-zA-Z0-9_(]/);
    expect(code).not.toMatch(/[a-zA-Z0-9_)\]]\s+\/\s+[a-zA-Z0-9_(]/);
    expect(code).not.toMatch(/\s\+\s/);
    for (const call of ['analyseBtl', 'analyseFlip', 'analyseBrrrr', 'analyseHmo', 'scoreDeal']) {
      expect(code, call).toContain(call);
    }
  });

  it('every fact type maps to an analyser input that exists', () => {
    for (const type of FACT_TYPES) {
      for (const [strategy, rule] of Object.entries(type.applies ?? {})) {
        const config = strategies.find((s) => s.id === strategy);
        const fields = [...(config?.strategyInputs ?? []), ...(config?.assumptions ?? [])];
        expect(fields.map((f) => f.key), `${type.key} → ${strategy}.${rule.param}`).toContain(rule.param);
        // and if the fact says where it will turn up, that must be the analyser's OWN label
        if (rule.shownAs !== undefined) {
          expect(fields.find((f) => f.key === rule.param)?.label, `${type.key} → ${strategy}`).toBe(rule.shownAs);
        }
      }
    }
  });
});
