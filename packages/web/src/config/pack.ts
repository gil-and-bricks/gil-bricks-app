/**
 * DP1 — EVERY WORD THE INVESTOR DEAL PACK SAYS, and the rules it enforces.
 *
 * This document leaves the building. A sourcer sends it to an investor to
 * influence where money goes, and our name is at the foot of it. So the copy
 * here is not decoration — the disclaimer, the basis lines and the compliance
 * block are the parts that keep the sender inside the law, and they are the
 * parts the user cannot switch off.
 *
 * Change a word here and every pack changes. Nothing in the pack components is
 * a string literal.
 */
import type { BannedPhrase, PackFigureCopy } from '@gil-bricks/core';

/** The version of the declaration wording. Stored with every agreement, so
 *  "they agreed" always means "agreed to THIS". Bump it when the words change. */
export const DECLARATION_VERSION = '2026-09-14';

/**
 * WORDS THAT CANNOT APPEAR IN A PACK.
 *
 * Refused in any free text the user writes, with the reason — never stripped
 * silently, because a silent strip teaches nothing and leaves them believing
 * they said it.
 */
export const BANNED_PHRASES: readonly BannedPhrase[] = [
  { phrase: 'guaranteed', why: 'Nothing about a property deal is guaranteed. Say what the figure is based on instead.' },
  { phrase: 'guarantee', why: 'Nothing about a property deal is guaranteed. Say what the figure is based on instead.' },
  { phrase: 'guarantees', why: 'Nothing about a property deal is guaranteed. Say what the figure is based on instead.' },
  { phrase: 'risk-free', why: 'Property is not risk-free. Naming the risks is what makes an investor trust you.' },
  { phrase: 'risk free', why: 'Property is not risk-free. Naming the risks is what makes an investor trust you.' },
  { phrase: 'no risk', why: 'Property is not risk-free. Naming the risks is what makes an investor trust you.' },
  { phrase: 'assured return', why: 'An assured return is a regulated promise. Call it an estimate and show the basis.' },
  { phrase: 'assured returns', why: 'An assured return is a regulated promise. Call it an estimate and show the basis.' },
];

/** What the user is told when a phrase is refused. */
export const BANNED_COPY = {
  heading: 'Change this before it goes out',
  intro: 'These words promise something property cannot. Each one is listed with why.',
  found: (phrase: string): string => `You wrote “${phrase}”.`,
  inContext: 'Where you wrote it:',
  cannotContinue: 'Fix these and the pack will build.',
} as const;

/**
 * DP2 — THE SECTIONS, and which of them the user may move.
 *
 * The cover is pinned first and the basis page pinned last: a pack that opens
 * on its disclaimer, or ends on a photograph, is not a pack. Everything between
 * them is theirs to reorder and to switch off. The three locked sections cannot
 * be switched off at all, and each says why beside its own pinned row.
 */
export const SECTION = {
  cover: 'cover',
  photos: 'photos',
  returns: 'returns',
  summary: 'summary',
  purchase: 'purchase',
  plan: 'plan',
  scope: 'scope',
  duration: 'duration',
  floorplan: 'floorplan',
  area: 'area',
  comps: 'comps',
  figures: 'figures',
  gallery: 'gallery',
  basis: 'basis',
  compliance: 'compliance',
  disclaimer: 'disclaimer',
} as const;

export interface PackSection {
  key: string;
  label: string;
  /** Shown beside a locked row, saying why it cannot come off. */
  lockedWhy?: string;
  /** Pinned rows keep their place in the reading order. */
  pinned?: 'first' | 'last';
}

/**
 * The rail, top to bottom. `movable` rows are the ones the user drags.
 */
