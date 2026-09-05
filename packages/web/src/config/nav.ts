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
import { brokerReady } from './bridging';

export interface NavLink {
  label: string;
  href: string;
}

/** Area Data is listed twice: in the header's top-level row, and on its own in
 * the pre-navV2 header. ONE entry, read by both, so a rename lands everywhere. */
const AREA_DATA: NavLink = { label: 'Area Data', href: '/area-data' };

export const NAV = {
  /** Accessible name of the main navigation, in the header and the bottom bar. */
  mainLabel: 'Main',
  /** The wordmark in the top-left: what a screen reader hears, and the quiet
   * maker credit under it. The NAMES come from site.config.ts (golden rule 4);
   * only the joining words are here. */
  brand: {
    label: (siteName: string, makerName: string): string => `${siteName} by ${makerName} — home`,
    by: 'by',
  },
  /** The two social icons in the header. The LINKS live in site.config.ts;
   * these are the words a screen reader and a hover tooltip get. */
  socials: {
    instagram: {
      title: 'Instagram',
      label: (makerName: string): string => `${makerName} on Instagram (opens a new tab)`,
    },
    youtube: {
      title: 'YouTube',
      label: (makerName: string): string => `${makerName} on YouTube (opens a new tab)`,
    },
  },
  /** The one destination the pre-navV2 header lists beside the four strategies. */
  areaData: AREA_DATA,
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
    AREA_DATA,
    { label: 'Tools', href: '/tools' },
    { label: 'Bridging finance', href: '/bridging-finance' },
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
      { label: 'Bridging finance', href: '/bridging-finance' },
      { label: 'Sold comparables', href: '/comparables' },
      { label: 'Account', href: '/account' },
      { label: 'Where should I start?', href: '/start' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ] as NavLink[],
  },
} as const;

/**
 * The nav as it should actually be rendered (D1). Bridging finance is a top-level
 * destination only while the broker's details are set: until then the page says
 * "enquiries are not open yet", and sending people to that from the main nav is
 * a dead end. The page itself stays reachable by URL.
 */
const bridgingReady = (l: NavLink): boolean => l.href !== '/bridging-finance' || brokerReady();
export const primaryLinks = (): NavLink[] => NAV.primary.filter(bridgingReady);
export const moreLinks = (): NavLink[] => NAV.more.links.filter(bridgingReady);
