/**
 * The smaller corners of the app, in words (N5/N1). Nothing else owns these:
 * the Article 4 flag, the /start chooser, the map's own controls and pin
 * popup, the provenance badges, the Deal Score chip, and the messages the
 * build prints when an edit to quiz.json is wrong. Change any word here and
 * no component changes.
 *
 * Nothing here computes anything. Figures are formatted by the component or
 * by @gil-bricks/core and handed in — these are only the words around them.
 */

/* ------------------------------------------------------------------------- */
/* Article 4 — src/lib/map/article4.ts + components/analyser/Article4Flag.tsx */
/* ------------------------------------------------------------------------- */

/** Said on every England answer, clear or not: the dataset is never the last
 *  word, the council is. Kept as one string so it reads the same every time. */
const CAVEAT = 'Coverage is incomplete and councils change these — always confirm with the council before you buy.';

/**
 * The Article 4 flag on the HMO analyser. One headline + one detail per state,
 * in the operator's voice. NEVER claims certainty and always ends at the
 * council — read a change here as a regulator would.
 */
export const ARTICLE4_COPY = {
  caveat: CAVEAT,
  /** Welsh postcodes: the national dataset is England only, so we say so. */
  wales: {
    headline: 'Article 4 not checked here',
    detail: 'The national dataset covers England only. In Wales, check with the council.',
  },
  /** The lookup itself failed — distinct from "nothing recorded here". */
  unavailable: {
    headline: 'Article 4 couldn’t be checked',
    detail: `The planning data service didn’t respond. ${CAVEAT}`,
  },
  /** Nothing recorded at this point. */
  clear: {
    headline: 'No Article 4 direction recorded here',
    detail: `Nothing in the national planning dataset at this point — but ${CAVEAT}`,
  },
  /** The recorded right removed IS the small-HMO (C3→C4) one. */
  hmo: {
    headline: 'Article 4 recorded here — likely affects small HMOs',
    detail: `The recorded Article 4 direction here removes the small-HMO (C3→C4) permitted-development right, so a small HMO would likely need planning permission. ${CAVEAT}`,
  },
  /** A right is recorded and it is not the small-HMO one. */
  otherRight: {
    headline: 'Article 4 direction recorded here (not small-HMO)',
    detail: `An Article 4 direction is recorded here, but the recorded right it removes is not the small-HMO (C3→C4) right. ${CAVEAT}`,
  },
  /** A direction is recorded but the record does not say which right it removes. */
  unspecified: {
    headline: 'Article 4 direction recorded here',
    detail: `An Article 4 direction is recorded here. The record doesn’t specify which right it removes — it may or may not restrict small HMOs. ${CAVEAT}`,
  },
  /** The way out of the flag: the council's own page, and the note screen
   *  readers hear because the link opens a new tab. */
  findCouncil: 'Find the council',
  opensNewTab: '(opens in a new tab)',
} as const;

/* ------------------------------------------------------------------------- */
/* The /start chooser — src/components/quiz/QuizApp.tsx                       */
/* ------------------------------------------------------------------------- */

/**
 * The chrome around the quiz. The QUESTIONS, the intro and the results are
 * operator content in src/config/quiz.json (docs/QUIZ_OPERATOR_GUIDE.md) —
 * only the buttons and the two optional fields live here.
 */
export const QUIZ_COPY = {
  /** Said to screen readers on every step, so progress is never colour-only. */
  progress: (step: number, total: number): string => `Step ${step} of ${total}`,
  /** The optional property step. Skippable — this is never a wall. */
  optionalLead: 'Got a property in mind? (optional)',
  postcode: 'Postcode',
  budget: 'Budget (£)',
  /** The three buttons. */
  start: 'Start',
  back: 'Back',
  /** The result's button through to the analyser it picked. The strategy name
   *  comes from the strategy config in @gil-bricks/core — never re-typed. */
  openAnalyser: (strategy: string): string => `Open the ${strategy} analyser`,
  /** The quiet way past the whole thing, on every step. */
  skip: 'Skip — take me to the tools',
} as const;

