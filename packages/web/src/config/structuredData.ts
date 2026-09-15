/**
 * S1 — STRUCTURED DATA, GENERATED FROM CONFIG SO IT CANNOT DRIFT.
 *
 * WHAT THIS IS FOR. Search engines and AI assistants read JSON-LD to work out
 * what a page IS rather than guessing from prose. Without it this product is a
 * page of words that happens to mention property; with it, it is a named piece
 * of free software, from a named organisation, and — on the data pages — a
 * dataset, which makes those pages eligible for Google Dataset Search, a far
 * less contested surface than ordinary results.
 *
 * THE THREE HONESTY RULES, and they are the same ones the rest of the product
 * lives by:
 *
 *   1. It describes what a person actually SEES on that page. Nothing is
 *      claimed for a page that does not carry it.
 *   2. It never claims a rating, a review, a price or a feature that does not
 *      exist. There is no `aggregateRating` anywhere in this file and there
 *      must never be one until real reviews exist — a fabricated rating is the
 *      single most common way sites get manual actions, and it would be a lie.
 *   3. It is never RICHER than the page. If a claim here is not visible on the
 *      page, it does not belong here.
 *
 * WHAT IS DELIBERATELY ABSENT. `FAQPage` is not emitted anywhere, because there
 * is no genuine question-and-answer content on this site. Inventing one would
 * break all three rules at once. If a real FAQ is ever written, this is where it
 * would be wired in.
 *
 * ON `offers` WITH A PRICE OF ZERO. That is not a claim about a price that does
 * not exist — free forever is a HARD constraint of this product (CLAUDE.md,
 * golden rule 5) and the pages say so in plain words. Stating it in a form a
 * machine can read is the honest thing, not the promotional thing.
 */
import { siteConfig } from '../site.config';

/** A JSON-LD node. Loose by necessity: schema.org is not a closed shape. */
export type JsonLd = Record<string, unknown>;

const abs = (path: string): string => `${siteConfig.liveUrl.replace(/\/+$/, '')}${path}`;

/**
 * THE ORGANISATION, for entity clarity — so the name, the site and the social
 * profiles are understood as one thing rather than three unrelated mentions.
 */
export function organisation(): JsonLd {
  return {
    '@type': 'Organization',
    '@id': abs('/#organisation'),
    name: siteConfig.siteName,
    url: abs('/'),
    logo: abs('/apple-touch-icon.png'),
    // Only profiles that genuinely exist and are ours.
    sameAs: [siteConfig.socials.instagram, siteConfig.socials.youtube].filter((u) => u !== ''),
  };
}

/**
 * THE PRODUCT. Used on the homepage and on each analyser, which IS the
 * application — not a page describing one.
 *
 * `featureList` is deliberately short and each entry is something a person can
 * see and use on the page it is emitted on. It is not a marketing list.
 */
export function softwareApplication(opts: {
  name: string; description: string; url: string; features: readonly string[];
}): JsonLd {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${opts.url}#software`,
    name: opts.name,
    description: opts.description,
    url: opts.url,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any modern web browser',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    inLanguage: 'en-GB',
    // Free forever is a hard constraint of this product, and the pages say so.
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
    featureList: [...opts.features],
    publisher: { '@id': abs('/#organisation') },
    // NO aggregateRating, NO review. There are none. See the header.
  };
}

/**
 * A DATASET, on the pages that genuinely publish data rather than compute with
 * it. The licence and the attribution are the real ones, and
 * `temporalCoverage`/`dateModified` carry the refresh date a person can also see
 * on the page — which is the honest freshness signal, not a trick.
 */
export function dataset(opts: {
  name: string; description: string; url: string; asOf: string; spatial: string;
}): JsonLd {
  return {
    '@type': 'Dataset',
    '@id': `${opts.url}#dataset`,
    name: opts.name,
    description: opts.description,
    url: opts.url,
    license: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    creator: { '@id': abs('/#organisation') },
    isAccessibleForFree: true,
    inLanguage: 'en-GB',
    spatialCoverage: opts.spatial,
    ...(opts.asOf === '' ? {} : { dateModified: opts.asOf, temporalCoverage: opts.asOf }),
  };
}

/** One graph per page, so a crawler reads one block rather than several. */
export function graph(nodes: readonly JsonLd[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
}

/**
 * The words used in the structured data. Here, not in the templates, because
 * every describing string in this product lives in config — and because these
 * must be checkable against the page they describe.
 */
export const SD_COPY = {
  homeName: siteConfig.siteName,
  homeDescription: 'Free property deal analyser for England and Wales. Work out the numbers on a '
    + 'buy-to-let, BRRRR, flip or HMO using official open data.',
  homeFeatures: [
    'Buy-to-let, BRRRR, flip and HMO analysers',
    'Sold price comparables from HM Land Registry',
    'Stamp duty and Land Transaction Tax',
    'Area data by postcode sector',
  ],
  analyserName: (strategy: string): string => `${strategy} analyser`,
  analyserDescription: (strategy: string): string => `Work out the numbers on a ${strategy.toLowerCase()} `
    + 'deal in England or Wales: the cash going in, the return, and the sold evidence behind the valuation.',
  analyserFeatures: [
    'Cash needed, including stamp duty',
    'Return on cash and rental yield',
    'Sold comparables from HM Land Registry',
  ],
  areaName: 'UK postcode sector area data',
  areaDescription: 'Sold prices, typical values and ten-year price trajectory by postcode sector for '
    + 'England and Wales, from HM Land Registry and ONS open data.',
  compsName: 'Sold price comparables, England and Wales',
  compsDescription: 'Recent sold prices near a postcode, from HM Land Registry Price Paid data, '
    + 'with price per square metre where floor area is known.',
  spatial: 'England and Wales',
} as const;
