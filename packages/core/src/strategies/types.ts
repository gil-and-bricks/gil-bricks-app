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
  /** One-line "why this default" note, shown in the assumptions accordion. */
  whyDefault?: string;
  /** Render only when another field holds a value (companion fields). */
  showWhen?: { key: string; value: string };
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
  /** Editable assumptions (collapsed accordion), each with whyDefault. */
  assumptions: StrategyField[];
  /** Verdict thresholds — tune here, never in code. */
  thresholds: Record<string, number>;
  /** Island component name registered in AnalyserApp; null = placeholder. */
  verdictSlot: string | null;
  copy: Record<string, string>;
  /** Feature flags for loosely-coupled modules (e.g. showGdvModule). */
  flags?: Record<string, boolean>;
}
