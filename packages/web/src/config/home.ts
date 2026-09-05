/**
 * The homepage (D2) — every word, and the one worked example it shows.
 *
 * THE POINT OF THIS PAGE: someone arriving cold from a YouTube comment should
 * know in ten seconds what this is. So the page SHOWS a Deal Score doing its
 * job rather than describing one — the example below is scored at BUILD TIME by
 * @gil-bricks/core, the same engine the analyser uses, so the number on the
 * homepage can never drift from the product.
 *
 * Nothing here may claim anything the code cannot do.
 */
export const HOME = {
  /** The one line under the name. */
  lead: 'Check any England or Wales property against real sold prices, free.',
  /** Two sentences, no more: what it is and who it is for. */
  sub: 'Put in a listing and its numbers. It scores the deal out of ten and tells you in plain English what is holding it back.',

  /** The postcode box, kept from the old homepage. */
  search: {
    label: 'Start with a postcode',
    placeholder: 'e.g. CF37 1DL',
    submit: 'See area data',
  },

  /** The worked example. These are the only numbers on the page that are ours;
   *  everything else about it — the score, the verdict, the figures — comes
   *  from the engine at build time. Change these and the answer changes. */
  example: {
    inputs: { price: 120000, monthlyRent: 750, country: 'W92000004' },
    heading: 'This is what an answer looks like',
    /** The property the example describes, in words. */
    subject: 'A £120,000 terrace in Swansea, let at £750 a month.',
    /** Said under the score card, so nobody thinks it is a mock-up. */
    note: 'Worked out by the same engine the analyser uses, when this page was built.',
    /** The figures shown beside the score. */
    labels: { score: 'Deal Score', roi: 'Return on cash', yield: 'Gross yield' },
    cta: 'Try it on a real property',
  },

  /** What it does, in four short claims we can each back with code. */
  does: {
    heading: 'What it does',
    items: [
      {
        title: 'Scores the deal, not the listing',
        body: 'Buy-to-let, flips, BRRRR and small HMOs, each with its own maths and its own verdict.',
      },
      {
        title: 'Checks it against what actually sold',
        body: 'Sold prices from HM Land Registry, floor areas from EPC records. No asking prices.',
      },
      {
        title: 'Says what is holding it back',
        body: 'One binding number, in plain English, and what would have to change to fix it.',
      },
      {
        title: 'Follows the deal until you buy',
        body: 'Save it and it moves through your pipeline, from worth a look to bought it.',
      },
    ],
  },

  /** The extension, promoted properly now that it is published. */
  extension: {
    heading: 'Do it without leaving Rightmove',
    body: 'The free Chrome side panel scores the listing you are looking at, on the page.',
    note: 'Chrome on a desktop or laptop. It is not available on phones.',
    more: 'See what it does',
  },

  /** The three tools, named for what they answer. */
  tools: {
    heading: 'Quick answers',
    body: 'Three calculators that answer one question each, with no sign-in.',
    cta: 'Open the tools',
  },

  /** The strategy cards under the fold. */
  strategies: { heading: 'Pick a strategy' },

  /** The chooser for people who do not know which one they want. */
  chooser: {
    body: 'Not sure which one? Answer four questions.',
    cta: 'Point me at the right tool',
  },

  /** The trust line at the bottom. Every clause must be true. */
  trust: 'England & Wales · Sold prices from HM Land Registry · Floor areas from EPC · Index from UK HPI · No asking prices, no scraping',
} as const;