export const PACK_SECTIONS: readonly PackSection[] = [
  { key: SECTION.cover, label: 'Cover', pinned: 'first' },
  { key: SECTION.returns, label: 'The headline return' },
  { key: SECTION.purchase, label: 'What it costs to get in' },
  { key: SECTION.plan, label: 'The work and how long it takes' },
  { key: SECTION.area, label: 'The area' },
  { key: SECTION.comps, label: 'What sells nearby' },
  { key: SECTION.figures, label: 'The final figures' },
  { key: SECTION.gallery, label: 'Your photographs' },
  { key: SECTION.basis, label: 'Where every figure came from', pinned: 'last', lockedWhy: 'Every number in this pack has to say where it came from.' },
  { key: SECTION.compliance, label: 'Your registration details', pinned: 'last', lockedWhy: 'An investor has to be able to check who they are dealing with.' },
  { key: SECTION.disclaimer, label: 'The disclaimer', pinned: 'last', lockedWhy: 'This document is information, not advice. That has to be said.' },
];

/** The pages the user can reorder, in their default order. */
export const MOVABLE_SECTIONS: readonly string[] = [
  SECTION.returns, SECTION.purchase, SECTION.plan, SECTION.area, SECTION.comps, SECTION.figures,
  SECTION.gallery,
];

/** Sub-parts, switched on from the branding panel rather than the rail. */
export const PACK_PARTS: readonly PackSection[] = [
  { key: SECTION.photos, label: 'Photograph on the cover' },
  { key: SECTION.summary, label: 'Your summary of the deal' },
  { key: SECTION.scope, label: 'The refurb breakdown' },
  { key: SECTION.duration, label: 'How long the work takes' },
  { key: SECTION.floorplan, label: 'Your floor plan' },
];

/** The disclaimer, on EVERY page. Short enough to sit in a footer. */
export const PACK_DISCLAIMER = 'Information only — not financial, investment, tax or legal advice. '
  + 'All figures are estimates. Do your own due diligence.';

/** The long form, on the basis page. */
export const PACK_DISCLAIMER_FULL = [
  'This document is information only. It is not financial, investment, tax or legal advice, '
  + 'and it is not an offer or an invitation to invest.',
  'Every forward-looking figure in it is an estimate. Estimates are not promises, and property '
  + 'values and rents can fall as well as rise.',
  'You should take your own professional advice and carry out your own due diligence before '
  + 'committing any money.',
] as const;

