/**
 * Every word the analyser page types for itself: the property form, the shell
 * around the verdict, and the action bar under the results. EDIT ANY WORD HERE
 * — the components render these keys and hold no text of their own.
 *
 * NOT here on purpose: the strategy field labels and tips (they belong to the
 * StrategyConfig in @gil-bricks/core), the 'i' tooltips (src/content/microcopy.ts),
 * the hints, empty states and errors shared with other pages (src/config/copy.ts),
 * and the section strip (src/config/analyserSections.ts).
 *
 * Dropdown VALUES are stable keys — they travel in the shareable URL and in a
 * saved deal. Only the words beside them live here, so any label can be reworded
 * without touching a link anyone has already shared.
 */

/** The subject-property form: "The property" card at the top of the analyser. */
export const SUBJECT_FORM = {
  /** The label beside each input. Each carries its own unit — nothing goes under it. */
  labels: {
    postcode: 'Postcode',
    paon: 'House number / name',
    price: 'Price (£)',
    type: 'Property type',
    area: 'Internal area (sqm)',
    beds: 'Bedrooms',
    baths: 'Bathrooms',
    refurb: 'Refurb needed',
    age: 'Age band',
    garden: 'Garden',
    parking: 'Parking',
  },
  /** The EPC floor-area helper beside "Internal area": its button and its replies. */
  epc: {
    /** The button. `lookupBusy` shows in its place while the lookup runs. */
    lookupButton: 'EPC lookup',
    lookupBusy: '…',
    /** No address matched. */
    noMatch: 'No EPC match found for this address.',
    /** Said while the button is off, so the grey is explained (D1). */
    needsNumber: 'Add the house number first.',
    /** Shown under the field when the area came from the EPC match. */
    fromEpc: 'From the EPC match for this address — edit to override.',
    /** The typed figure always wins; this says what the EPC would have said. */
    keptYours: (sqm: number): string => `EPC says ${sqm} sqm — your figure kept.`,
  },
  /** The dropdown choices. The empty row every optional dropdown opens on. */
  choices: {
    empty: '—',
    /** Property type — the one dropdown whose empty row asks for a choice. */
    typePrompt: 'Choose…',
    type: {
      detached: 'Detached',
      semiDetached: 'Semi-detached',
      terraced: 'Terraced',
      flat: 'Flat',
    },
    refurb: {
      none: 'None',
      light: 'Light',
      moderate: 'Moderate',
      heavy: 'Heavy',
    },
    age: {
      pre1900: 'Pre-1900',
      from1900: '1900–1949',
      from1950: '1950–1999',
      from2000: '2000 on',
    },
    garden: {
      none: 'None',
      yes: 'Yes',
    },
    parking: {
      none: 'None',
      one: '1 space',
      twoPlus: '2+',
    },
  },
} as const;

/** The analyser shell: the arrival note, the headings and the walkthrough link. */
export const ANALYSER_SHELL = {
  /** The ✕ on the one-line note shown when the extension filled the form in. */
  dismissArrived: 'Dismiss',
  /** The heading over the property form. */
  propertyHeading: 'The property',
  /** The strategy switcher's label — the second wording is used off a strategy page. */
  switchStrategy: 'Analyse this as…',
  switchStrategyFromComps: 'Analyse this property as…',
  /** The verdict card when a strategy has no verdict island yet. */
  verdictRegionLabel: 'Strategy verdict',
  verdictHeading: (strategyName: string): string => `${strategyName} verdict`,
  /** The free YouTube walkthrough for this strategy — help, never promotion. */
  youtube: {
    lead: (strategyName: string): string => `New to ${strategyName}?`,
    link: 'Watch the free walkthrough →',
    ariaLabel: (strategyName: string): string =>
      `Watch the free walkthrough for ${strategyName} on YouTube (opens a new tab)`,
  },
} as const;

/** The action bar under the results: share, copy, save, PDF. */
export const ACTION_BAR = {
  /** The buttons, left to right. Each pair is the resting word then the busy one. */
  buttons: {
    share: 'Share on WhatsApp',
    copyLink: 'Copy link',
    copied: 'Copied ✓',
    save: 'Save',
    saving: 'Saving…',
    pdf: 'PDF',
  },
  /** What the Save button becomes once the deal is stored. */
  saved: {
    inPipeline: 'In your pipeline ✓',
    inMyDeals: 'Saved ✓ — view in My deals',
  },
  /** The quiet line beside the buttons. The link sits between `before` and `after`,
   *  so the spaces at their edges are part of the sentence — keep them. */
  hint: {
    pdfSoon: 'PDF export — coming soon.',
    pipelineBefore: 'It’s in your ',
    pipelineLink: 'pipeline',
    pipelineAfter: ' — it’ll re-score as facts land.',
    myDealsBefore: 'Saved to ',
    myDealsLink: 'My deals',
    myDealsAfter: '.',
  },
  /** When the save did not go through. */
  saveFailed: "That didn't save — please try again.",
} as const;
