/**
 * X1 — EVERY WORD THE TRIAGE PANEL SAYS.
 *
 * THE LAW THIS FILE LIVES UNDER: the panel may warn, it may state facts, and it
 * may never bless. No score, no verdict, nothing that reads as an endorsement.
 *
 * The reason is not squeamishness. No free dataset resolves below about 1,500
 * people, so this tool genuinely cannot see the street, the neighbours, the
 * condition or the layout — and those are the things that most often kill a
 * deal. Telling somebody a property looks good when it is cheap for a reason
 * they cannot see would be the most damaging thing this product could do.
 *
 * `triageCopy.test.ts` fails if the words good, great, bargain, safe,
 * opportunity or value appear here as a judgement. That test is the enforcement;
 * this comment is the reason.
 */
import { COMPARABLE_RULES } from '../comparables/rules';
import { BAND_AREA_WORDS } from '../findings/copy';
import type { BandArea } from './priceBand';

export const TRIAGE_COPY = {
  /** ZONE ONE — the numbers. Labels, not sentences. */
  numbers: {
    heading: 'The numbers',
    asking: 'Asking price',
    perSqm: 'Per square metre',
    stampDuty: 'Stamp duty',
    stampDutyWales: 'Land Transaction Tax',
    cashNeeded: 'Cash needed to buy',
    /** X1 item 8 — a novice does not know this is what everyone else calls ROI. */
    returnOnCash: 'Return on the cash you put in (ROI)',
    noArea: 'No floor area in this listing',
    noAreaWhy: 'Add it in the analyser and the comparison works.',
    /**
     * X3 — WE ASK FOR THE HOUSE NUMBER, NOT THE FLOOR AREA.
     *
     * The panel used to put a "Floor area (m²)" box on screen, which is asking
     * somebody to go and find something we can fetch. With a postcode and a
     * house number the EPC register gives us the area — that is already built
     * and it works. So the box is gone and this asks for the one thing only
     * they can supply.
     */
    houseNumber: 'House number',
    houseNumberWhy: 'We’ll fetch the floor area from the EPC register.',
    /** The tax assumes the higher rate, because that is what this audience pays. */
    stampDutyBasis: 'At the second-property rate.',
    /** Never a single figure without saying what it rests on. */
    cashNeededBasis: (depositPct: number): string => `Deposit ${depositPct}%, tax and legals.`,
    /**
     * The bridge's arrangement fee is cash on day one and appears on no
     * listing. Naming it is most of why the strategy buttons matter.
     */
    cashNeededBridge: (depositPct: number, fee: string): string =>
      `Deposit ${depositPct}%, tax, legals, and ${fee} bridging fee.`,
    noPrice: 'No asking price on this listing',
    /**
     * A listing that gives "70-80 m²" has not given a floor area, it has given
     * a span — and a £/m² drawn from its midpoint is precise to a tenth of a
     * figure nobody stated. It says so rather than letting the number look read.
     */
    areaFromRange: (min: number, max: number): string => `The listing gives ${min}–${max} m²; this uses the midpoint.`,
  },

  /** The price comparison. A position, never an adjective. */
  band: {
    heading: 'Against similar sales',
    within: 'Within the typical range for this size and type in this area',
    above: 'Above the typical range for this size and type in this area',
    below: 'Below the typical range for this size and type in this area',
    range: (low: string, high: string): string => `Typical range ${low}–${high} per m²`,
    /**
     * C1 — the window and the AREA both come from the shared rules. It used to
     * say "last 3 years" and name no area at all, over a comparison that ran to
     * twelve months and to whatever the postcode sector happened to be.
     */
    basis: (n: number, area: BandArea): string =>
      `Based on ${n} sales of the same type and a similar size ${BAND_AREA_WORDS[area]}, last ${COMPARABLE_RULES.periodMonths} months`,
    /**
     * C1 — said when the default half mile could not reach five, so the search
     * stepped out to a mile. It used to say "this postcode sector", which was
     * the area the band actually used and is no longer the area it means.
     */
    widened: 'Not enough within ½ mile, so this reaches 1 mile',
    /**
     * PERMANENTLY BESIDE THE COMPARISON, and it carries BOTH required caveats:
     * what the comparison cannot see, and how coarse the area data is.
     *
     * They were two paragraphs. Both said "it cannot tell one street from the
     * next" in different words, one directly under the other, on a panel that
     * has to fit on one screen — so the reader paid twice for one fact and the
     * second paragraph is the one they stop reading. Merged, nothing is lost:
     * the size caveat, the 1,500-people resolution and the cheap-for-a-reason
     * warning are all still here, in the order they matter.
     */
    caveat: 'This compares size, not quality, across about 1,500 people — it cannot tell one street from the next. '
      + 'Cheap for the size can mean cheap for a reason.',
    tooFew: (n: number): string => `Only ${n} similar sales nearby. Not enough to compare against.`,
    /**
     * X3 — this used to say "add the floor area above", pointing at a box that
     * no longer exists. The area is fetched from the EPC register now, so the
     * honest line says what is missing rather than issuing an instruction the
     * panel cannot support.
     */
    needsArea: 'No floor area yet, so there is nothing to compare the price against.',
    spread: 'Prices here are too spread out to give a typical figure. Look at the sales themselves.',
  },

  /**
   * ZONE TWO — the flags. Silent unless it has something evidenced to say.
   *
   * X3 — THE WORDING MOVED TO `findings/copy.ts` AND STOPPED READING THE PAGE
   * BACK. It used to say "The listing mentions auction · Found: 'modern method
   * of auction' · Verify with the agent" — three lines to tell somebody
   * something already printed on the page they are looking at. It now says what
   * the auction MEANS: the buyer's fee is often 5% on top and often not on the
   * listing. One source of words for the panel, the injected chips and the
   * deal's own page.
   */
  flags: {
    heading: 'Worth checking',
    /**
     * SILENCE IS NOT AN ALL CLEAR, and it has to say so. A quiet panel is the
     * most dangerous state this thing has, because quiet reads as permission.
     */
    nothing: 'Nothing flagged from this listing.',
    nothingWhy: 'Not an all clear: condition, lease and the street need a viewing, a survey or a solicitor.',
  },

  /**
   * X1 item 6 — the evidence somebody would read if they did not know the agent.
   *
   * TWO LINES, NOT THREE. The brief asked for days listed, a price reduction and
   * the region's achieved-versus-asking figure. The first two are on the page
   * the user has open. The third is not built and cannot be: it needs asking
   * prices paired to sold prices, Land Registry publishes only the sold half,
   * and keeping the other half would mean storing a portal price series — the
   * dataset docs/exclusions.md forbids outright.
   *
   * The reduction says WHEN, never how much: neither portal publishes the old
   * price, so an amount could only come from a series we are not allowed to
   * keep. See flexibility.ts for the full reasoning.
   */
  flexibility: {
    heading: 'Possible flexibility',
    /**
     * X3 — ONLY PAST THE THRESHOLD.
     *
     * "On the market 4 days" is on the listing already, and repeating it back is
     * worth nothing. Days on the market only mean something when the number is
     * LONG — which is the config's own `longOnMarketDays` — or when the price has
     * actually moved. Below that, this says nothing at all.
     */
    listedFor: (days: number): string => `On the market ${days} days`,
    reducedOn: (date: string): string => `Reduced ${date}`,
    /** Never proof. The agent knows why they are selling; this tool does not. */
    caveat: 'Signals, not proof.',
  },

  /**
   * Beside any neighbourhood statistic that is NOT the price comparison. The
   * comparison carries its own, which already says this (see band.caveat), and
   * the panel shows no other area statistic today — so this is here for the
   * next one rather than printed twice under the same figure.
   */
  areaCaveat: 'These cover about 1,500 people. They cannot tell one street from the next.',

  /** X3 — the on-page chips switch, in the panel's own Settings. */
  chips: {
    label: 'Show findings on the listing page',
    note: 'Adds small PropLaunch tags to Rightmove and Zoopla pages. Off by default — it is your call.',
  },

  /** The way out of the panel and into the place that can actually ask questions. */
  settings: { link: 'Settings', back: '← Back to the listing' },

  /**
   * X1 item 9 — the handoff, at the bottom, after everything.
   *
   * The list in `why` is the list the handoff ACTUALLY carries, checked by name
   * in `handoffCarries.test.ts`. Tenure joined it in X1.1 — it had never
   * travelled, so the sentence named it only once the URL really did.
   */
  handoff: {
    action: 'Run the full numbers',
    why: 'Takes the photos, the floor plan and everything above with it.',
  },
} as const;
