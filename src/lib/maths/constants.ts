/**
 * Tax rates used by tax.ts. TEMPORARY home: S3.2 moves these into the
 * effective-dated rates.json (CLAUDE.md: config-driven, editable, no code
 * change). Values are 2026/27 UK rates.
 */
export const INCOME_TAX_RATES = {
  basic: 0.2,
  higher: 0.4,
  additional: 0.45,
} as const;

/** Section 24: individuals get a flat 20% tax credit on finance costs. */
export const FINANCE_COST_CREDIT_RATE = 0.2;

/** UK corporation tax with marginal relief between the limits. */
export const CORPORATION_TAX = {
  smallRate: 0.19,
  mainRate: 0.25,
  lowerLimit: 50_000,
  upperLimit: 250_000,
  /** Marginal relief fraction: (upper − profits) × 3/200. */
  marginalReliefFraction: 3 / 200,
} as const;
