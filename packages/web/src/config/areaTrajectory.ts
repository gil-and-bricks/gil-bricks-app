/**
 * CA1 — every word the area trajectory panel says.
 *
 * THE WHOLE JOB IS THE WORDING. This panel shows what an area has done and what
 * the arithmetic says if it did the same again. It must never read as a
 * forecast, because it is not one and because claiming otherwise is both untrue
 * and the thing the ASA upholds complaints about: growth claims whose basis is
 * not apparent, and returns rested on historical success.
 *
 * So the words here are load-bearing. A test (`areaTrajectory.test.ts`) fails
 * on the words forecast, predict, projected, projection, expected and will be
 * anywhere in this file. If a phrase needs one of those words, the phrase is
 * wrong, not the test.
 *
 * N5: nothing visible runs over two sentences or about thirty words. The
 * honest sentence is deliberately the longest thing here and is exempted by
 * name in copy.test.ts — it is the disclosure the whole panel rests on and
 * shortening it would cost the meaning.
 */

export const AREA_TRAJECTORY = {
  /** The one line you tap to open it. Closed, this is all the panel is. */
  summary: 'What this area has done with prices',
  /** Under that line, so the closed state still says what it is not. */
  summaryHint: 'History, and what the same again would look like. Not a forecast.',

  heading: 'What this area has done',

  /**
   * THE HONEST SENTENCE. Always visible where the numbers are, never behind a
   * tooltip, never below the fold of the panel.
   */
  honest: 'This is what the area has done, not what it will do. House prices can '
    + 'fall as well as rise. Nobody can forecast a local market over five or ten '
    + 'years, and anyone who says otherwise is selling something.',

  /** Said above the chart, so the picture is labelled before it is read. */
  chartIntro: (area: string): string => `${area}, and the same again`,
  chartHistoryLabel: 'What happened',
  chartBandLabel: 'The same again',
  chartAlt: (area: string, years: number): string =>
    `Line chart: ${area} house price index over ${years} years, with a shaded band `
    + 'showing the range if its own past rates repeated.',

  history: {
    heading: 'The record',
    /** e.g. "Over 5 years" / "a year" */
    over: (years: number): string => `Over ${years} years`,
    aYear: 'a year',
    /** The geography the figures are for. */
    forArea: (area: string): string => `Figures for ${area}.`,
    source: (month: string): string => `UK House Price Index, ${month}.`,
    none: 'No published index for this area yet.',
  },

  compare: {
    heading: 'Against the wider area',
    /** e.g. "Telford and Wrekin 4.3% · West Midlands 4.0% · England 3.1%" */
    row: (name: string, rate: string): string => `${name} ${rate}`,
    note: 'A year, over ten years.',
  },

  variability: {
    heading: 'How even it has been',
    /** The worst year is the point of this block. */
    worst: (rate: string, years: number): string => `Worst year in ${years}: ${rate}.`,
    best: (rate: string): string => `Best year: ${rate}.`,
    fell: (n: number, years: number): string =>
      (n === 0 ? `None of those ${years} years fell.` : `${n} of those ${years} years fell.`),
  },

  affordability: {
    heading: 'Price against earnings',
    /** e.g. "6.4 times earnings here, 7.6 across England." */
    line: (here: string, hereName: string, wider: string, widerName: string): string =>
      `${here} times earnings in ${hereName}, ${wider} in ${widerName}.`,
    only: (here: string, hereName: string): string => `${here} times earnings in ${hereName}.`,
    /** WHICH ratio, because ONS publishes two and they differ. */
    measure: (period: string): string =>
      `ONS residence-based ratio, ${period}. A workplace-based one exists and differs.`,
    none: 'No published ratio for this area.',
  },

  scenarios: {
    heading: 'If it repeated itself',
    /** Every band is labelled with the assumption it rests on. */
    assumption: (years: number): string => `If it repeated its own last ${years} years`,
    low: 'Its weaker years',
    central: 'Its own rate',
    high: 'Its stronger years',
    /** e.g. "0.7% a year → £228,235" */
    band: (rate: string, end: string): string => `${rate} a year → ${end}`,
    /** Above the three bands. */
    basis: (area: string, years: number): string =>
      `Rates from ${area}'s own last ${years} years. Assumptions, not predictions.`,
    inflation: 'Some or all of any rise may be inflation rather than real gain.',
    /** The five-year block is the headline; ten is flagged. */
    horizon: (years: number): string => `Over ${years} years`,
    illustrative: 'Ten years is illustrative only — the honest range is very wide.',
    showMaths: 'Show the maths',
  },

  withheld: {
    /** Fewer than thirty sales: no figure, and why. */
    tooFewSales: (area: string, sales: number, floor: number): string =>
      `${area} had ${sales} sales registered in the year — under ${floor}, so no trend is shown for it.`,
    tooFewSalesUnknown: (area: string, floor: number): string =>
      `No sales count for ${area}, so no trend is shown — the floor is ${floor}.`,
    /** When we stepped out to a wider area instead. */
    fellBack: (from: string, to: string): string => `Showing ${to} instead of ${from}.`,
    tooLittleHistory: 'Not enough published history here to show the same again.',
  },

  /** Open Government Licence attribution, required by both sources. */
  attribution: 'Contains HM Land Registry data © Crown copyright and database right 2026, '
    + 'and ONS data © Crown copyright. Licensed under the Open Government Licence v3.0.',

  loading: 'Loading the area’s record…',
  failed: 'The area record would not load. Everything else on this page still works.',
} as const;
