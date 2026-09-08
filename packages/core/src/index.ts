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
export * from './valuation/typeMismatch';

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

// Shared config (R2 data base URL, socials, per-strategy YouTube links).
export { coreConfig, youtubeFor } from './config';

// EPC register lookup: the shared answer shape and the address matching (E1).
export * from './epc/types';
export * from './epc/match';

// Deal Score verdict engine (E2).
export * from './score/scoreDeal';
export * from './score/soldEvidence';
export { maxOfferForVerdict, type MaxOfferOptions } from './score/maxOffer';

// Evidence chips (P7) — what a score rests on, shared by all three surfaces.
export * from './evidence/chips';
export { scoreCopy } from './score/copy';
export type { Verdict } from './score/copy';

// Listing extractors + remote config (E5) — portal page -> normalised listing.
export * from './listing';

// Tools (T1): pure leaf maths a standalone tool page may import.
// The area page's own comparison — how a sector sits against the mile around
// it. Composed from the comps engine, so it lives beside the tools (A1).
export * from './area/surroundings';

export * from './tools/equity';
export * from './tools/rentalYield';