export const PACK_COPY = {
  /** The one line at the foot of every pack. Ours, and it stays. */
  madeWith: 'Made with PropLaunch',
  pageOf: (n: number, total: number): string => `${n} of ${total}`,

  cover: {
    eyebrow: 'Investment opportunity',
    forInvestor: 'Prepared for',
    preparedBy: 'Prepared by',
    preparedOn: 'Prepared',
    noPhotos: 'No photographs added.',
  },

  /** The page built around one enormous number. */
  returns: {
    eyebrow: 'The headline',
    heading: 'What this deal returns',
  },

  growth: {
    alt: (years: string): string => `Price index over the last ${years} years`,
    now: 'now',
    start: (years: string): string => `${years} years ago`,
    head: (rate: string, area: string): string => `${area} prices have moved ${rate} a year over ten years`,
    note: 'The shaded band is what the same rates would give, repeated. It is an assumption about the area, not a forecast for this property.',
    source: (name: string, asOf: string): string => `${name}, ${asOf}.`,
  },

  comps: {
    eyebrow: 'The evidence',
    heading: 'What sells nearby',
    head: (n: string): string => `${n} homes sold nearby, for comparison`,
    mapAlt: 'Map of the property and nearby sold homes',
    odbl: 'Contains information from OpenStreetMap, made available under the Open Database License (ODbL).',
    subject: 'This one',
  },

  glance: {
    heading: 'At a glance',
    /** The one or two numbers that matter for this strategy. */
    strategyNames: { btl: 'Buy to let', flip: 'Flip', brrrr: 'Buy, refurbish, rent, refinance', hmo: 'HMO' } as Record<string, string>,
  },

  numbers: {
    eyebrow: 'The money in',
    heading: 'What it costs to get in',
    chartHead: (total: string): string => `Everything adds up to ${total} of cash going in`,
    chartNote: 'Each bar stacks on the one before it. The last bar is the total.',
    chartHeadFinanced: (total: string): string => `${total} of your own cash goes in`,
    chartNoteFinanced: 'These do not add up to the total: the purchase is part financed, so only some of the price is your cash. Each bar is measured from zero.',
    /** The sub-heading over the return figures. Every figure's own label is in
     *  PACK_FIGURES, beside the basis that explains it. */
    returnsHeading: 'Return and yield',
    refurbDuration: 'How long the work takes',
  },

  property: {
    eyebrow: 'The plan',
    heading: 'The work, and how long it takes',
    scopeHead: (n: string): string => `${n} items of work, largest first`,
    runwayHead: (total: string): string => `The money is tied up for ${total}, not just while the builder is there`,
    runwayNote: 'The solid bar is the quicker case, the lighter bar the slower one.',
    planHead: (total: string): string => `${total} across the floors we measured`,
    scopeHeading: 'What is being done',
    noScope: 'No refurb scope ticked.',
    floorPlanHeading: 'Floor plan',
    floorPlanMine: 'Drawn by us from the property’s dimensions.',
    floorPlanTotal: (total: string): string => `${total} in total.`,
    sqm: (n: string): string => `${n} m²`,
    noFloorPlan: 'No floor plan drawn.',
  },

  area: {
    ukhpi: 'UK House Price Index, HM Land Registry',
    eyebrow: 'The place',
    heading: 'The area, and what sells here',
    intro: 'Public data about this postcode sector. Each line says where it came from.',
    source: (name: string, asOf: string): string => `${name}, ${asOf}.`,
    none: 'No area data available for this postcode.',
  },

  /**
   * DP3 — THE FINAL FIGURES. The plainest page in the pack, on purpose.
   *
   * Two columns and nothing else: what the investor puts in, and what they get
   * back. Every other money page in this document explains, evidences or
   * charts. This one states. It is the page somebody turns back to after they
   * have read the rest, and the only thing it owes them is legibility.
   */
  figures: {
    eyebrow: 'In and out',
    heading: 'The final figures',
    inHead: 'What goes in',
    outHead: 'What comes back',
    note: 'Before tax. Estimates are marked.',
    /**
     * WHY THE COLUMN DOES NOT ADD UP, said on the page rather than left to be
     * noticed. On a financed deal the cash going in is far less than the
     * purchase price, so a column of costs above a total looks like an
     * arithmetic mistake. It is the same fact the waterfall states, in the same
     * words, because it is the same fact.
     */
    financed: 'Part financed, so the cash going in is less than these add up to.',
  },

  basis: {
    eyebrow: 'Basis and terms',
    heading: 'Where these figures came from',
    intro: 'Every number in this pack, and what it rests on.',
    estimateTag: 'Estimate',
    factTag: 'From your figures',
    compliance: {
      heading: 'Who prepared this',
      businessName: 'Business',
      redress: 'Redress scheme',
      redressNumber: 'Membership number',
      hmrc: 'HMRC anti-money-laundering supervision',
      ico: 'ICO registration',
      pi: 'Professional indemnity insurance',
      /** A blank is a lie by omission, so the gap is printed. */
      missing: 'Registration details not provided',
    },
    disclaimerHeading: 'Terms',
  },

  /**
   * DP2 — THE COMPOSER. One screen: the rail, the document, the panel.
   */
  composer: {
    heading: 'Your deal pack',
    sections: 'Pages',
    parts: 'What goes on them',
    brand: 'Your branding',
    moveUp: (name: string): string => `Move ${name} up`,
    moveDown: (name: string): string => `Move ${name} down`,
    include: (name: string): string => `Include ${name}`,
    pinnedFirst: 'Always first',
    pinnedLast: 'Always last',
    share: 'Share',
    save: 'Save a copy',
    print: 'Print',
    accentWarning: 'Too pale to read on paper.',
    photos: 'Your photographs',
    photosHint: 'Yours only, not the agent’s. They stay on this device.',
    photosAdd: 'Add photographs',
    photosClear: 'Remove all',
    photosCount: (n: number): string => `${n} added`,
    duotone: 'Tint them in my colour',
    investor: 'Who is it for? (optional)',
    summary: 'Your summary of the deal (optional)',
    logo: 'Logo',
    logoPick: 'Choose a logo',
    logoRemove: 'Remove',
    /** The share sheet's own title, and the stem of the saved filename. */
    shareTitle: 'Deal pack',
    fileSuffix: 'deal-pack',
    savedNote: 'Saved to your downloads.',
    accent: 'Accent colour',
    custom: 'Custom',
    saving: 'Saving…',
    saved: 'Saved',
  },

  /** The builder screen. */
  build: {
    heading: 'Make an investor deal pack',
    intro: 'Choose what goes in. Some parts cannot come out — each says why.',
    lockedBadge: 'Always included',
    lockedAria: 'This section is always included and cannot be removed',
    investorName: 'Who is it for? (optional)',
    summaryLabel: 'Your summary of the deal (optional)',
    summaryHint: 'A few sentences in your own words. It is checked before the pack builds.',
    photosLabel: 'Your photographs',
    photosHint: 'Only upload photographs you have the right to use. Not the agent’s listing '
      + 'photos unless they have said you may.',
    photosNote: 'Your photographs stay on this device — they go into the printed pack and are not stored by us.',
    photosAdd: 'Add photographs',
    photosClear: 'Remove all',
    photosCount: (n: number): string => `${n} photograph${n === 1 ? '' : 's'} added`,
    make: 'Make the pack',
    print: 'Print or save as PDF',
    share: 'Share',
    back: 'Back to the pack settings',
    noPortalImages: 'The listing’s own photographs are not put into this document. They belong to the agent.',
  },

  /** The profile screen. Everything they may change, and nothing else. */
  profile: {
    heading: 'Your pack branding',
    intro: 'Set this once. It goes on every pack you make.',
    businessName: 'Business name',
    accent: 'Accent colour',
    accentHint: 'One colour. The pack uses it for headings and rules.',
    logo: 'Logo',
    logoHint: 'PNG or JPG, up to 64KB.',
    logoRemove: 'Remove logo',
    save: 'Save',
    saved: 'Saved',
    whyNoMore: 'Fonts, sizes and layout are fixed so every pack stays readable.',
    open: 'Your pack branding',
  },

  /** Nothing here blames the user, and nothing pretends it worked. */
  errors: {
    saveFailed: 'That did not save. Try again.',
    logoFailed: 'That file could not be read.',
    logoTooBig: 'That logo is too large. PNG or JPG up to 64KB.',
    noDeal: 'Open a pack from a deal on your board.',
    dealGone: 'That deal is not on your board.',
    noFigures: 'This deal has no figures yet. Open it in the analyser first.',
    loadFailed: 'Your deals could not be loaded. Try again.',
  },

} as const;

