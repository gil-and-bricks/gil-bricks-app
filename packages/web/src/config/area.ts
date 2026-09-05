/**
 * Area Data copy (N1) — every word the /area-data dashboard prints, in the
 * order a person meets it: the search, the header, sold prices, the map, the
 * price trend, market activity, deprivation, crime, flood, the official links,
 * and the strip at the foot. EDIT ANY WORD HERE; the component holds none.
 *
 * Two neighbours own the rest of this page: the one-line honest limit of each
 * panel lives in COPY.area (src/config/copy.ts), and the 'i' tooltips live in
 * src/content/microcopy.ts. Nothing here computes a figure — a function takes
 * numbers the page has already worked out and puts words around them.
 */

/** One sale or many. Used by the thin-market line and the sold-price count. */
const salesWord = (n: number): string => (n === 1 ? 'sale' : 'sales');
/** One nearby sector or many, in the surrounding-mile comparison. */
const sectorsWord = (n: number): string => (n === 1 ? 'sector' : 'sectors');
/** One live flood alert or many. */
const alertsWord = (n: number): string => (n === 1 ? 'alert' : 'alerts');

export const AREA_COPY = {
  /** The two countries we cover, as the badge and the headings name them. */
  countries: {
    england: 'England',
    wales: 'Wales',
  },

  /** The postcode search at the top of the page. */
  search: {
    label: 'Postcode',
    placeholder: 'e.g. CF37 1DL',
    submit: 'See area data',
  },

  /** Said to screen readers only, as the dashboard loads. */
  status: {
    loading: 'Loading area data…',
    loaded: 'Area data loaded.',
  },

  /** The whole page failed. Each card has its own line for its own failure. */
  errors: {
    loadFailed: 'Something went wrong loading the data — please try again in a moment.',
  },

  /** The cue on every link out to an official service. */
  externalLink: {
    /** Seen beside the link text; hidden from screen readers. */
    icon: ' ↗',
    /** Heard instead of the icon. */
    newTab: ' (opens in a new tab)',
  },

  /** The line under the sector name: country badge, as-of month, postcode. */
  header: {
    soldDataTo: 'Sold data to',
    postcode: '· postcode',
  },

  /** Shown when the sector recorded no sales at all in the last 12 months. */
  noSales: {
    heading: 'No recorded sales here in the last 12 months',
  },

  /** The caution banner when the sector has fewer than three sales. */
  thinMarket: {
    label: 'Thin market:',
    /** Follows the bold label; `sales` is the count in the last 12 months. */
    body: (sales: number): string =>
      `only ${sales} recorded ${salesWord(sales)} in the last 12 months — treat every number here with caution.`,
  },

  /** The sold-price card: the big figure and the line beneath it. */
  soldPrices: {
    heading: 'Sold prices in',
    /** The line under the big figure; `sales` is how many it averaged. */
    count: (sales: number): string => `typical sold price from ${sales} ${salesWord(sales)}`,
    /** The middle 80% of sales; both figures arrive already formatted. */
    spread: (low: string, high: string): string => `· 80% sold between ${low} and ${high}`,
    perSqftLead: '· typical',
    perSqft: (perSqft: number): string => `£${perSqft}/sqft`,
  },

  /** The four-column table of typical prices inside the sold-price card. */
  propertyTypes: {
    caption: 'Typical price by property type',
    detached: 'Detached',
    semi: 'Semi',
    terraced: 'Terraced',
    flat: 'Flat',
    /** Printed in a cell with too few sales to name a figure. */
    notEnough: 'not enough sales',
  },

  /** How this sector compares with everything sold within a mile of it. */
  surroundings: {
    /** The comparison failed; every card above it still stands. */
    failed: "The 1-mile comparison isn't available right now — everything above still is.",
    /** Too few sales around it for the comparison to be fair. */
    notEnough: 'Not enough sales in the surrounding mile for a fair comparison.',
    /** The lead phrase: dead level, or a percentage either way. */
    inLine: 'In line with',
    difference: (percent: number, higher: boolean): string => `${percent}% ${higher ? 'above' : 'below'}`,
    /** What that lead phrase is measured against; `typical` arrives formatted. */
    body: (typical: string, sales: number, sectors: number): string =>
      `the surrounding mile (typical ${typical} from ${sales} sales in ${sectors} nearby ${sectorsWord(sectors)}, this sector excluded).`,
  },

  /** The show-the-maths accordion under the sold-price card. */
  typicalMaths: {
    label: 'How is the typical price worked out?',
    /** `setAside` is dropped from each end; `middle` is what gets averaged. */
    body: (sales: number, setAside: number, middle: number): string =>
      `We list every sale in the sector from the last 12 months in price order, set aside the cheapest quarter and the dearest quarter, and average the rest. With ${sales} sales that means setting aside ${setAside} from each end and averaging the middle ${middle}. Statisticians call this the interquartile mean — it stops one mansion or one bargain dragging the number around.`,
  },

  /** The collapsed map of where the mile's sales happened. */
  map: {
    heading: 'Where these sold',
    show: 'Show map',
    hide: 'Hide map',
  },

  /** The five-year price-trend card. The index is country-wide, never local. */
  trend: {
    heading: 'Price trend —',
    /** Heard in place of the trend line, which is a picture. */
    chartLabel: (country: string): string => `${country} UK HPI over 5 years`,
    oneYear: '1 year:',
    fiveYears: '5 years (total):',
    asOfLead: '· UK HPI to',
  },

  /** The market-activity card: monthly sales, new build, and the tenure split. */
  activity: {
    heading: 'Market activity',
    salesTo: 'sales in the 12 months to',
    newBuild: (percent: number): string => `· ${percent}% new build`,
    tenure: (freehold: number, leasehold: number): string => `· ${freehold}% freehold / ${leasehold}% leasehold`,
    /** Heard in place of the bar chart; `counts` is the months, comma separated. */
    sparkLabel: (month: string, counts: string): string => `Monthly sales over the 12 months to ${month}: ${counts}`,
  },

  /** The deprivation card. Always the index of the sector's own country. */
  deprivation: {
    heading: 'Deprivation',
    sourceEngland: 'Index of Multiple Deprivation 2025',
    sourceWales: 'Welsh Index of Multiple Deprivation 2025',
    /** Heard in place of the 1–10 scale, which is a picture. */
    scaleLabel: (decile: number, words: string): string => `Decile ${decile} of 10 — ${words}`,
    sentence: (words: string, country: string, decile: number): string =>
      `This sector is ${words} of ${country} (decile ${decile} of 10, where 1 is the most deprived tenth and 10 the least).`,
    sourceLead: 'Source:',
    /** Added when the index does not cover every postcode in the sector. */
    coverage: (percent: number): string => `· based on ${percent}% of postcodes here`,
    /** The plain words for a decile, 1 (most deprived) to 10 (least). */
    decileWords: {
      mostDeprived: 'in the most deprived tenth of areas',
      leastDeprived: 'in the least deprived tenth of areas',
      moreDeprived: 'among the more deprived areas',
      belowMiddle: 'a little below the middle',
      aboveMiddle: 'a little above the middle',
      lessDeprived: 'among the less deprived areas',
    },
  },

  /** The crime card. Counts from police.uk, never a judgement. */
  crime: {
    heading: 'Crime',
    loading: 'Loading crime data…',
    unavailable: 'Crime data unavailable right now (police.uk).',
    /** Follows the bold incident count. */
    summary: (month: string, radius: string): string =>
      `incidents recorded in ${month} within ${radius} of this postcode`,
    oneMile: '1 mile',
    halfMile: 'roughly half a mile',
    /** The police.uk attribution — quoted, never trimmed. */
    attribution: 'Crime data: data.police.uk (OGL v3).',
  },

  /** The flood card: live alerts only, plus the way to the long-term risk. */
  flood: {
    heading: 'Flood',
    loading: 'Loading flood data…',
    unavailable: 'Live flood data unavailable right now (Environment Agency).',
    /** Wales publishes its live alerts elsewhere, so the card links out. */
    walesLead: 'Live flood alerts for Wales are published by Natural Resources Wales —',
    walesLink: 'see live alerts (NRW)',
    none: 'No current flood alerts in this area.',
    /** Follows the bold alert count. */
    alerts: (count: number): string =>
      `current flood ${alertsWord(count)} in or near this area (within about 3 miles):`,
    longTermLead: 'Long-term risk is a different question —',
    longTermLink: (authority: string): string => `check long-term flood risk for this postcode (${authority})`,
  },

  /** The list of official services at the foot — we link, we never copy. */
  official: {
    heading: 'Official checks',
    /** Who runs the flood-risk checker, by country. */
    authorityEngland: 'GOV.UK',
    authorityWales: 'NRW',
    floodRisk: (authority: string): string => `Long-term flood risk checker (${authority})`,
    councilTax: 'Council tax band checker (GOV.UK)',
    findCouncil: 'Find your local council — HMO and licensing questions (GOV.UK)',
    landRegistry: 'Sold prices (HM Land Registry)',
    note: "These are official services — we link, we don't copy.",
  },

  /** The strip at the very foot: analyse this postcode with any strategy. */
  analyse: {
    navLabel: 'Analyse a property here',
    label: 'Analyse a property here as',
    comparables: 'Sold comparables',
  },
} as const;
