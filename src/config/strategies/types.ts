/**
 * StrategyConfig — adding or tuning a strategy is a CONFIG edit, never an
 * engine change (CLAUDE.md golden rule 2). Routes and landing pages render
 * purely from these objects.
 */
export interface StrategyConfig {
  id: 'btl' | 'flip' | 'brrrr' | 'hmo';
  name: string;
  /** Compact nav label (falls back to name). */
  shortName?: string;
  route: string;
  tagline: string;
  /** One-liner for the landing hero. */
  heroLine: string;
  inputs: {
    /** Shared subject inputs shown for this strategy (S4.1: same for all). */
    visible: string[];
    /** Assumption fields for the collapsed accordion (filled in S4.2–S4.5). */
    assumptions: string[];
  };
  /** Island component name for the strategy verdict; null until S4.2–S4.5. */
  verdictSlot: string | null;
  /** Copy overrides keyed by slot (falls back to shared copy). */
  copy: Record<string, string>;
}
