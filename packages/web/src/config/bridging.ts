/**
 * The bridging enquiry (F1) — every word, every threshold, every address.
 * Switched by features.bridgingFinance.
 *
 * WHAT THIS PAGE IS: an INTRODUCTION to one broker the operator knows. It is
 * not advice, not a comparison, not a decision, and never a promise about
 * anyone's finance. CLAUDE.md → "Bridging finance page" governs the wording:
 * treat any change here like a change to a legal document.
 *
 * Every string obeys the copy rules (CLAUDE.md → "Copy rules"), enforced by
 * config/copy.test.ts: one idea a sentence, nothing over 30 words.
 */

/**
 * The one placeholder set the operator fills in before enquiries open. While
 * ANY of these still says TBC (or a Kit tag is empty) the form does not render:
 * nobody can consent to sharing their details with an unnamed recipient, and
 * nothing can be queued that has nowhere to go. See brokerReady().
 */
export const BROKER = {
  /** Shown to the user as the person they are being introduced to. */
  name: 'TBC — the broker’s name',
  /** Where the qualified enquiry is emailed BY KIT (never by this app). */
  email: 'TBC-broker@example.com',
  /** Our own dedicated inbox for enquiry copies and replies. */
  inbox: 'TBC-bridging@example.com',
  /** Kit tag ids. Until these are real, the outbox row stays pending and the
   * cron retries — the enquiry is already safe in D1. */
  kitTagQualified: '',
  kitTagNotYet: '',
} as const;

/** True only when there is a real, named broker and somewhere to send it. */
export function brokerReady(): boolean {
  const filled = (v: string): boolean => v.trim() !== '' && !v.includes('TBC') && !v.includes('example.com');
  return filled(BROKER.name) && filled(BROKER.email) && filled(BROKER.inbox)
    && BROKER.kitTagQualified.trim() !== '' && BROKER.kitTagNotYet.trim() !== '';
}

/** Shown instead of the form until brokerReady() — honest, not a teaser. */
export const BRIDGING_NOT_OPEN = {
  heading: 'Enquiries are not open yet',
  body: 'The introduction goes live once the broker details are set up. Nothing is collected until then.',
} as const;

/** Tunable qualification thresholds — change here, never in code. */
export const BRIDGING_RULES = {
  /** Below this the lenders a broker would use will not write the loan. */
  minLoan: 25000,
  /** Deposit bands in order, worst to best. The gate is the first that passes. */
  depositBands: ['under-10', 'not-sure', '10-24', '25-plus'] as const,
  minDepositBand: '10-24',
  /** The free-text answer has to show real thought. */
  minStoryChars: 150,
  /** Fewer distinct words than this reads as filler, whatever its length. */
  minStoryWords: 25,
  /** Below this share of DISTINCT words, the text is padding, not an answer. */
  minDistinctWordRatio: 0.5,
  /** Words that show a repayment route. Per exit route, plus a general list —
   * widen these rather than rejecting ordinary English. */
  repaymentWords: {
    refinance: ['refinanc', 'remortgag', 'mortgage', 'term loan', 'btl', 'buy to let', 'buy-to-let'],
    sell: ['sell', 'sale', 'sold', 'flip', 'resell', 'onward sale', 'market it'],
    other: ['repay', 'pay it back', 'pay the loan back', 'pay off', 'pay down', 'settle', 'clear the', 'redeem', 'proceeds', 'cash', 'savings', 'inheritance', 'exit'],
  },
  /** The form's own labels and hints. Pasted back at us, they are not an
   * answer — keep this in step with the labels above. */
  pagePhrases: [
    'in your own words, what is the deal and how will you pay the loan back',
    'a short paragraph. this is the part the broker reads first',
    'how will you pay the bridge back',
    'how much do you want to borrow',
    'how much of your own money can you put in',
  ],
  /** A phone number has to look like one (digits only, after stripping). */
  minPhoneDigits: 10,
  maxPhoneDigits: 15,
} as const;

