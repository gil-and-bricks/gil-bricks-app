/**
 * The post-answer capture path (T3) — every word of it, and the three emails
 * Kit sends.
 *
 * THE LAW THIS LIVES UNDER: the answer is never gated. This block does not
 * exist until the answer is on screen, it can be dismissed, and skipping it
 * makes no request at all. It is an offer, not a toll.
 *
 * WHAT MAKES IT HONEST: we only offer what actually arrives. A tool's offer
 * does not render until the operator has created its Kit tag, created the four
 * custom fields below, built the automation that sends the email, and named
 * that automation here. Until then the tools show no offer at all rather than
 * a promise nobody can keep.
 *
 * THE APP NEVER SENDS EMAIL. It writes a kit_outbox row carrying the person's
 * own figures as Kit custom fields; Kit's automation sends the email.
 */

/** The tools that can offer an email, and the Kit tag each one applies. */
export interface CaptureTool {
  /** Registry slug — must match src/config/tools.ts. */
  slug: string;
  /** ONE line, said after the answer: exactly what arrives. */
  offer: string;
  /** Kit tag id for this tool. EMPTY = no offer is shown on that tool. */
  kitTag: string;
  /** The name of the Kit automation that sends the email. Filling this in is
   *  how the operator says "the email really exists" — an offer with no
   *  automation behind it would be a promise nobody keeps. EMPTY = no offer. */
  kitAutomation: string;
}

/**
 * OPERATOR: create one Kit tag per tool, paste its id here, and build the
 * automation that sends the matching email below. An empty id switches that
 * tool's offer off — nothing is promised and nothing is collected.
 *
 * TURN ON KIT'S DOUBLE OPT-IN for these tags before you fill them in. A typed
 * address proves a human is present, never that they own the address, so the
 * confirmation click is what stops one person signing up another.
 */
export const CAPTURE_TOOLS: readonly CaptureTool[] = [
  {
    slug: 'equity',
    offer: 'We can email you this breakdown, plus what this equity could and could not do as a deposit.',
    kitTag: '',
    kitAutomation: '',
  },
  {
    slug: 'stamp-duty',
    offer: 'We can email you this breakdown, plus what changes for you if the rates change.',
    kitTag: '',
    kitAutomation: '',
  },
  {
    slug: 'rental-yield',
    offer: 'We can email you this breakdown, plus why the gross and net figures are so far apart.',
    kitTag: '',
    kitAutomation: '',
  },
];

/**
 * The Kit custom fields the outbox writes. OPERATOR: create these four in Kit
 * (Subscribers → Custom fields) with EXACTLY these keys, then use them in the
 * email as {{ subscriber.tool_headline }} and so on.
 */
export const KIT_FIELDS = {
  /** Which tool they used, e.g. "equity". */
  tool: 'tool_used',
  /** The one big number, formatted, e.g. "£171,494 of equity". */
  headline: 'tool_headline',
  /** The supporting figures on one line. */
  detail: 'tool_detail',
  /** The working, exactly as the show-the-maths panel gave it. */
  maths: 'tool_maths',
} as const;

/**
 * True only when this tool can really deliver what it offers: a Kit tag to
 * apply AND a named automation that sends the email. Either one missing and the
 * offer never renders — same shape as brokerReady() on the bridging page.
 */
export function captureReady(slug: string): boolean {
  const t = CAPTURE_TOOLS.find((x) => x.slug === slug);
  return t !== undefined && t.kitTag.trim() !== '' && t.kitAutomation.trim() !== '';
}

export function captureFor(slug: string): CaptureTool | undefined {
  return CAPTURE_TOOLS.find((x) => x.slug === slug);
}

