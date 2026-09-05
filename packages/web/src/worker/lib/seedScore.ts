/**
 * Scoring for the DEV SEED (D2) — dev-only, but it must not lie.
 *
 * The seeded board used to carry hand-written scores and verdict sentences the
 * engine could never produce, so a card and the analyser it links to disagreed
 * for ever (opening a scored deal does not re-score it). This module runs the
 * SAME @gil-bricks/core calls each verdict island runs, from the same URL
 * params and the same StrategyConfig defaults, so a seeded card says exactly
 * what its analyser will say.
 *
 * The one honest difference: a seeded score is computed with NO valuation,
 * because there is no sold-price fetch at seed time. That is precisely what the
 * analyser produces on a page whose comparables have not loaded a valuation, so
 * it is reproducible rather than invented.
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

export interface SeedScore {
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

const thresholdsOf = (config: StrategyConfig): Record<string, number> =>
  (config as unknown as { thresholds: Record<string, number> }).thresholds;

/**
 * Score one seeded deal exactly as its analyser would, with no valuation.
 * Every strategy is a purchase in Wales or England; the country comes from the
 * postcode's own prefix so the tax is the one the analyser would charge.
 */
export function seedScoreFor(strategy: string, urlParams: string): SeedScore {
  const params = new URLSearchParams(urlParams);
  const config = configFor(strategy);
  const { num, str } = reader(config, params);
  const price = Number(params.get('price') ?? 0);
  const postcode = (params.get('postcode') ?? '').toUpperCase();
  // Welsh postcode areas, the same set the sector data is built from.
  const welsh = /^(CF|LD|LL|NP|SA|SY|HR|CH|WR)/.test(postcode.trim());
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
    return { score: d.score, figure: `ROI ${fmtPct(a.roi.value)}`, verdict: d.headline };
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
    return { score: d.score, figure: `${fmtMoney(a.profitAfterTax.value)} profit after tax`, verdict: d.headline };
  }

  if (strategy === 'brrrr') {
    const inputs = {
      price, country, refurb: num('refurbCost'), arv: num('arv'),
      funding: str('funding') === 'cash' ? 'cash' : 'bridging', bridgeMonths: num('bridgeMonths'),
      monthlyRent: num('rent'), ltvPct: num('ltv') > 0 ? num('ltv') : 75, buyingAs,
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
  return { score: d.score, figure: `ROI ${fmtPct(a.roi.value)}`, verdict: d.headline };
}