/**
 * EVERY FIGURE A PACK CAN PRINT: its label and the line that says where it came
 * from. The two are one entry because they must never be edited apart.
 *
 * `packNumbers()` in @gil-bricks/core decides WHICH of these a given strategy
 * carries and in what order. This decides what each one SAYS.
 */
export const PACK_FIGURES: PackFigureCopy = {
  price: { label: 'Purchase price', basis: 'The asking price you entered.' },
  stampDuty: { label: 'Stamp duty', basis: 'Calculated from the purchase price using the current bands.' },
  stampDutyWales: { label: 'Land Transaction Tax', basis: 'Calculated from the purchase price using the current Welsh bands.' },
  refurb: { label: 'Refurb cost', basis: 'Your refurb figure, from the scope ticked in the analyser.' },
  legals: { label: 'Legal and buying costs', basis: 'Your figure for legal and buying costs.' },
  additional: { label: 'Additional costs', basis: 'Your figure for additional costs.' },
  totalIn: { label: 'Total going in', basis: 'Purchase price, tax, refurb and costs added together.' },
  roi: { label: 'Return on cash', basis: 'Annual return divided by the cash going in, from the figures in this pack. Before tax.' },
  roce: { label: 'Return on capital employed', basis: 'Profit divided by the capital employed, from the figures in this pack. Before tax.' },
  grossYield: { label: 'Rental yield', basis: 'Annual rent divided by the purchase price.' },
  monthlyRent: { label: 'Monthly rent', basis: 'Your monthly rent figure.' },
  // THE WORD "VALUATION" IS NOT USED, EVEN TO DENY IT. `figure()` refuses any
  // basis carrying it, and rightly: a valuation is a regulated act by a
  // qualified valuer, and this is the sourcer's own figure for what the
  // property is worth after the work.
  endValue: { label: 'Estimated end value', basis: 'Your own figure for what it is worth once the work is done. An estimate.' },
};

