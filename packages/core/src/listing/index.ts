/**
 * Listing extractors + remote config (E5). Shared by the extension (and any
 * future product): read the page the user opened into a normalised listing,
 * driven by versioned, config-targeted extractors that fail honestly.
 */
export * from './types';
export * from './config';
export * from './postcode';
export * from './extract';
export * from './enrich';
export * from './handoff';
export * from './scoreListing';
export { RIGHTMOVE_EXTRACTOR_VERSION, extractRightmove } from './rightmove';
export { ZOOPLA_EXTRACTOR_VERSION, extractZoopla } from './zoopla';
// low-level helpers (useful for tests + advanced callers)
export { getRightmovePageModel, decodeZooplaFlight, getLdJson, getMeta } from './dom';
