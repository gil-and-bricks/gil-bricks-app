/**
 * ONE way to score a deal from its own URL params (D2, generalised in P5).
 *
 * This runs the SAME @gil-bricks/core calls each verdict island runs, from the
 * same params and the same StrategyConfig defaults, so a board card, a re-score
 * after a fact, and the analyser page all produce the same number. There is no
 * second pathway into the maths and NO FORMULA LIVES HERE — every figure comes
 * back from core.
 *
 * Two callers: the dev seed (so a seeded card cannot disagree with its own
 * analyser) and the fact re-score (so a builder's quote of £48,000 scores
 * exactly as £48,000 typed into the analyser would).
 *
 * WHAT THIS CANNOT SEE, said plainly. It scores from the URL alone, so it is
 * exactly the analyser page BEFORE its comparables land and before anyone
 * measures a room:
 *  - no sold-price evidence, so that component scores as unknown;
 *  - HMO room sizes are unmeasured (they live in the page, never in the URL);
 *  - the country comes from the postcode area, not from ONSPD.
 * Nothing here is invented — it is the same engine on less evidence.
 */
import {
  analyseBtl,
  analyseBrrrr,
  analyseFlip,
  analyseHmo,
  fmtMoney,
  fmtPct,
  scoreDeal,
  strategies,
  type StrategyConfig,
} from '@gil-bricks/core';
// The board figure uses the analyser's OWN copy functions, so the card cannot
// word a figure differently from the page it links to.
import { BTL_COPY, FLIP_COPY, HMO_COPY } from '../../config/verdicts';

export interface ParamScore {
  score: number;
  /** The board's headline figure, in the same shape a real save writes. */
  figure: string;
  /** The engine's own verdict sentence — never hand-written prose. */
  verdict: string;
}

const configFor = (id: string): StrategyConfig => {
  const c = strategies.find((s) => s.id === id);
  if (!c) throw new Error(`unknown strategy "${id}"`);
  return c;
};

/** Field value: the URL param if present, else the strategy's own default. */
function reader(config: StrategyConfig, params: URLSearchParams) {
  const fields = [...config.strategyInputs, ...config.assumptions];
  return {
    num: (key: string): number => {
      const raw = params.get(key);
      if (raw !== null && raw.trim() !== '') return Number(raw);
      const field = fields.find((f) => f.key === key);
      return Number(field?.default ?? 0);
    },
    str: (key: string): string => {
      const raw = params.get(key);
      if (raw !== null && raw.trim() !== '') return raw;
      const field = fields.find((f) => f.key === key);
      return String(field?.default ?? '');
    },
  };
}

/** A field's own default from the StrategyConfig — config data, never a formula. */
const defaultOf = (config: StrategyConfig, key: string): string =>
  String([...config.strategyInputs, ...config.assumptions].find((f) => f.key === key)?.default ?? '');

const thresholdsOf = (config: StrategyConfig): Record<string, number> =>
  (config as unknown as { thresholds: Record<string, number> }).thresholds;

/**
 * Score a deal exactly as its analyser would, with no valuation.
 * Every strategy is a purchase in Wales or England; the country comes from the
 * postcode's own prefix so the tax is the one the analyser would charge.
 */
