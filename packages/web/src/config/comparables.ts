/**
 * Comparables — every word around the sold sales: the filter sheet and the
 * fields inside it, the summary line above the list, the desktop table, the
 * card layout a phone gets instead (N3, switched by features.compsMobile), and
 * the single-sale page at /transaction. Nothing here computes a figure: the
 * words print what the comparables engine already produced, converting sqm to
 * sqft with core's own sqmToSqft.
 */
export const COMPARABLES = {
  /** The heading over the whole section, on the analyser and on /comparables. */
  heading: 'Sold nearby',
  /** The one button that opens the filters, with a count when any are set. */
  filters: {
    label: 'Filters',
    /** e.g. "Filters · 2 set" — plain English, no jargon. */
    withCount: (n: number): string => `Filters · ${n} set`,
    clear: 'Reset filters',
    /** What a screen reader calls the block of filters. */
    groupLabel: 'Comparable filters',
    /** Each filter: the label on it, then the words in its dropdown. */
    radius: { label: 'Radius', quarterMile: '¼ mile', halfMile: '½ mile', oneMile: '1 mile' },
    period: { label: 'Period', sixMonths: '6 months', twelveMonths: '12 months' },
    propertyType: {
      label: 'Type',
      all: 'All',
      houses: 'Houses',
      detached: 'Detached',
      semi: 'Semi',
      detachedAndSemi: 'Det + semi',
      terraced: 'Terraced',
      flats: 'Flats',
    },
    tenure: { label: 'Tenure', any: 'Any', freehold: 'Freehold', leasehold: 'Leasehold' },
    age: { label: 'Age', all: 'All', newBuild: 'New build', existing: 'Existing' },
    /** The two paired boxes: the word inside an empty box, then what a screen
     * reader says for it. */
    area: {
      label: 'Area sqm',
      minPlaceholder: 'min',
      maxPlaceholder: 'max',
      minLabel: 'Minimum area (sqm)',
      maxLabel: 'Maximum area (sqm)',
    },
    price: {
      label: 'Price £',
      minPlaceholder: 'min',
      maxPlaceholder: 'max',
      minLabel: 'Minimum price (£)',
      maxLabel: 'Maximum price (£)',
    },
  },
  /** The line above the list: how many sales are in, what is typical, how wide
   * the spread is, and the month the sold data runs to. */
  stats: {
    /** The warning that shows while fewer than three sales match. */
    thinEvidenceLabel: 'Thin evidence:',
    thinEvidence: (count: number): string =>
      `only ${count} matching ${count === 1 ? 'sale' : 'sales'} nearby — treat the typical figures below with caution.`,
    /** Reads as "12 of 30 sales included · typical £250,000". */
    ofSalesIncluded: (total: number): string => `of ${total} sales included · typical`,
    typicalPerSqft: '· typical',
    range: (low: string, high: string): string => `· 80% between ${low} and ${high}`,
    asOf: (month: string): string => `· as of ${month}`,
    /** The £/sqft carried by the one-line summary the section folds behind. */
    foldPerSqft: (perSqft: number): string => `£${perSqft}/sq ft`,
  },
  /** The list ⇄ map switch, and the note over a map with sales ticked off. */
  view: {
    groupLabel: 'Comparables view',
    list: 'List',
    map: 'Map',
    dimmed: (count: number): string => `${count} dimmed — excluded from the stats`,
  },
  /** The desktop table. Date, Price, £/sqft and Miles sort the list, and the
   * one doing the sorting shows an arrow — the space before it is deliberate. */
  table: {
    include: 'Include',
    date: 'Date',
    address: 'Address',
    postcode: 'Postcode',
    propertyType: 'Type',
    tenure: 'Tenure',
    age: 'Age',
    price: 'Price',
    sqft: 'Sqft',
    perSqft: '£/sqft',
    miles: 'Miles',
    sortedAsc: ' ↑',
    sortedDesc: ' ↓',
  },
  /** How a sale's type, tenure and age read wherever a sale is shown — the
   * table, a card, the single-sale page. The keys on the left are the Land
   * Registry codes and never change; only the words on the right are ours. */
  propertyTypes: { D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat', O: 'Other' },
  tenures: { F: 'Freehold', L: 'Leasehold' },
  saleAge: { newBuild: 'New', existing: 'Existing' },
  /** The words on the compact card. Every other line of a card is the sale's
   * own data, printed as the engine produced it. */
  card: {
    listLabel: 'Sold comparables',
    /** Distance is printed by the card: "0.21 miles away". */
    distanceValue: (miles: string): string => `${miles} miles away`,
    /** Floor area and price per square foot, as the card prints them. */
    sqftValue: (sqft: number): string => `${sqft} sqft`,
    perSqftValue: (perSqft: number): string => `£${perSqft}/sqft`,
    /** Shown wherever a figure is missing — a sale with no floor area, a sale
     * with no tenure recorded, no typical price yet. */
    unknown: '—',
    include: (address: string): string => `Include ${address}`,
    excluded: 'Left out of the stats',
  },
  /** The single-sale page at /transaction: the line under the price, then the
   * three links out to where the sale can be checked. */
  transaction: {
    sold: 'Sold',
    newBuild: 'new build',
    existing: 'existing',
    nonStandardSale: '· non-standard sale',
    landRegistryLink: 'View at Land Registry',
    zooplaLink: 'View sold history on Zoopla',
    rightmoveLink: 'Search on Rightmove',
  },
} as const;