/** Every word of the block itself. */
export const CAPTURE_COPY = {
  heading: 'Want this in writing?',
  /** The second line, under the per-tool offer. Same on all three. */
  sub: 'Your figures, in one email. Nothing else is sent.',
  /** The two ways to take it. The Google one-tap is offered only to someone
   *  already signed in — sending a signed-out visitor to Google is a full page
   *  trip that would lose the answer they asked us to email. */
  googleSignedIn: (email: string): string => `Send it to ${email}`,
  typed: 'Use another email',
  /** What a signed-out visitor sees: one field, no round trip. */
  byEmail: 'Email it to me',
  emailLabel: 'Your email address',
  send: 'Send it',
  sending: 'Sending…',
  dismiss: 'No thanks',
  dismissLabel: 'Hide this offer',
  /** The consent line beside an UNTICKED box. Says who and what, plainly. */
  consent: 'Email me this breakdown and occasional property emails. Unsubscribe any time.',
  consentRequired: 'Tick the box so we know you want the email.',
  emailInvalid: 'Check the email address.',
  humanFailed: 'The human check did not pass. Try again.',
  failed: 'That did not send. Your answer is still on screen.',
  /** After a successful queue — honest about who sends it. */
  sent: 'On its way. Kit sends it, usually within a few minutes.',
  /** Said where the answer is, never over it. */
  privacyBefore: 'We store your email to send it. ',
  privacyLink: 'Privacy',
  privacyAfter: '.',
} as const;

/**
 * The person's own figures, worded for the email. The COMPONENTS pass numbers
 * that are already on screen; these say how they read. No maths here — every
 * figure arrives formatted by @gil-bricks/core.
 */
export const LEAD_LINES = {
  equity: {
    headline: (equity: string): string => `${equity} of equity`,
    detail: (value: string, owed: string, ltv: string): string =>
      `Estimated value ${value}. Still owed ${owed}. Loan to value ${ltv}.`,
  },
  stampDuty: {
    headline: (tax: string, taxName: string): string => `${tax} in ${taxName}`,
    detail: (rate: string, regime: string, from: string): string =>
      `Effective rate ${rate}. ${regime}. Rates effective from ${from}.`,
  },
  yield: {
    headline: (net: string): string => `${net} net yield`,
    detail: (gross: string, costs: string): string =>
      `Gross yield ${gross}. Running costs ${costs} a year.`,
  },
} as const;

/**
 * THE THREE EMAILS, for the operator to paste into Kit and edit.
 *
 * Each one is short, gives the person their own numbers back, and points at the
 * analyser as the next step. No hype. The {{ subscriber.* }} placeholders are
 * Kit's own merge fields, filled from the custom fields above.
 */
export const EMAIL_DRAFTS = {
  equity: {
    subject: 'Your equity figure, and what it can do',
    body: [
      'Here is what the calculator worked out for you:',
      '{{ subscriber.tool_headline }}',
      '{{ subscriber.tool_detail }}',
      'The working: {{ subscriber.tool_maths }}',
      'What that equity can do as a deposit: lenders normally want 20–25% down on a buy-to-let, so this figure is the raw material, not the whole deposit. Stamp duty, legal costs and a refurb budget come out of your side of it too.',
      'What it cannot do: it is not a valuation, and no lender will lend against it. They will send a surveyor.',
      'If you want to test a specific property against real sold prices, the analyser does that in about a minute.',
    ],
  },
  'stamp-duty': {
    subject: 'Your stamp duty figure, and what moves it',
    body: [
      'Here is what the calculator worked out for you:',
      '{{ subscriber.tool_headline }}',
      '{{ subscriber.tool_detail }}',
      'The working, band by band: {{ subscriber.tool_maths }}',
      'What changes it: the bands are set by the government and do change — the figure above names the date the rates you were given came into force. A change to the additional-property rates moves this number the most, because those rates apply to every band.',
      'What it does not cover: Scotland, mixed use, companies and the extra rate for non-UK residents.',
      'If you are buying to let, the analyser puts this tax into the deal and tells you whether it still works.',
    ],
  },
  'rental-yield': {
    subject: 'Your yield figures, and the gap between them',
    body: [
      'Here is what the calculator worked out for you:',
      '{{ subscriber.tool_headline }}',
      '{{ subscriber.tool_detail }}',
      'The working: {{ subscriber.tool_maths }}',
      'Why the two figures differ: gross is a year of rent over the price and ignores every cost. Net takes off the letting agent, maintenance, insurance, empty weeks and any ground rent. The gap between them is what those costs take, as a share of the price.',
      'Neither figure includes a mortgage. Both divide by the price; the analyser divides by your all-in cost, including stamp duty and refurb, which is the number to buy on.',
    ],
  },
} as const;
