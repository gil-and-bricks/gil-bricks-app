/**
 * Where a comparable can take you (C1).
 *
 * COMPLIANCE RULE (docs/exclusions.md: no scraping, no live prices): we build
 * links to PUBLIC pages from the address we already hold, and we never fetch,
 * store or republish anything from a portal.
 *
 * WHY THERE IS NO LINK TO THE EXACT LISTING. There is no public, non-scraping
 * way to turn an address into a portal's property URL. Rightmove publishes no
 * public API; Zoopla's closed to new registrations in 2021 and never offered
 * address-to-listing resolution anyway; neither exposes a documented lookup.
 * The only way to find the listing URL is to crawl their search pages, which is
 * exactly what we do not do. So the portal links promise the POSTCODE's sold
 * prices — which is what they deliver — and the Google link does the job of
 * finding the actual listing far better than a guessed URL could.
 */
export interface CompLinks {
  /** The Land Registry's own open-data record for this transaction. */
  landRegistry: string;
  /** Google, pre-filled with the full address. Finds the listing, the agent and
   *  the photographs without us guessing anybody's URL. */
  google: string;
  /** Rightmove's SOLD PRICES for the postcode. Verified shape. Null with no
   *  postcode — a link to "/house-prices/.html" is worse than no link. */
  rightmoveSoldPrices: string | null;
  /** Zoopla's SOLD PRICES for the postcode. Null with no postcode. */
  zooplaSoldPrices: string | null;
}

/** The postcode as the portals slug it: lower case, single hyphen, no spaces. */
export function postcodeSlug(postcode: string): string {
  return (postcode ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

/** The address as a person would say it — the Google query, and the row's label. */
export function fullAddress(parts: {
  saon?: string | null;
  paon?: string | null;
  street?: string | null;
  postcode?: string | null;
}): string {
  return [parts.saon, parts.paon, parts.street, parts.postcode]
    .map((p) => (p ?? '').trim())
    .filter((p) => p !== '')
    .join(' ');
}

/** ONE place that builds a Google search URL, so the row, the map popup and the
 *  subject property can never encode an address three different ways. */
export function googleSearchUrl(address: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(address)}`;
}

/**
 * Is there enough here to search for a PROPERTY, rather than for a street?
 *
 * HM Land Registry populates PAON on every record we have (checked across 804
 * sales in twelve sectors: none missing), and SAON on 55% of them — a flat or
 * unit. But a record with neither is a street name and a postcode, and
 * searching that as though it were somebody's house is a lie the button would
 * tell silently. Callers use this to withhold the search instead.
 */
export function identifiesAProperty(parts: { saon?: string | null; paon?: string | null }): boolean {
  return (parts.paon ?? '').trim() !== '' || (parts.saon ?? '').trim() !== '';
}

export function compLinks(
  saleId: string,
  address: { saon?: string | null; paon?: string | null; street?: string | null; postcode?: string | null } = {},
): CompLinks {
  const guid = saleId.replace(/[{}]/g, '');
  const slug = postcodeSlug(address.postcode ?? '');
  return {
    landRegistry: `https://landregistry.data.gov.uk/data/ppi/transaction/${guid}/current`,
    google: googleSearchUrl(fullAddress(address)),
    // Both verified in a real browser against SA1 6SN: Rightmove answers
    // "House Prices in SA1 6SN", Zoopla "Sold house prices in SA1 6SN".
    rightmoveSoldPrices: slug === '' ? null : `https://www.rightmove.co.uk/house-prices/${slug}.html`,
    zooplaSoldPrices: slug === '' ? null : `https://www.zoopla.co.uk/house-prices/${slug}/`,
  };
}
