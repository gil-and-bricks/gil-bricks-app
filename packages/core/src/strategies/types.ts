/**
 * StrategyConfig — adding or tuning a strategy is a CONFIG edit, never an
 * engine change (CLAUDE.md golden rule 2). Routes, landing pages, strategy
 * inputs, assumptions and verdict thresholds all render from these objects;
 * the only per-strategy CODE is one verdict island named by `verdictSlot`
 * (see docs/STRATEGY_CONFIG_GUIDE.md).
 */
export interface StrategyField {
  /** URL/query key — must be unique across shared + strategy fields. */
  key: string;
  label: string;
  kind: 'number' | 'select';
  /** Display unit, e.g. "£/month", "%", "weeks/yr". */
  unit?: string;
  default: string;
  options?: { value: string; label: string }[];
  /** Tooltip microcopy (placeholder until S8). */
  tip: string;
  /** Render only when another field holds a value (companion fields). */
  showWhen?: { key: string; value: string };
}


/**
 * Deal Score component (S8/E2). Each maps to a metric the strategy already
 * computes and is scored against the SAME Green/Amber/Red thresholds — the
 * weights are tuned so a Green deal can never score < 6 and a Red can never
 * reach 8 (asserted in tests). `gate` marks the components that gate the
 * existing Green verdict (as opposed to the sold-evidence extra).
 */
export interface ScoreComponent {
  /** Extractor key known to scoreDeal: icr | cashflow | roi | moneyLeftIn | profit | evidence | roomSize. */
  key: string;
  /** Plain-English component name shown in the breakdown. */
  name: string;
  /** Points this component is worth (all components sum to 10). */
  weight: number;
  /** True if this component must be green for the existing Green verdict. */
  gate: boolean;
}

export interface StrategyConfig {
  id: 'btl' | 'flip' | 'brrrr' | 'hmo';
  name: string;
  /** Compact nav label (falls back to name). */
  shortName?: string;
  route: string;
  tagline: string;
  heroLine: string;
  /** Visible strategy inputs (max 7 logical, companions excluded — simplicity law). */
  strategyInputs: StrategyField[];
  /** Editable assumptions, in a collapsed accordion. */
  assumptions: StrategyField[];
  /** Verdict thresholds — tune here, never in code. */
  thresholds: Record<string, number>;
  /** Island component name registered in AnalyserApp; null = placeholder. */
  verdictSlot: string | null;
  copy: Record<string, string>;
  /** Deal Score components (config-driven, not hardcoded). */
  score: ScoreComponent[];
  /** Feature flags for loosely-coupled modules (e.g. showGdvModule). */
  flags?: Record<string, boolean>;
}
