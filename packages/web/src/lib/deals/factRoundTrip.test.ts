// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { strategies, type StrategyConfig } from '@gil-bricks/core';
import { parseQuery, initStrategyParams, state, strategyParams, toQuery, type StrategyFieldSpec } from '../../components/analyser/state';
import { applyFacts, type DealFact } from './facts';
import { scoreFromParams } from './scoreFromParams';
import { dealHref } from './deal';

/**
 * THE FACT IS THE TRUTH FROM THEN ON (P5).
 *
 * The board links a card to its analyser with the fact-corrected params. This
 * drives that link through the ANALYSER'S OWN reader (parseQuery +
 * initStrategyParams) and its own writer (toQuery), then scores what comes out.
 * If a fact ever failed to survive the trip, the page would quietly show the
 * old guess again — and this fails instead.
 */
const fieldsOf = (config: StrategyConfig): StrategyFieldSpec[] =>
  [...config.strategyInputs, ...config.assumptions].map((f) => ({
    key: f.key, kind: f.kind === 'select' ? 'select' : 'number', default: f.default, options: f.options,
  }));

const DEAL = { strategy: 'brrrr', params: 'postcode=CF11+9AB&price=120000&type=T&rent=1150&arv=250000&refurbCost=30000' };
const quote: DealFact = { id: 'f1', deal_id: 'd1', fact_type: 'builder-quote', value: 48_000, entered_at: '2026-09-04T09:00:00.000Z' };

describe('a fact survives into the analyser', () => {
  it('opening the deal shows the fact-corrected refurb, not the original guess', () => {
    const config = strategies.find((s) => s.id === DEAL.strategy) as StrategyConfig;
    const href = dealHref(DEAL.strategy, applyFacts(DEAL.strategy, DEAL.params, [quote]));
    expect(href.startsWith(`${config.route}/analyser?`)).toBe(true);

    window.history.replaceState({}, '', href);
    state.value = parseQuery(location.search);
    initStrategyParams(fieldsOf(config));

    // the analyser's own reader has the quote, not the £30,000 assumption
    expect(strategyParams.value.refurbCost).toBe('48000');
    expect(state.value.price).toBe('120000');
    expect(state.value.postcode).toBe('CF11 9AB');
    expect(strategyParams.value.arv).toBe('250000');
  });

  it('what the analyser writes back scores exactly as £48,000 typed in', () => {
    const config = strategies.find((s) => s.id === DEAL.strategy) as StrategyConfig;
    window.history.replaceState({}, '', dealHref(DEAL.strategy, applyFacts(DEAL.strategy, DEAL.params, [quote])));
    state.value = parseQuery(location.search);
    initStrategyParams(fieldsOf(config));

    // round trip closed: read by the analyser, written back by the analyser
    const written = toQuery(state.value, strategyParams.value).replace(/^\?/, '');
    expect(new URLSearchParams(written).get('refurbCost')).toBe('48000');
    expect(scoreFromParams(DEAL.strategy, written))
      .toEqual(scoreFromParams(DEAL.strategy, DEAL.params.replace('refurbCost=30000', 'refurbCost=48000')));
    // and it is genuinely different from the deal before the quote
    expect(scoreFromParams(DEAL.strategy, written)).not.toEqual(scoreFromParams(DEAL.strategy, DEAL.params));
  });
});