/* ------------------------------------------------------------------------- */
/* The map — src/components/analyser/mapImpl.ts                              */
/* ------------------------------------------------------------------------- */

/** The map's own controls and the pin popup. The figures in a popup are
 *  formatted by @gil-bricks/core; these are the words beside them. */
export const MAP_COPY = {
  /** The "Reset view" control that re-frames the radius and the comps. */
  reset: {
    button: 'Reset',
    tooltip: 'Reset view',
    ariaLabel: 'Reset the map view',
  },
  /** The licence line the map must print, quoted verbatim — attribution, not copy. */
  attribution: 'Sold data © Crown copyright, OGL v3',
  /** Property type, spelled out from the Land Registry's one-letter code. */
  typeWords: { D: 'Detached', S: 'Semi', T: 'Terraced', F: 'Flat', O: 'Other' } as Record<string, string>,
  /** Tenure, spelled out from the same source. */
  freehold: 'Freehold',
  leasehold: 'Leasehold',
  /** The popup's link through to the full sold record. */
  details: 'Details →',
} as const;

/* ------------------------------------------------------------------------- */
/* Field provenance badges — src/components/analyser/provenance.ts           */
/* ------------------------------------------------------------------------- */

/** Small, quiet, consistent labels beside a prefilled field, so a suggested
 *  figure never looks like a fact. `carried` is the HONEST catch-all. */
export const PROVENANCE_LABELS = {
  listing: 'from the listing',
  epc: 'from EPC data',
  typed: 'you typed it',
  settings: 'your saved settings',
  carried: 'brought from the extension',
} as const;

/* ------------------------------------------------------------------------- */
/* Deal Score chip — src/components/analyser/DealScore.tsx                   */
/* ------------------------------------------------------------------------- */

/** The words around the score. The score, the verdict and the headline all
 *  come from @gil-bricks/core's scoreDeal — nothing here computes them. */
export const DEAL_SCORE_COPY = {
  /** What a screen reader hears instead of the chip: the same summary a
   *  sighted user sees, in one sentence. */
  ariaLabel: (score: string, verdict: string, headline: string): string =>
    `Deal score ${score} out of 10 — ${verdict}. ${headline}`,
  /** Introduces the single binding constraint inside the verdict card. */
  bindingLead: 'What’s holding it back:',
} as const;

/* ------------------------------------------------------------------------- */
/* quiz.json build gate — src/lib/quiz/quiz.ts                               */
/* ------------------------------------------------------------------------- */

/**
 * What the build says when an operator edit to quiz.json is wrong. Each one
 * names the exact field, so the fix is obvious without reading any code.
 * See docs/QUIZ_OPERATOR_GUIDE.md.
 */
export const QUIZ_JSON_ERRORS = {
  version: '"version" must be 1',
  intro: '"intro" needs a title and a body',
  questions: '"questions" must be a non-empty list',
  questionMissingId: 'every question needs an "id"',
  questionDuplicateId: (id: string): string => `question id "${id}" is used twice`,
  questionMissingPrompt: (id: string): string => `question "${id}" needs a "prompt"`,
  questionType: (id: string): string => `question "${id}": only type "single" is supported`,
  questionTooFewOptions: (id: string): string => `question "${id}" needs at least two options`,
  optionMissingId: (questionId: string): string => `an option in question "${questionId}" is missing its "id"`,
  optionDuplicateId: (questionId: string, optionId: string): string =>
    `option id "${optionId}" is used twice in question "${questionId}"`,
  optionMissingLabel: (questionId: string, optionId: string): string =>
    `option "${questionId}.${optionId}" needs a "label"`,
  optionMissingWeight: (questionId: string, optionId: string, strategy: string): string =>
    `option "${questionId}.${optionId}" is missing a number weight for "${strategy}"`,
  scoringMethod: '"scoring.method" must be "sum"',
  tieBreak: '"scoring.tieBreak" must list each of btl, flip, brrrr, hmo exactly once',
  result: (strategy: string): string => `"results.${strategy}" needs a headline and a body`,
} as const;
