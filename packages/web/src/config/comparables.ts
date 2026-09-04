/**
 * Comparables on a phone (N3) — every word of the card layout and the filter
 * sheet. Switched by features.compsMobile. Nothing here computes a figure: the
 * card prints what the comparables engine already produced, converting sqm to
 * sqft with core's own sqmToSqft.
 */
export const COMPARABLES = {
  /** The one button that opens the filters, with a count when any are set. */
  filters: {
    label: 'Filters',
    /** e.g. "Filters · 2 set" — plain English, no jargon. */
    withCount: (n: number): string => `Filters · ${n} set`,
    clear: 'Reset filters',
  },
  /** The words on the compact card. Every other line of a card is the sale's
   * own data, printed as the engine produced it. */
  card: {
    listLabel: 'Sold comparables',
    /** Distance is printed by the card: "0.21 miles away". */
    distanceValue: (miles: string): string => `${miles} miles away`,
    /** Floor area and price per square foot, as the card prints them. */
    sqftValue: (sqft: number): string => `${sqft} sqft`,
    perSqftValue: (perSqft: number): string => `£${perSqft}/sqft`,
    /** Shown where a sale has no floor area recorded. */
    unknown: '—',
    include: (address: string): string => `Include ${address}`,
    excluded: 'Left out of the stats',
  },
} as const;