export function scoreFromParams(strategy: string, urlParams: string): ParamScore {
  const params = new URLSearchParams(urlParams);
  const config = configFor(strategy);
  const { num, str } = reader(config, params);
  const configDefault = (key: string): string => defaultOf(config, key);
  const price = Number(params.get('price') ?? 0);
  const postcode = (params.get('postcode') ?? '').toUpperCase();
  // The analyser reads CTRY from ONSPD (comps.subject.country). There is no
  // ONSPD lookup here, so this uses the postcode areas that lie ENTIRELY in
  // Wales; the cross-border ones (CH, HR, SY, WR) are mostly England and are
  // treated as England. A cross-border property therefore re-scores on SDLT
  // where the analyser would use LTT — see docs/PIPELINE_STATUS.md.
  const welsh = /^(CF|LD|LL|NP|SA)\d/.test(postcode.trim());
  const country = welsh ? 'W92000004' : 'E92000001';
  const taxBasis = str('taxBasis') === '' ? 'additional' : str('taxBasis');
  const buyingAs = str('buyingAs') === '' ? 'basic' : str('buyingAs');

  if (strategy === 'btl') {
    const inputs = {
      price, country, monthlyRent: num('rent'), depositPct: num('deposit'), ratePct: num('rate'),
      buyingAs, selfManaged: str('mgmt') === 'self', voidWeeks: num('voidWeeks'), agentPct: num('agentPct'),
      maintPct: num('maintPct'), insurancePerYear: num('insurance'), legals: num('legals'),
      refurb: num('refurbCost'), stressRatePct: num('stressRate'), taxBasis, thresholds: thresholdsOf(config),
    } as never;
    const a = analyseBtl(inputs);
    const d = scoreDeal('btl', inputs);
    return { score: d.score, figure: BTL_COPY.savedHeadline(fmtPct(a.roi.value)), verdict: d.headline };
  }

  if (strategy === 'flip') {
    const isLtd = str('flipAs') === 'ltd';
    const inputs = {
      price, country, refurb: num('refurbCost'), gdv: num('gdv'),
      funding: str('funding') === 'cash' ? 'cash' : 'bridging', months: num('bridgeMonths'),
      agentSalePctExVat: num('agentSalePct'), saleLegals: num('saleLegals'),
      flipAs: isLtd ? 'ltd' : 'personal', incomeBand: str('incomeBand') === 'basic' ? 'basic' : 'higher',
      bridgeLoanPct: num('bridgeLoanPct'), bridgeRatePctMonth: num('bridgeRate'),
      arrangementPct: num('arrangementPct'), exitPct: num('exitPct'), legals: num('legals'),
      contingencyPct: num('contingencyPct'), taxBasis, thresholds: thresholdsOf(config),
    } as never;
    const a = analyseFlip(inputs);
    const d = scoreDeal('flip', inputs);
    return { score: d.score, figure: FLIP_COPY.savedHeadline(fmtMoney(a.profitAfterTax.value)), verdict: d.headline };
  }

  if (strategy === 'brrrr') {
    // EXACTLY as BrrrrVerdict maps it: the picker holds a number or the word
    // 'custom', and 'custom' means read the number the person typed instead.
    const ltvRaw = str('ltv');
    const ltvPct = ltvRaw === 'custom' ? num('ltvCustom') : Number(ltvRaw) || Number(configDefault('ltv'));
    const inputs = {
      price, country, refurb: num('refurbCost'), arv: num('arv'),
      funding: str('funding') === 'cash' ? 'cash' : 'bridging', bridgeMonths: num('bridgeMonths'),
      monthlyRent: num('rent'), ltvPct, buyingAs,
      selfManaged: str('mgmt') === 'self', bridgeLoanPct: num('bridgeLoanPct'),
      bridgeRatePctMonth: num('bridgeRate'), arrangementPct: num('arrangementPct'), exitPct: num('exitPct'),
      legals: num('legals'), refiLegals: num('refiLegals'), voidWeeks: num('voidWeeks'),
      agentPct: num('agentPct'), maintPct: num('maintPct'), insurancePerYear: num('insurance'),
      refiRatePct: num('rate'), stressRatePct: num('stressRate'), taxBasis, thresholds: thresholdsOf(config),
    } as never;
    const a = analyseBrrrr(inputs);
    const d = scoreDeal('brrrr', inputs);
    // BRRRR saves its outcome sentence as the board figure, like the analyser.
    return { score: d.score, figure: a.outcomeVerdict, verdict: d.headline };
  }

  // The analyser defaults to four rooms and reports room sizes as UNKNOWN
  // (null, not zero) until someone types them — match both exactly, or the card
  // and the page disagree.
  const rooms = num('rooms') > 0 ? num('rooms') : 4;
  const selfManaged = str('mgmt') === 'self';
  const inputs = {
    price, country, rooms, roomRent: num('roomRent'), billsIncluded: str('bills') !== 'no',
    refurb: num('refurbCost'), buyingAs, selfManaged, depositPct: num('deposit'), ratePct: num('rate'),
    opCostPct: selfManaged ? num('opCostPctSelf') : num('opCostPctAgent'),
    licenceFee: num('licenceFee'), licenceYears: 5, compliancePerYear: num('compliancePerYear'),
    legals: num('legals'), stressRatePct: num('stressRate'), taxBasis, roomSizeFailures: null,
    thresholds: thresholdsOf(config),
  } as never;
  const a = analyseHmo(inputs);
  const d = scoreDeal('hmo', inputs);
  return { score: d.score, figure: HMO_COPY.savedHeadline(fmtPct(a.roi.value)), verdict: d.headline };
}
