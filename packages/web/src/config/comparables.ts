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
    period: {
      label: 'Period', sixMonths: '6 months', twelveMonths: '12 months', twentyFourMonths: '24 months',
    },
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
    /**
     * C1 — THE 'AUTOMATIC' OPTION ON THE THREE THAT MATTER, AND WHY IT IS A
     * LABEL RATHER THAN A NUMBER.
     *
     * Each of these reports what is ACTUALLY IN FORCE, read off the result the
     * engine returned — not off whatever was passed in. That is the difference
     * between a control that agrees with the list below it and one that usually
     * does: when a thin set widens to 24 months, a select reading its own input
     * would say "12 months" over 24-month sales, and be believed.
     */
    auto: {
      radius: (miles: string): string => `Automatic · ${miles}`,
      period: (months: number): string => `Automatic · ${months} months`,
      /** The subject's own type. */
      type: 'Same as this property',
      /** Said instead when no type is set — never a guessed one. */
      typeUnknown: 'All · no type set',
    },
    /** What changing each one does. Tooltips: the short home, 20 words. */
    why: {
      radius: 'Wider finds more sales but reaches a different street. Narrower keeps the local market and may find too few.',
      period: 'Longer reaches back for more sales, into a market that has since moved. Shorter is fresher and thinner.',
      type: 'A flat compared against detached houses values it far too high. Type is the one thing we can match.',
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
  /**
   * C1 — WHAT THIS LIST IS, WHAT IT CANNOT BE, AND WHAT TO TAKE OUT.
   *
   * ── SAYING WHAT WE CAN ACTUALLY MATCH ───────────────────────────────────
   * Type, distance and date are the three things Land Registry publishes for
   * every sale, so they are the three we filter on. Bedrooms, condition, which
   * side of the main road, whether the garden backs onto a railway — none of
   * that is in free sold data. The copy says so plainly rather than letting a
   * filtered list imply it has been vetted, because a list that LOOKS vetted is
   * exactly how somebody ends up trusting a number nobody checked.
   *
   * ── THE PRUNING, WITHOUT A LESSON ───────────────────────────────────────
   * Three lines, no jargon, and never the vocabulary of a course: no BMV, no
   * off-market, no stacking, no motivated seller. Somebody who repeats our
   * wording to an agent should sound like a buyer, not a graduate.
   */
  rules: {
    /** Said beside the filters, before the list. */
    whatWeMatch: 'We match type, distance and date. Size, condition and the street itself are not in sold data.',
    /**
     * …so the last part is theirs. Four words, because it sits in the SAME
     * paragraph as the line above: the copy gate measures what a person reads
     * as one block, and the two together ran to 33 words. The unit test could
     * not see that — it measures each string on its own — which is exactly why
     * the gate reads the rendered page.
     */
    yourRead: 'That part is your read.',
    prune: {
      heading: 'What to take out',
      /** One line each, plain, no jargon — never a lesson. */
      items: [
        'Anything much bigger or smaller than this one.',
        'Anything on a road that feels different to this one.',
        'Anything far above or below the rest for no reason you can see.',
      ] as readonly string[],
    },
  },
  /**
   * C1 — THE ONE WIDENING STEP, SAID OUT LOUD.
   *
   * Nothing widens silently. Time first, then distance: widening the radius
   * changes WHERE, and location is the one thing no adjustment can correct for
   * afterwards, whereas older sales in the same streets can at least be read
   * with the market in mind. Every figure is a formatter's argument, so the
   * words and the numbers can never describe different searches.
   */
  widened: {
    time: (min: number, from: number, to: number): string =>
      `Fewer than ${min} sales matched in ${from} months, so this list reaches back ${to}.`,
    area: (min: number, from: string, to: string): string =>
      `Still fewer than ${min}, so this list reaches ${to} rather than ${from}.`,
    /** Why the time window moves before the radius does. */
    whyTimeFirst: 'Older sales on these streets beat recent sales on different ones. Location is what no adjustment fixes.',
    /** Widened as far as is honest and still short. */
    exhausted: (count: number, min: number): string =>
      `Only ${count} sales match, after looking as far as is honest. ${min} is the fewest we will value from.`,
    /** Short of the bar on filters the person set themselves. */
    yourFilters: (count: number, min: number): string =>
      `Only ${count} sales match these filters. ${min} is the fewest we will value from.`,
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
    /**
     * THE TWO KINDS OF LOOKUP, NAMED (E11). Google and the Land Registry record
     * find THAT HOUSE; Rightmove and Zoopla can only reach the postcode's sold
     * prices, because there is no public non-scraping way to a listing. Four
     * identical-looking buttons in a row hid that difference completely: the
     * operator pressed a postcode one and reasonably concluded the door number
     * was missing from our data. These head the two columns, so the difference
     * is stated ONCE for the whole table instead of on every button.
     */
    thisProperty: 'This property',
    thisPostcode: 'This postcode',
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
