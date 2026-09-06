/**
 * Applying facts to a deal (P5).
 *
 * A deal is a living estimate. When the builder's quote lands, the quote IS the
 * refurb figure from then on — the original guess does not come back. This
 * module turns a deal's facts into the analyser inputs they represent, and
 * nothing else: it rewrites URL params, so a fact becomes exactly the input a
 * person could have typed.
 *
 * NO MATHS LIVES HERE. The only arithmetic is stacking two costs the operator
 * has told us about ('add'), which is what the config says the fact does; every
 * figure that reaches a screen still comes back from @gil-bricks/core.
 */
import { strategies } from '@gil-bricks/core';
import { FACT_NO_EFFECT, FACT_NO_MATHS, FACT_TYPES, type FactType } from '../../config/pipeline';

export interface DealFact {
  id: string;
  /** Which deal it belongs to — the board holds them all in one list. */
  deal_id: string;
  fact_type: string;
  /** The number the person typed — null for a flag, which has no number. */
  value: number | null;
  note?: string | null;
  entered_at: string;
  /**
   * Set once the fact has been folded into the deal's own numbers by a save from
   * the analyser (P6). It is still shown — it is why the deal moved — but it is
   * no longer applied, or it would be counted twice.
   */
  folded_at?: string | null;
}

export const factTypeFor = (key: string): FactType | undefined => FACT_TYPES.find((f) => f.key === key);

/** The analyser's own default for a field — config data, never a formula. */
function defaultFor(strategy: string, param: string): number {
  const config = strategies.find((s) => s.id === strategy);
  const field = [...(config?.strategyInputs ?? []), ...(config?.assumptions ?? [])].find((f) => f.key === param);
  const n = Number(field?.default ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Does this fact change the numbers for THIS strategy? */
export function factMoves(fact: string, strategy: string): boolean {
  const t = factTypeFor(fact);
  return t !== undefined && t.kind === 'number' && t.applies?.[strategy] !== undefined;
}

/**
 * The deal's params with every fact applied, oldest first, so the newest fact of
 * a kind wins a 'replace' and every 'add' stacks. Facts that cannot move this
 * strategy's maths are ignored here — they are shown on the deal instead.
 */
export function applyFacts(strategy: string, urlParams: string, facts: readonly DealFact[]): string {
  const params = new URLSearchParams(urlParams);
  // Oldest first. Two facts entered in the same millisecond fall back to their
  // ids, so the order is the same on every device and every reload.
  const ordered = [...facts]
    // A folded fact is already IN these params. Applying it again double-counts.
    .filter((f) => f.folded_at === null || f.folded_at === undefined)
    .sort((a, b) => a.entered_at.localeCompare(b.entered_at) || a.id.localeCompare(b.id));
  for (const fact of ordered) {
    const type = factTypeFor(fact.fact_type);
    const rule = type?.kind === 'number' ? type.applies?.[strategy] : undefined;
    const value = fact.value;
    if (!rule || value === null || !Number.isFinite(value)) continue;
    if (rule.mode === 'replace') {
      params.set(rule.param, String(value));
      continue;
    }
    // 'add' stacks on what the analyser would already be using — the typed
    // value if there is one, otherwise the strategy's OWN default, so the deal
    // ends up exactly where typing the total into the analyser would put it.
    const typed = Number(params.get(rule.param) ?? '');
    const base = Number.isFinite(typed) && params.get(rule.param) !== null && params.get(rule.param) !== ''
      ? typed
      : defaultFor(strategy, rule.param);
    params.set(rule.param, String(base + value));
  }
  return params.toString();
}

/**
 * The number a fact is about to replace, or be added to — so the change line can
 * say "you'd put £30,000". Reads the deal's own param, or the strategy's own
 * default when the param is absent. Returns null when the fact carries no number
 * for this strategy, or when it is an added cost with nothing to name. (P6)
 */
export function previousValueFor(strategy: string, urlParams: string, factType: string): number | null {
  const type = factTypeFor(factType);
  const rule = type?.kind === 'number' ? type.applies?.[strategy] : undefined;
  if (!rule || rule.mode !== 'replace') return null;
  const params = new URLSearchParams(urlParams);
  const raw = params.get(rule.param);
  const typed = Number(raw);
  if (raw !== null && raw !== '' && Number.isFinite(typed)) return typed;
  const fallback = defaultFor(strategy, rule.param);
  return fallback > 0 ? fallback : null;
}

/** Facts that carry no maths for this strategy: what the deal should say. */
export interface FactNote {
  fact: DealFact;
  label: string;
  /** Why it matters and what to check — never an invented cost. */
  note: string;
}

export function factNotes(strategy: string, facts: readonly DealFact[]): FactNote[] {
  // A deal saved from the comparables page has no strategy engine behind it, so
  // NOTHING can re-score it. Say that, rather than a note written for a strategy
  // this deal is not.
  const scored = strategies.some((s) => s.id === strategy);
  const out: FactNote[] = [];
  for (const fact of facts) {
    const type = factTypeFor(fact.fact_type);
    if (!type) continue;
    if (type.kind === 'flag') {
      out.push({ fact, label: type.label, note: type.flagNote ?? '' });
    } else if (!scored) {
      out.push({ fact, label: type.label, note: FACT_NO_MATHS });
    } else if (type.applies?.[strategy] === undefined) {
      out.push({ fact, label: type.label, note: type.noEffect ?? FACT_NO_EFFECT });
    }
  }
  return out;
}
