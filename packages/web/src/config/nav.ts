/**
 * Site navigation (N4) — every label, every grouping, every destination. The
 * header, the bottom bar and the More sheet all read from here, so renaming or
 * reordering anything is a config edit, never a code change. Switched by
 * features.navV2.
 *
 * The four strategies are NOT listed here: they come from the strategy configs
 * in @gil-bricks/core (one source), and on the analyser pages they stay visible
 * as the segmented switcher, so grouping them in the header buries nothing.
 */
export interface NavLink {
  label: string;
  href: string;
}

export const NAV = {
  /** Accessible name of the main navigation, in the header and the bottom bar. */
  mainLabel: 'Main',
  /** The header's "Analyse" grouping — the four strategies live inside it. */
  analyse: {
    label: 'Analyse',
    /** Where the bottom bar's Analyse tab lands: the default strategy, with the
     * other three one tap away on the segmented switcher. Point it anywhere. */
    href: '/buy-to-let/analyser',
    /** Said to screen readers on the header's disclosure. */
    hint: 'Choose a strategy to analyse',
  },
  /** Top-level destinations, in header order, after the Analyse grouping. */
  primary: [
    { label: 'Area Data', href: '/area-data' },
    { label: 'Tools', href: '/tools' },
    { label: 'Finance', href: '/finance' },
  ] as NavLink[],
  /** The right-hand cluster: your own things. */
  mine: [
    { label: 'Deals', href: '/deals' },
    { label: 'Account', href: '/account' },
  ] as NavLink[],
  /** The five the bottom bar can hold. The first is the Analyse destination
   * above (ONE value, not two), and the last one opens the More sheet. */
  bottom: [
    { label: 'Area', href: '/area-data' },
    { label: 'Tools', href: '/tools' },
    { label: 'Deals', href: '/deals' },
  ] as NavLink[],
  /** Everything that does not fit five, one tap away behind More. */
  more: {
    label: 'More',
    /** Announced on the button so it is clearly a menu, not a destination. */
    hint: 'More places to go',
    links: [
      { label: 'Finance', href: '/finance' },
      { label: 'Account', href: '/account' },
      { label: 'Where should I start?', href: '/start' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ] as NavLink[],
  },
} as const;

/**
 * The two destinations the nav promises before they exist. Honest by
 * construction: the page says what is coming and what to use meanwhile, and
 * the nav never points at a blank screen.
 */
export const COMING_SOON = {
  tools: {
    title: 'Tools',
    tagline: 'Small calculators that answer one question each.',
    body: [
      'This is where the standalone calculators will live — stamp duty on its own, a rent-to-price check, a refurb budget sanity check — each one answering a single question without filling in a whole deal.',
      'Nothing here is built yet. The full analyser already does all of this maths inside a deal, so use that in the meantime.',
    ],
    cta: { label: 'Open the analyser', href: '/buy-to-let/analyser' },
  },
  finance: {
    title: 'Finance',
    tagline: 'How the money side gets funded — bridging, refurb and exit.',
    body: [
      'This is where bridging and development finance guidance will live: what the costs actually are, how lenders read a deal, and how to sanity-check a quote before you commit.',
      'Nothing here is built yet, and we will never name or recommend a lender. The BRRRR and Flip analysers already model bridging costs inside a deal, so use those in the meantime.',
    ],
    cta: { label: 'Model a bridging deal', href: '/brrrr/analyser' },
  },
} as const;