export const BRIDGING = {
  route: '/bridging-finance',
  navLabel: 'Bridging finance',
  title: 'Bridging finance',
  tagline: 'An introduction to a broker I know and trust.',

  /** In the operator's voice: what this is, before anything is asked. */
  what: {
    heading: 'What this is',
    body: [
      'I work with a bridging and mortgage broker I have known for years.',
      'He does the work. You pay nothing for the introduction.',
      'This is not advice, and it is not a decision about your finance.',
    ],
  },
  how: {
    heading: 'How it works',
    steps: [
      'You tell us about the deal.',
      'If it is something he can help with, we pass your details to him.',
      'He calls you.',
    ],
  },
  notFor: {
    heading: 'This is not for you if',
    items: [
      'You have no deposit or cash to put in.',
      'You do not yet know how you would pay the loan back.',
      'You are researching and have not found a property.',
      'You expect 100% funding with nothing down.',
      'You want to borrow less than £25,000 — below what these lenders write.',
    ],
  },
  risk: {
    heading: 'What bridging is, and the risk',
    items: [
      'Bridging is short-term borrowing, secured on property.',
      'It costs more than a mortgage.',
      'If your plan to repay it fails, you can face extra charges and lose the property.',
      'Most bridging for investment is not regulated by the FCA.',
    ],
  },

  /** Signed out: explain, then ask them to sign in. No form is rendered. */
  signedOut: {
    heading: 'Sign in to make an enquiry',
    body: 'One tap with Google. It keeps this for real enquiries, and means we never ask for your name or email.',
    cta: 'Sign in to continue',
  },

  form: {
    step1Heading: 'The deal',
    step2Heading: 'Paying it back',
    next: 'Continue',
    back: 'Back',
    submit: 'Send my enquiry',
    sending: 'Sending…',
    /** Every question earns its place: it changes whether he can help. */
    loan: { label: 'How much do you want to borrow (£)', hint: '' },
    deposit: {
      label: 'How much of your own money can you put in',
      options: [
        { value: 'under-10', label: 'Under 10%' },
        { value: '10-24', label: '10–24%' },
        { value: '25-plus', label: '25% or more' },
        { value: 'not-sure', label: 'Not sure' },
      ],
    },
    property: {
      label: 'The property',
      options: [
        { value: 'found', label: 'Found a specific one' },
        { value: 'auction', label: 'Bidding at auction' },
        { value: 'looking', label: 'Still looking' },
      ],
    },
    entity: {
      label: 'Buying personally or through a limited company',
      options: [
        { value: 'personal', label: 'Personally' },
        { value: 'ltd', label: 'Limited company or SPV' },
        { value: 'not-sure', label: 'Not sure yet' },
      ],
    },
    exit: {
      label: 'How will you pay the bridge back',
      options: [
        { value: 'refinance', label: 'Refinance onto a mortgage' },
        { value: 'sell', label: 'Sell the property' },
        { value: 'other', label: 'Other' },
      ],
    },
    story: {
      label: 'In your own words, what is the deal and how will you pay the loan back?',
      hint: 'A short paragraph. This is the part the broker reads first.',
      counter: (chars: number, min: number): string => `${chars} of ${min} characters`,
    },
    timing: {
      label: 'When do you need the money',
      options: [
        { value: '4-weeks', label: 'Within 4 weeks' },
        { value: '1-3-months', label: '1–3 months' },
        { value: 'researching', label: 'Just researching' },
      ],
    },
    credit: {
      label: 'Anything on your credit file a lender should know about',
      hint: 'It does not rule you out. He asks anyway, so ask him rather than worry.',
      options: [
        { value: 'none', label: 'Nothing I am aware of' },
        { value: 'some', label: 'Some past issues' },
        { value: 'discuss', label: 'Rather discuss on the call' },
      ],
    },
    phone: {
      label: 'Phone number',
      hint: 'The outcome of this is a phone call, so he needs a number to ring.',
    },
    consent: {
      /** The named broker is filled in from BROKER.name at render time. */
      label: (broker: string): string => `Share these answers and my contact details with ${broker}.`,
      /** Every recipient, named where the tick happens. */
      recipients: 'Your name and email also go to Kit, our email provider, so the notification and follow-up can be sent.',
      required: 'Tick the box so we can pass this on.',
    },
    errors: {
      loan: 'Enter how much you want to borrow.',
      deposit: 'Pick the closest band.',
      property: 'Pick where you are with the property.',
      entity: 'Pick how you would buy it.',
      exit: 'Pick how you would pay it back.',
      story: 'Tell us about the deal in a short paragraph.',
      timing: 'Pick when you need the money.',
      credit: 'Pick the closest answer.',
      phone: 'Enter a phone number he can call.',
      failed: 'That did not send. Try again in a moment.',
      human: 'The human check did not pass. Reload the page and try again.',
    },
  },

  /** After submission. Neither outcome is a decision about anyone's finance,
   * and neither claims more than the system actually did. */
  result: {
    qualified: {
      heading: 'On its way to the broker',
      body: [
        'We have your enquiry and it is queued for him now.',
        'He decides what he can help with, and he calls you. This is an introduction, not a decision about your finance.',
      ],
    },
    notYet: {
      heading: 'Not yet — here is what to firm up',
      body: [
        'We have not passed this on. An email is on its way with the detail.',
        'Firm this up and send it again — nothing is held against you.',
      ],
    },
    /** ONE honest line per stored reason, so nobody is told the wrong thing.
     * Keys match the reasons in lib/bridging.ts. */
    reasons: {
      'loan-below-minimum': 'Bridging lenders rarely go below £25,000.',
      'deposit-below-minimum': 'You need at least 10% of your own money in the deal.',
      'no-property-yet': 'Come back when you have a specific property.',
      'no-repayment-route': 'Pick how you would pay the loan back.',
      'just-researching': 'Come back when you have a deadline to work to.',
      'story-too-short': 'Tell him about the deal in a few more sentences.',
      'story-too-few-words': 'Tell him about the deal in a few more sentences.',
      'story-repetitive': 'Write it in your own words — he reads this first.',
      'story-no-repayment-route': 'Say in the text exactly how you repay the loan.',
    } as Record<string, string>,
  },

  /**
   * The "not yet" email, for Kit to send. Helpful, never a rejection, and
   * never financial advice. Edit freely — the app never sends it.
   */
  notYetEmail: {
    subject: 'Your bridging enquiry — what to firm up first',
    body: [
      'Thanks for the enquiry. I have not passed it on yet, and here is the honest reason.',
      'Bridging works when two things are clear: the money you are putting in, and exactly how you repay.',
      'One of those is not nailed down yet, and a good broker asks about it first.',
      'Run the deal through the analyser to pressure-test the numbers.',
      'Check area data for a realistic exit value.',
      'There are walkthroughs on the YouTube channel too.',
      'When it is clear, come back and send it again.',
    ],
  },

  /** Said once, near the form, so nobody can mistake what this is. */
  disclaimer: (site: string): string =>
    `${site} is not a broker and gives no financial advice. We make an introduction; the broker decides what he can help with.`,
} as const;
