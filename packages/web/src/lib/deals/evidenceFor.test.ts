// @vitest-environment happy-dom
/**
 * EVIDENCE CHIPS ON THE BOARD (P7), and the promise that all three surfaces
 * agree about the same deal.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evidenceChips, evidenceSentence } from '@gil-bricks/core';
import { evidenceInputsFor, presentKeys } from './evidenceFor';
import type { DealFact } from './facts';
import { analyserEvidence, initArrivedFacts } from '../../components/analyser/analyserEvidence';
import { editedKeys, markEdited } from '../../components/analyser/provenance';
import { initStrategyParams, parseQuery, state, strategyParams, toQuery, type StrategyFieldSpec } from '../../components/analyser/state';
import { strategies } from '@gil-bricks/core';
import { dealHref } from './deal';
import { READ_ONCE } from '../../components/analyser/arrival';

const fact = (type: string, over: Partial<DealFact> = {}): DealFact => ({
  id: type, deal_id: 'd1', fact_type: type, value: 48_000, entered_at: '2026-09-06T09:00:00.000Z', ...over,
});
const DEAL = {
  url_params: 'postcode=CF11+9AB&paon=12&price=105000&type=T&rent=1250&arv=200000&refurbCost=30000',
  sold_evidence: 'null' as string | null,
  room_size_failures: null as number | null,
};
const st = (chips: { key: string; state: string }[], key: string) => chips.find((c) => c.key === key)?.state;

describe('what the board knows', () => {
  it('reads presence, not size: a param with a value counts, an empty one does not', () => {
    expect(presentKeys('a=1&b=&c=0')).toEqual(['a', 'c']);
  });

  it('a deal with numbers but no facts is all assumption', () => {
    const chips = evidenceChips('brrrr', evidenceInputsFor(DEAL, []));
    expect(st(chips, 'refurb')).toBe('assumed');
    expect(st(chips, 'endValue')).toBe('assumed');
    expect(st(chips, 'rent')).toBe('assumed');
    expect(st(chips, 'comps')).toBe('unknown');
  });

  it('a builder’s quote fills the refurb chip — and only that one', () => {
    const chips = evidenceChips('brrrr', evidenceInputsFor(DEAL, [fact('builder-quote')]));
    expect(st(chips, 'refurb')).toBe('evidenced');
    expect(st(chips, 'endValue')).toBe('assumed');
    expect(st(chips, 'rent')).toBe('assumed');
  });

  it('a FOLDED fact still evidences its input — the quote is in these numbers', () => {
    const folded = [fact('builder-quote', { folded_at: '2026-09-07T09:00:00.000Z' })];
    expect(st(evidenceChips('brrrr', evidenceInputsFor(DEAL, folded)), 'refurb')).toBe('evidenced');
  });

  it('a stored sold-price band is what fills the comps chip', () => {
    const withBand = { ...DEAL, sold_evidence: '{"estimate":210000,"high":232000}' };
    expect(st(evidenceChips('brrrr', evidenceInputsFor(withBand, [])), 'comps')).toBe('evidenced');
    // 'null' means "we know there were none", SQL NULL means "we do not know" —
    // neither is evidence, and neither pretends to be
    expect(st(evidenceChips('brrrr', evidenceInputsFor({ ...DEAL, sold_evidence: null }, [])), 'comps')).toBe('unknown');
  });

  it('measured rooms fill the HMO room-sizes chip', () => {
    const hmo = { ...DEAL, url_params: 'postcode=SA1+6HW&price=85000&roomRent=500&refurbCost=40000', room_size_failures: 0 };
    expect(st(evidenceChips('hmo', evidenceInputsFor(hmo, [])), 'roomSizes')).toBe('evidenced');
  });
});

const fieldsOf = (id: string): StrategyFieldSpec[] => {
  const c = strategies.find((s) => s.id === id);
  return [...(c?.strategyInputs ?? []), ...(c?.assumptions ?? [])].map((f) => ({
    key: f.key, kind: f.kind === 'select' ? 'select' : 'number', default: f.default, options: f.options,
  }));
};

describe('the same deal reads the same on the board and in the analyser', () => {

  it('board chips === analyser chips, for a deal opened from its own card', () => {
    const facts = [fact('builder-quote')];
    const board = evidenceChips('brrrr', evidenceInputsFor(DEAL, facts));

    // the link the board builds carries the fact KEYS, so the analyser is not
    // left calling an evidenced number a guess
    const href = dealHref('brrrr', DEAL.url_params, undefined, 'd1', undefined, facts.map((f) => f.fact_type));
    expect(href).toContain('ev=builder-quote');
    window.history.replaceState({}, '', href);
    state.value = parseQuery(location.search);
    initStrategyParams(fieldsOf('brrrr'));
    initArrivedFacts(location.search);
    const analyser = evidenceChips('brrrr', analyserEvidence(false, null, 'brrrr'));

    expect(analyser).toEqual(board);
    expect(evidenceSentence('6.8', analyser)).toBe(evidenceSentence('6.8', board));
  });

  it('the analyser knows the comps it has loaded, and says so', () => {
    window.history.replaceState({}, '', dealHref('brrrr', DEAL.url_params, undefined, 'd1'));
    state.value = parseQuery(location.search);
    initStrategyParams(fieldsOf('brrrr'));
    initArrivedFacts(location.search);
    expect(st(evidenceChips('brrrr', analyserEvidence(true, null, 'brrrr')), 'comps')).toBe('evidenced');
    expect(st(evidenceChips('brrrr', analyserEvidence(false, null, 'brrrr')), 'comps')).toBe('unknown');
  });

  it('a field left on its config default is not an assumption, on either surface', () => {
    // a BTL where Refurb budget was never touched: its default is '0', and the
    // analyser's URL writer drops it, so the saved deal has no refurbCost either
    const url = '/buy-to-let/analyser?postcode=CF11+9AB&paon=12&price=150000&type=T&rent=1100';
    window.history.replaceState({}, '', url);
    state.value = parseQuery(location.search);
    initStrategyParams(fieldsOf('btl'));
    initArrivedFacts(location.search);
    const analyser = evidenceChips('btl', analyserEvidence(true, null, 'btl'));
    const saved = toQuery(state.value, strategyParams.value).replace(/^\?/, '');
    expect(saved).not.toContain('refurbCost');
    const board = evidenceChips('btl', evidenceInputsFor({ url_params: saved, sold_evidence: '{"estimate":160000,"high":175000}' }, []));
    expect(analyser).toEqual(board);
    expect(st(analyser, 'refurb')).toBe('unknown');
  });

  it('the read-once params never survive a copied link', () => {
    // ev/deal/factsAt are metadata about MY deal. A link shared before the first
    // edit must not tell a stranger's page that their numbers are evidenced.
    const href = dealHref('brrrr', DEAL.url_params, undefined, 'd1', '2026-09-06T09:00:00.000Z', ['builder-quote']);
    expect(href).toContain('ev=');
    expect(href).toContain('deal=');
    expect(href).toContain('factsAt=');
    for (const key of ['src', 'areaSrc', 'deal', 'factsAt', 'ev']) {
      expect(READ_ONCE as readonly string[], `${key} must be stripped from the URL once read`).toContain(key);
    }
    // and the analyser is what strips them
    // cwd is the package root under vitest; happy-dom has no file: URL to resolve against
    expect(readFileSync('src/components/analyser/AnalyserApp.tsx', 'utf8')).toContain('for (const k of READ_ONCE) q.delete(k);');
  });

  it('a number typed OVER an evidenced one is the typist’s again', () => {
    const href = dealHref('brrrr', DEAL.url_params, undefined, 'd1', undefined, ['builder-quote']);
    window.history.replaceState({}, '', href);
    state.value = parseQuery(location.search);
    initStrategyParams(fieldsOf('brrrr'));
    initArrivedFacts(location.search);
    expect(st(evidenceChips('brrrr', analyserEvidence(false, null, 'brrrr')), 'refurb')).toBe('evidenced');
    // the person edits the refurb box: the quote's number is no longer in it
    markEdited('refurbCost');
    expect(st(evidenceChips('brrrr', analyserEvidence(false, null, 'brrrr')), 'refurb')).toBe('assumed');
    editedKeys.value = new Set();
  });

  it('a surface that cannot know a fact says assumed — never evidenced', () => {
    // this is the extension's position: a listing, no deal, so no facts
    const listingSide = evidenceChips('brrrr', { present: presentKeys(DEAL.url_params), facts: [] });
    const boardSide = evidenceChips('brrrr', evidenceInputsFor(DEAL, [fact('builder-quote')]));
    for (const c of listingSide) {
      const mine = boardSide.find((b) => b.key === c.key);
      const rank = { unknown: 0, assumed: 1, evidenced: 2 } as Record<string, number>;
      expect(rank[c.state], `${c.key} must never over-claim`).toBeLessThanOrEqual(rank[mine?.state ?? 'unknown']);
    }
  });
});
