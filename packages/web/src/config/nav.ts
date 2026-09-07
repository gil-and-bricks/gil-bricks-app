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
import { features } from './features';

export interface NavLink {
  label: string;
  href: string;
}

/** Area Data is listed twice: in the header's top-level row, and on its own in
 * the pre-navV2 header. ONE entry, read by both, so a rename lands everywhere. */
const AREA_DATA: NavLink = { label: 'Area Data', href: '/area-data' };

/** The footer's own links: the contact route both legal pages point at. */
export const FOOTER = {
  contactLead: 'Questions, or a data request?',
  instagram: 'Instagram',
  youtube: 'YouTube',
  terms: 'Terms',
  privacy: 'Privacy',
  /** Sits after the site name, before the maker's wordmark. */
  madeBy: 'is made by',
  /** Licence attributions we must print verbatim — exempt from the two-sentence
   * copy rule for that reason (named in copy.test.ts). */
  dataLicences:
    'Contains OS, Royal Mail and National Statistics data per the ONSPD licence. '
    + 'Deprivation: English Indices of Deprivation 2025 (MHCLG) and Welsh Index of '
    + 'Multiple Deprivation 2025 (Welsh Government), Open Government Licence v3.0. '
    + 'Floor areas from Energy Performance of Buildings data (MHCLG), '
    + 'Open Government Licence v3.0.',
  /** Shown ONLY once a real as-of month is in hand (D3). */
  asOfBefore: 'Sold-price data as of ',
  asOfAfter: '.',
} as const;

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
  /**
   * The right-hand cluster in the header: your own things.
   *
   * ONE route to the pipeline, and no Account link here (A2). The account lives
   * on the far right beside the socials, as the signed-in control that already
   * carries your avatar — putting it in this row as well gave the header two
   * links to /account, one of them called "My deals" beside a "Deals" that went
   * somewhere else entirely.
   */
  mine: [
    { label: 'Deals', href: '/deals' },
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
      { label: 'Credit', href: '/credit' },
      // No Account here. N4 put it in this sheet; the operator removed it on
      // 2026-09-07, because the signed-in control in the top-right corner is on
      // screen at every width — so the sheet was simply a second way to the same
      // page. ONE route to the account, on a phone as much as on a desktop.
      { label: 'Where should I start?', href: '/start' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ] as NavLink[],
  },
} as const;

/**
 * The nav as it should actually be rendered. D1 hid Bridging finance behind
 * `brokerReady()`; the operator reversed that on 2026-09-07, so the route is in
 * the header again and only the enquiry FORM is still gated (see
 * docs/DECISIONS_LOG.md, Sprint A2).
 */
/**
 * A destination is shown only while the feature behind it is on. Both pages
 * render something honest but incomplete with their flag off — /credit
 * redirects, and /bridging-finance stops after "This is not for you if" with no
 * form and no explanation — so the nav must not send anyone there (A2).
 */
const shown = (l: NavLink): boolean =>
  (l.href !== '/credit' || features.creditPage)
  && (l.href !== '/bridging-finance' || features.bridgingFinance);
export const primaryLinks = (): NavLink[] => NAV.primary.filter(shown);
export const moreLinks = (): NavLink[] => NAV.more.links.filter(shown);

/**
 * The desktop header's More (A1). The bottom bar only exists under 640px, so
 * above that the More-sheet pages have no route in from the header at all —
 * /comparables, the second-biggest thing this product does, was reachable on a
 * desktop only from the strategy landing pages, which nothing links to
 * (docs/AUDIT.md §3.3).
 *
 * It reads the SAME list as the phone sheet so the two can never drift, minus
 * what the desktop chrome already shows: the primary row, Deals in the
 * right-hand cluster, and Privacy and Terms in the footer. Deciding what to
 * drop is config, not something a component gets to invent.
 *
 * The account is NOT dropped here, and must not be: it is not in the phone
 * sheet either, so there is nothing to filter. The signed-in control owns that
 * route at every width.
 */
const DESKTOP_MORE_OMITS: readonly string[] = [
  // the header's own links — the primary row and the right-hand cluster
  ...NAV.primary.map((l) => l.href),
  ...NAV.mine.map((l) => l.href),
  // the footer's
  '/privacy',
  '/terms',
];
export const desktopMoreLinks = (): NavLink[] =>
  moreLinks().filter((l) => !DESKTOP_MORE_OMITS.includes(l.href));
