/**
 * Every maths function returns its number AND a human-readable account of
 * how it was calculated (CLAUDE.md golden rule 1: show-the-maths).
 */
export interface Breakdown {
  /** Short human name, e.g. "Gross yield". */
  label: string;
  /** The formula in plain English, e.g. "annual rent ÷ price × 100". */
  formula: string;
  /** The user's numbers written into the formula, e.g. "£8,400 ÷ £100,000 × 100". */
  substituted: string;
  /** The formatted result, e.g. "8.4%". */
  result: string;
  /** One-line definition note, e.g. "cash in includes stamp duty". */
  note: string;
}

export interface WithBreakdown<T = number> {
  value: T;
  breakdown: Breakdown;
}

/** Guard: throws a clear error unless every named input is a finite number. */
export function assertFinite(inputs: Record<string, number>): void {
  for (const [name, v] of Object.entries(inputs)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError(`${name} must be a finite number (got ${String(v)})`);
    }
  }
}

/** Guard: throws unless every named input is >= 0. */
export function assertNonNegative(inputs: Record<string, number>): void {
  assertFinite(inputs);
  for (const [name, v] of Object.entries(inputs)) {
    if (v < 0) {
      throw new RangeError(`${name} cannot be negative (got ${String(v)})`);
    }
  }
}

/** Guard: throws unless every named input is > 0. */
export function assertPositive(inputs: Record<string, number>): void {
  assertFinite(inputs);
  for (const [name, v] of Object.entries(inputs)) {
    if (v <= 0) {
      throw new RangeError(`${name} must be greater than zero (got ${String(v)})`);
    }
  }
}
