/**
 * Comparables — every word around the sold sales: the filter sheet and the
 * fields inside it, the summary line above the list, the desktop table, the
 * card layout a phone gets instead (N3, switched by features.compsMobile), and
 * the links each row goes out to. Nothing here computes a figure: the words
 * print what the comparables engine already produced, in the METRIC units it
 * produced them in (C1 — the product asks for area in m² everywhere else).
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
    typicalPerSqm: '· typical',
    range: (low: string, high: string): string => `· 80% between ${low} and ${high}`,
    asOf: (month: string): string => `· as of ${month}`,
    /** The £/m² carried by the line on the comparables disclosure. */
    foldPerSqm: (perSqm: number): string => `£${perSqm.toLocaleString('en-GB')}/m²`,
  },
  /**
   * WHAT THE EVIDENCE LEAVES OUT (C3). HM Land Registry marks some sales
   * "category B" and the pipeline never ships them, so they are not in the
   * comparables, the typical price or the valuation. This says so, rather than
   * letting the filter be silent.
   *
   * NO NUMBER, DELIBERATELY. A per-sector count was built and then removed: the
   * comparables list is clipped by radius, period and the filters, so a
   * whole-sector figure describes a different population from the rows beside
   * it — at a 0.25-mile radius it read "45 nearby" against 22 comparables when
   * the true local figure was 15. A truthful count needs the excluded sales'
   * coordinates, which is exactly what we decline to ship. So the sentence
   * states the POLICY, which is true at every radius.
   */
  nonStandard: {
    line: 'Sales Land Registry marks non-standard are left out.',
    /** The 'i' tooltip: why, in the fewest honest words. */
    why: 'Repossessions, company purchases and some buy-to-lets. Land Registry does not say which.',
  },

  /** The list ⇄ map switch, and the note over a map with sales ticked off. */
  view: {
    groupLabel: 'Comparables view',
    list: 'List',
    map: 'Map',
    dimmed: (count: number): string => `${count} dimmed — excluded from the stats`,
  },
  /** The desktop table. Date, Price, £/m² and Miles sort the list, and the
   * one doing the sorting shows an arrow — the space before it is deliberate.
   *
   * NO AGE COLUMN (C1). Every row said "Existing", so it told nobody anything
   * and it cost the width the row actions now use. New builds are still marked
   * where it matters: the age FILTER is untouched. */
  table: {
    include: 'Include',
    date: 'Date',
    address: 'Address',
    postcode: 'Postcode',
    propertyType: 'Type',
    tenure: 'Tenure',
    price: 'Price',
    sqm: 'm²',
    perSqm: '£/m²',
    miles: 'Miles',
    /** The row's actions, and the column that holds them. */
    actions: 'Links',
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
    /** Floor area and price per square metre, as the card prints them. The
     *  product asks for area in m² and the EPC returns m²; comparables used to
     *  switch to square feet here, which was our own inconsistency (C1). */
    sqmValue: (sqm: number): string => `${sqm} m²`,
    /** Thousands separated: in square feet this was three digits, in square
     *  metres it is four, and "£1770/m²" is harder to read at a glance. */
    perSqmValue: (perSqm: number): string => `£${perSqm.toLocaleString('en-GB')}/m²`,
    /** Shown wherever a figure is missing — a sale with no floor area, a sale
     * with no tenure recorded, no typical price yet. */
    unknown: '—',
    include: (address: string): string => `Include ${address}`,
    excluded: 'Left out of the stats',
  },
  /**
   * WHAT A COMPARABLE ROW LINKS OUT TO (C1). The per-sale page that used to
   * hold these was three buttons and a repeat of the row, and two of the three
   * went to the portals' generic front pages. The actions moved here, and each
   * label now promises exactly what its link delivers and nothing more.
   */
  actions: {
    /** The transaction's own open-data record. Unchanged: it already worked. */
    landRegistry: 'Land Registry',
    landRegistryFull: (address: string): string => `Land Registry record for ${address}`,
    /** The most useful of the three: the full address, searched. */
    google: 'Google',
    googleFull: (address: string): string => `Search Google for ${address}`,
    /** POSTCODE sold prices. There is no public way to reach the exact listing
     *  without scraping, so the label promises the postcode and not the house. */
    rightmove: 'Rightmove',
    rightmoveFull: (postcode: string): string => `Sold prices for ${postcode} on Rightmove`,
    zoopla: 'Zoopla',
    zooplaFull: (postcode: string): string => `Sold prices for ${postcode} on Zoopla`,
    /** Said once above the row's links, so the promise is made in words too. */
    portalNote: 'Rightmove and Zoopla open the sold prices for the postcode.',
  },
} as const;

/**
 * D4 — when the valuation's own evidence is about a different kind of home.
 * `caution`: say it beside the number. `demote`: the caveat leads and the
 * estimate is shown smaller, below it. Ratios are estimate ÷ what this TYPE
 * typically sells for in this sector.
 */
export const VALUATION_TYPE_CHECK = {
  cautionRatio: 1.4,
  demoteRatio: 2,
  /** Share of a sector's sales one kind must hold before we say "mostly". */
  dominantShare: 0.7,
} as const;

/** How each KIND reads in "This sector is mostly ___." Buckets, not single
 *  types: naming the largest house type would label a minority (D4 review). */
export const PROPERTY_KINDS_PLURAL: Record<'houses' | 'flats', string> = {
  houses: 'houses', flats: 'flats',
};
