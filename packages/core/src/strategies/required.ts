/**
 * WHICH FIELD IS THE VERDICT WAITING FOR?
 *
 * One function, so all four strategies answer it the same way. Before this,
 * each verdict island computed its own readiness from hardcoded field keys and
 * printed its own sentence — four expressions, three different strings, and
 * when the answer could not be produced the Verdict, Figures and Costs sections
 * simply vanished. An absent section with no explanation reads as a broken
 * page, and it was read as one for two days.
 *
 * The keys live in each StrategyConfig (`requiredForVerdict`), so the sentence
 * on screen always names the real field, in the field's own words, and cannot
 * drift from the config that decides it.
 */
import type { StrategyConfig, StrategyField } from './types';

/** Is this value a real number the engines can use? */
const filled = (raw: string | undefined): boolean => {
  if (raw === undefined) return false;
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && n > 0;
};

/** Every field this strategy still needs, in config order. Empty = ready. */
export function missingForVerdict(
  config: StrategyConfig,
  params: Readonly<Record<string, string>>,
): StrategyField[] {
  const all = [...config.strategyInputs, ...config.assumptions];
  return config.requiredForVerdict
    .filter((key) => !filled(params[key]))
    .map((key) => all.find((f) => f.key === key))
    .filter((f): f is StrategyField => f !== undefined);
}

/**
 * Is every required field reachable WITHOUT opening the collapsed assumptions?
 *
 * Refusing to show a verdict while hiding the one field that would produce it
 * is a dead end anyone would hit, and nothing would have caught it: the field
 * exists, the config is valid, and the page renders. Tested, not assumed.
 */
export function requiredFieldsAreVisible(config: StrategyConfig): string[] {
  const visible = new Set(config.strategyInputs.map((f) => f.key));
  const collapsed = new Set(config.assumptions.map((f) => f.key));
  return config.requiredForVerdict.filter((key) => !visible.has(key) || collapsed.has(key));
}
