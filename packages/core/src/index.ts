/**
 * @gil-bricks/core — the single shared calculation library for every Gil &
 * Bricks product (the web app today, a Chrome extension next). It owns the
 * maths (every figure still returns the {value, breakdown} show-the-maths
 * shape), the comparables + valuation engines, the sold-data client, the
 * Land Registry lookup, and the strategy configs + strategy calculators.
 *
 * This is the ONLY entry point consumers should import from.
 */

// Maths (format, breakdown, stats, yields, investment, lending, stampduty,
// tax, rates, cashflow, area, flip, valuation) — via its own barrel.
export * from './maths';

// Comparables engine, geocoding, links, errors — via its own barrel.
export * from './comparables';

// Valuation engine.
export * from './valuation';

// Land Registry sale-history + transaction lookup.
export * from './landregistry';

// Sold-data client + schema-v1 types.
export * from './data/client';
export * from './data/types';

// Strategy calculators (analyseBtl/Brrrr/Flip/Hmo → {value, breakdown}).
export type { VerdictColour } from './strategy-calc/verdict';
export * from './strategy-calc/btl';
export * from './strategy-calc/brrrr';
export * from './strategy-calc/flip';
export * from './strategy-calc/hmo';
export * from './strategy-calc/rental';

// Strategy configuration objects + their types.
export * from './strategies';

// Shared config (the R2 data base URL).
export { coreConfig } from './config';

// Deal Score verdict engine (E2).
export * from './score/scoreDeal';
export { scoreCopy } from './score/copy';
export type { Verdict } from './score/copy';

// Listing extractors + remote config (E5) — portal page -> normalised listing.
export * from './listing';
