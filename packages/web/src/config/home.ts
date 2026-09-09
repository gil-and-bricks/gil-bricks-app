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
  /**
   * THE HEADLINE (H1). It leads the page, so it says what the product DOES.
   * It used to sit under "PropLaunch — by Gil & Bricks", which repeated the
   * header word for word and spent the first line of the page on our own name.
   */
  lead: 'Check any England or Wales property against real sold prices, free.',
  /** Two sentences, no more: what it is and who it is for. */
  sub: 'Put in a listing and its numbers. It scores the deal out of ten and tells you in plain English what is holding it back.',

  /**
   * A1 — what this page says when features.dealScore is OFF. Nothing is scored
   * in that state, so the page may not promise a score or show one. Same page,
   * same shape: only the two claims that name the score change. The verdict,
   * the levers and the sold-price check all survive the flag, so their words do
   * too.
   */
  noScore: {
    sub: 'Put in a listing and its numbers. It checks them against real sold prices and gives you a verdict.',
    doesTitle: 'Works out the deal, not the listing',
  },

  /** And the same for the pipeline: with features.dealPipeline off there are no
   *  stages to move through, so the page may not say there are. Saved deals
   *  still live on the account page, which is what this promises instead. */
  noPipeline: {
    doesTitle: 'Keeps the ones worth keeping',
    doesBody: 'Save a deal to your account and come back to it whenever you like.',
  },

  /** The hero's own action. It goes to the analyser, because that is what the
   *  product is; the postcode box is a different, smaller question and it now
   *  sits with the other ways in rather than leading the page (H1). */
  heroCta: 'Analyse a deal — free',
  heroCtaNote: 'No sign-in. Nothing to install.',

  /** The postcode box, kept from the old homepage — moved down with the other
   *  ways in. "See area data" was the first thing a stranger met, and area data
   *  is not the most important thing this does. */
  search: {
    heading: 'Or start with an area',
    label: 'Start with a postcode',
    placeholder: 'e.g. CF37 1DL',
    submit: 'See area data',
  },

  /** The ways in, once somebody has seen what an answer looks like. */
  waysIn: { heading: 'Ways in' },

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
    /** The denominator on the score chip — the same words the analyser's own
     *  chip uses, kept here rather than typed into the page. */
    outOf: '/10',
    /** The figures shown beside the score. */
    labels: { score: 'Deal Score', roi: 'Return on cash', yield: 'Gross yield' },
    cta: 'Try it on a real property',
  },

  /** What it does, in four short claims we can each back with code. */
  does: {
    heading: 'What it does',
    items: [
      {
        /** Keyed so the page can swap this one title with the score off (A1). */
        id: 'scores',
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
        /** Keyed so the page can swap it with the pipeline off (A1). */
        id: 'pipeline',
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

  /**
   * A video slot, same pattern as /bridging-finance and /credit: click to load,
   * never autoplay, and honest while it is empty. Nothing reaches YouTube until
   * somebody presses play, which is what keeps the no-cookie-banner promise
   * true. Put the URL in `url` when the video exists; leave it empty and the
   * slot says so plainly. Remove the section entirely with features.homeVideo.
   */
  video: {
    url: '',
    heading: 'How it works, in two minutes',
    placeholder: 'A walkthrough is coming. Nothing is loaded here until then.',
    load: 'Play the walkthrough',
    note: 'Loads from YouTube only when you press play.',
  },

  /**
   * ============================================================
   *  OPERATOR: THIS IS THE ONE TO WRITE. Edit HOME.whyFree.body (and
   *  HOME.whyFree.heading if you want different words above it) in
   *  packages/web/src/config/home.ts. Nothing else needs touching:
   *  the placeholder disappears the moment `body` is not empty.
   *  Switch the whole section off with features.homeWhyFree.
   * ============================================================
   * Left deliberately empty. The page must not put words in the operator's
   * mouth about why he built this, so while `body` is empty it says plainly
   * that it is waiting rather than inventing a mission statement.
   */
  whyFree: {
    heading: 'Why this is free',
    /** ← YOUR WORDS GO HERE (HOME.whyFree.body). Empty ships the placeholder.
     *  Keep it to two sentences and under 30 words: CI's copy gate enforces
     *  that on every visible block, and it will fail the build if you don't. */
    body: '',
    placeholder: 'Gil is writing this bit. It will say why he built this and why it costs nothing.',
  },

  /** The trust line at the bottom. Every clause must be true. */
  trust: 'England & Wales · Sold prices from HM Land Registry · Floor areas from EPC · Index from UK HPI · No asking prices, no scraping',
} as const;