/**
 * THE AREA HIGHLIGHTS. Each line names its dataset and its date — a fact about
 * a place, never a claim about a deal.
 */
/**
 * A CURATED PALETTE, and a free hex beside it.
 *
 * Every one of these reads as text on the pack's paper (checked by
 * accent.test.ts), prints without turning to mud, and looks like a brand rather
 * than a highlighter. The custom field is still there for somebody whose brand
 * colour is their brand colour — it just warns when the choice cannot be read.
 */
export const ACCENT_PALETTE: readonly { hex: string; name: string }[] = [
  { hex: '#1f3a8a', name: 'Ink blue' },
  { hex: '#0b5c3f', name: 'Forest' },
  { hex: '#8a1f4b', name: 'Claret' },
  { hex: '#7a2d12', name: 'Rust' },
  { hex: '#3f3a6e', name: 'Indigo' },
  { hex: '#334155', name: 'Slate' },
];

export const PACK_AREA = {
  typicalPrice: 'Typical sold price in this postcode sector',
  soldCount: 'Homes sold here in the last year',
  soldCountValue: (n: number): string => `${n}`,
  growth: (area: string): string => `${area}, average over ten years`,
  growthValue: (rate: string): string => `${rate} a year`,
  affordability: 'Price against local earnings',
  affordabilityValue: (ratio: string): string => `${ratio}×`,
  sources: {
    landRegistry: 'HM Land Registry Price Paid Data',
    ukhpi: 'UK House Price Index, HM Land Registry',
    ons: 'ONS residence-based affordability ratio',
  },
} as const;

/**
 * THE DECLARATION. Completed once, before any pack can be made.
 *
 * WRITTEN IN THE OPERATOR'S VOICE AND NOT PRETENDING TO BE LEGAL ADVICE. It
 * states plainly what the law treats sourcing as, and asks them to confirm the
 * registrations that go with it. It does not tell them whether they comply —
 * that is between them and their regulator.
 */
export const DECLARATION = {
  heading: 'Before you make a deal pack',
  intro: 'A deal pack goes to somebody deciding where to put money. Confirm what sourcing is, '
    + 'and give the registrations that go on every pack.',

  /** The thing they must understand. Plain, and not dressed as advice. */
  understanding: [
    'In the UK, sourcing property for someone else is estate agency work. That brings duties with '
    + 'it, whoever you are and however small the operation.',
    'That normally means: registration with HMRC for anti-money-laundering supervision, membership '
    + 'of a government-approved redress scheme, registration with the ICO for handling personal '
    + 'data, and professional indemnity insurance.',
    'This is not legal advice and I am not your adviser. If you are unsure whether any of it '
    + 'applies to you, ask someone qualified before you send a pack to anybody.',
  ] as const,

  confirmLabel: 'I understand sourcing property for someone else is estate agency work in the UK, '
    + 'and the details below are mine and are current.',

  fields: {
    businessName: { label: 'Business name', hint: 'As it appears on your registrations.' },
    hmrcAml: { label: 'HMRC anti-money-laundering supervision number', hint: '' },
    redressScheme: { label: 'Redress scheme', hint: 'The scheme you belong to.' },
    redressNumber: { label: 'Membership number', hint: '' },
    ico: { label: 'ICO registration number', hint: '' },
    piInsurer: { label: 'Professional indemnity insurer', hint: '' },
    piExpiry: { label: 'Cover runs to', hint: '' },
  },

  /** A blank is printed, never hidden. */
  blanksWarning: 'Anything you leave blank prints as “Registration details not provided”. '
    + 'A gap an investor can see is safer than one they cannot.',

  submit: 'Confirm and continue',
  mustConfirm: 'Tick the box to continue.',
  done: 'Declaration saved.',
  /** Shown where the pack button would be, when there is no declaration yet. */
  required: 'Complete the one-off declaration before making a pack.',
  requiredCta: 'Start the declaration',
} as const;
