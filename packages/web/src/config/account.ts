/**
 * Every word on the account screen, the login wall and the header auth slot.
 * Change a word here and it changes on screen — no code edit, no migration.
 *
 * The longer explanations already live in COPY.account (src/config/copy.ts):
 * why signing in helps, the delete warning, the cookies note. This file holds
 * the headings, buttons, ticks and confirmations around them.
 *
 * NEAR-LEGAL: the marketing tick is what somebody consents to, and the delete
 * flow is the last thing they read before an account and its deals go for
 * good. Read any change to those two as a regulator would.
 */

/** The header auth slot: the logged-out button, then the signed-in link. */
export const AUTH_HEADER = {
  logIn: 'Log in',
  myDeals: 'My deals',
} as const;

/** The /account page. */
export const ACCOUNT = {
  /** Signed out: the one card that stands in for the whole page. */
  signedOut: {
    heading: 'Sign in to see your deals',
    logIn: 'Log in',
  },

  /** Your name, your email, the marketing tick and what it says back. */
  profile: {
    heading: 'Your account',
    /** CONSENT: the exact words beside the tick. Same sentence as the wall. */
    marketing: 'Send me property deals & updates by email',
    /** Said when the tick goes off. Ticked on says COPY.account.signedUp. */
    marketingOff: 'Marketing emails off.',
    saveFailed: 'That did not save — please try again.',
    logOut: 'Log out',
  },

  /** My deals with the pipeline switched ON: the board owns them now. */
  pipeline: {
    heading: 'My deals',
    /** One sentence in three pieces, because the middle piece is the link. */
    lead: 'Your deals live in your',
    link: 'pipeline',
    tail: 'now — it shows which one needs you next.',
    cta: 'Open my pipeline',
  },

  /** My deals with the pipeline switched OFF: the flat list of saved deals. */
  deals: {
    heading: 'My deals',
    /** An error must never look like "nothing saved" — so it says so. */
    loadFailed: "Couldn't load your deals just now — refresh the page to retry.",
    /** The empty state, in three pieces: the middle one is the link. */
    emptyLead: 'Nothing saved yet. Run a property through any',
    emptyLink: 'analyser',
    emptyTail: "and press Save — it'll appear here.",
    /** The badge on a saved comparables run. Every other badge is the
     *  strategy's own short name, from @gil-bricks/core. */
    compsBadge: 'Comps',
    open: 'Open',
    share: 'Share',
    delete: 'Delete',
    /** The second tap: delete one saved deal, or keep it. */
    confirm: 'Sure?',
    keep: 'Keep',
    /** Screen-reader labels — the buttons repeat down the list, so each one
     *  names the deal it acts on. */
    deleteAria: (title: string): string => `Delete ${title}`,
    confirmAria: (title: string): string => `Yes, delete ${title}`,
    keepAria: (title: string): string => `Keep ${title}`,
    deleteFailed: (title: string): string => `Couldn't delete "${title}" — please try again.`,
  },

  /** Deleting the account itself. The warning above the button is
   *  COPY.account.deleteWarning. NEAR-LEGAL — see the note at the top. */
  deleteAccount: {
    heading: 'Delete my account',
    start: 'Delete my account',
    /** The confirmation, in two pieces: the first is bold. */
    sureLead: 'Are you sure?',
    sureTail: 'This deletes everything.',
    confirm: 'Yes — delete everything',
    cancel: 'Keep my account',
    failed: 'Delete failed — please try again.',
  },
} as const;

/** The login wall: the one modal every sign-in goes through. */
export const LOGIN_WALL = {
  closeAria: 'Close',
  title: (siteName: string): string => `Sign in to ${siteName}`,
  /** Cookies blocked: signing in cannot work, so we offer the link instead.
   *  The reason why is COPY.account.cookiesOff. */
  cookiesHeading: 'Turn on cookies to sign in',
  copyLink: 'Copy link',
  copied: 'Copied ✓',
  /** The scrollable terms box, and the tick that accepts it. */
  termsAria: 'Terms and disclaimer',
  acceptTerms: 'I accept the terms & disclaimer above',
  /** CONSENT: unticked by default, worded exactly as it is on /account. */
  marketing: 'Send me property deals & updates by email',
  /** Google's own button wording — leave it as Google writes it. */
  google: 'Continue with Google',
  /** Shown under the button while the terms box is unticked. */
  acceptFirst: 'Tick the terms box to continue.',
} as const;
