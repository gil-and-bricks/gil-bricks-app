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
 *  - the sold-price band only if the deal stored one (P5.1); without it, that
 *    component scores as unknown, and the board says so on the card;
 *  - HMO room sizes only if the deal stored the result (P6); without it they
 *    score as unmeasured, exactly as a freshly opened page does;
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

/**
 * The sold-price band a score was judged against — exactly what the analyser
 * hands `scoreDeal`. Passing it through is why a fact can move a score only for
 * the fact's own reason (P5.1).
 */
export interface SoldEvidence {
  estimate: number;
  high: number;
}

/** The band a deal stored, or null when it was scored without one. Anything
 * malformed reads as null — a wrong band would move a score invisibly. */
export function parseStoredEvidence(raw: string | null | undefined): SoldEvidence | null {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const v = JSON.parse(raw) as { estimate?: unknown; high?: unknown } | null;
    if (v === null) return null;
    const estimate = Number(v.estimate);
    const high = Number(v.high);
    return Number.isFinite(estimate) && Number.isFinite(high) && estimate > 0 && high > 0 ? { estimate, high } : null;
  } catch {
    return null;
  }
}

export interface ParamScore {
  score: number;
  /** The board's headline figure, in the same shape a real save writes. */
  figure: string;
  /** The engine's own verdict sentence — never hand-written prose. */
  verdict: string;
  /**
   * The cash this deal needs, from the SAME analysis the score came out of —
   * BTL/HMO cash in, BRRRR/Flip cash invested. The calendar export puts it in an
   * auction event, because it is the number people forget (P10). Nothing else
   * reads it, and nothing here computes it: it comes back from core.
   */
  cashNeeded: number;
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
export function scoreFromParams(
  strategy: string, urlParams: string, evidence?: SoldEvidence | null, roomSizeFailures?: number | null,
): ParamScore {
  const params = new URLSearchParams(urlParams);
  const config = configFor(strategy);
  // The SAME third argument the analyser passes: the sold-price band. Undefined
  // means no evidence, which the engine scores as unknown — the honest answer.
  const ev = evidence ?? undefined;
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
    const d = scoreDeal('btl', inputs, ev);
    return { score: d.score, figure: BTL_COPY.savedHeadline(fmtPct(a.roi.value)), verdict: d.headline, cashNeeded: a.cashIn.value };
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
    const d = scoreDeal('flip', inputs, ev);
    return { score: d.score, figure: FLIP_COPY.savedHeadline(fmtMoney(a.profitAfterTax.value)), verdict: d.headline, cashNeeded: a.cashInvested.value };
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
    const d = scoreDeal('brrrr', inputs, ev);
    // BRRRR saves its outcome sentence as the board figure, like the analyser.
    return { score: d.score, figure: a.outcomeVerdict, verdict: d.headline, cashNeeded: a.cashInvested.value };
  }

  // The analyser defaults to four rooms and reports room sizes as UNKNOWN
  // (null, not zero) until someone types them — match both exactly, or the card
  // and the page disagree.
  // '7plus' is sui generis: the analyser REFUSES to score it (it is a planning
  // question, not a maths one). Refuse it here too, rather than inventing a
  // score for a deal the page itself will not score (P6 review).
  const roomsRaw = str('rooms');
  if (roomsRaw !== '' && !(Number(roomsRaw) > 0)) throw new Error(`hmo cannot be scored with rooms "${roomsRaw}"`);
  const rooms = num('rooms') > 0 ? num('rooms') : 4;
  const selfManaged = str('mgmt') === 'self';
  const inputs = {
    price, country, rooms, roomRent: num('roomRent'), billsIncluded: str('bills') !== 'no',
    refurb: num('refurbCost'), buyingAs, selfManaged, depositPct: num('deposit'), ratePct: num('rate'),
    opCostPct: selfManaged ? num('opCostPctSelf') : num('opCostPctAgent'),
    licenceFee: num('licenceFee'), licenceYears: 5, compliancePerYear: num('compliancePerYear'),
    legals: num('legals'), stressRatePct: num('stressRate'), taxBasis,
    // What the SAVE knew: null only when the rooms were never measured.
    roomSizeFailures: roomSizeFailures ?? null,
    thresholds: thresholdsOf(config),
  } as never;
  const a = analyseHmo(inputs);
  const d = scoreDeal('hmo', inputs, ev);
  return { score: d.score, figure: HMO_COPY.savedHeadline(fmtPct(a.roi.value)), verdict: d.headline, cashNeeded: a.cashIn.value };
}
