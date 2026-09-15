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
    areaLabel: 'Floor area (m²)',
    /** The tax assumes the higher rate, because that is what this audience pays. */
    stampDutyBasis: 'Assumes a second or additional property.',
    /** Never a single figure without saying what it rests on. */
    cashNeededBasis: (depositPct: number): string => `Deposit ${depositPct}%, plus tax and legal costs.`,
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
    basis: (n: number): string => `Based on ${n} sales of the same type and a similar size, last 3 years`,
    widened: 'Not enough in this postcode sector, so this is the wider area',
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
    /** Shown when the floor-area box above is empty — it says where to fix it. */
    needsArea: 'Add the floor area above to compare this against similar sales.',
    spread: 'Prices here are too spread out to give a typical figure. Look at the sales themselves.',
  },

  /** ZONE TWO — the flags. Silent unless it has something evidenced to say. */
  flags: {
    heading: 'Worth checking',
    leasehold: 'The listing says leasehold',
    auction: 'The listing mentions auction',
    tenantInSitu: 'The listing mentions a tenant in situ',
    cashBuyers: 'The listing says cash buyers only',
    nonStandardConstruction: 'The listing mentions non-standard construction',
    commercialBelow: 'The listing mentions commercial premises nearby',
    /** Every text-derived flag carries this. It was read, not established. */
    verify: 'Verify with the agent.',
    found: (words: string): string => `Found: “${words}”`,
    /**
     * SILENCE IS NOT AN ALL CLEAR, and it has to say so. A quiet panel is the
     * most dangerous state this thing has, because quiet reads as permission.
     */
    nothing: 'No red flags found in the listing or in open data.',
    nothingWhy: 'Not an all clear: condition, lease and the exact street need a viewing, a survey or a solicitor.',
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
    listedFor: (days: number): string => `On the market ${days} days`,
    reducedOn: (date: string): string => `Price reduced on ${date}`,
    /** Never proof. The agent knows why they are selling; this tool does not. */
    caveat: 'Signals, not proof. Only the agent knows why they are selling.',
  },

  /**
   * Beside any neighbourhood statistic that is NOT the price comparison. The
   * comparison carries its own, which already says this (see band.caveat), and
   * the panel shows no other area statistic today — so this is here for the
   * next one rather than printed twice under the same figure.
   */
  areaCaveat: 'These cover about 1,500 people. They cannot tell one street from the next.',

  /** The way out of the panel and into the place that can actually ask questions. */
  settings: { link: 'Settings', back: '← Back to the listing' },

  /**
   * X1 item 9 — the handoff, at the bottom, after everything.
   *
   * The list in `why` is the list the handoff ACTUALLY carries, checked by name
   * in `handoffCarries.test.ts`. Tenure is deliberately absent: it has never
   * travelled, and a sentence promising it would be the panel telling the user
   * something the URL does not do. See docs/DECISIONS_LOG.md (X1).
   */
  handoff: {
    action: 'Run the full numbers',
    why: 'Carries the price, size, type, address, photos and floor plan.',
  },
} as const;
