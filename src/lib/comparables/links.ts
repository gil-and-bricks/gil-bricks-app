/**
 * Portal links — COMPLIANCE RULE (docs/exclusions.md: no scraping, no live
 * prices): we link to official/entry pages ONLY. The Land Registry publishes
 * a per-transaction page as open data; for the portals we link their
 * house-prices LANDING pages and never construct internal property URLs.
 */
export interface CompLinks {
  landRegistry: string;
  zooplaHousePrices: string;
  rightmoveHousePrices: string;
}

export function compLinks(saleId: string): CompLinks {
  const guid = saleId.replace(/[{}]/g, '');
  return {
    landRegistry: `https://landregistry.data.gov.uk/data/ppi/transaction/${guid}/current`,
    zooplaHousePrices: 'https://www.zoopla.co.uk/house-prices/',
    rightmoveHousePrices: 'https://www.rightmove.co.uk/house-prices.html',
  };
}
