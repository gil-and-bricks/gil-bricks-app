/**
 * The credit page (T3) — the ONE paid partnership on this site, and every word
 * around it.
 *
 * THE RULE THIS PAGE LIVES BY: the insight comes first, the product is the
 * answer to it, and the disclosure sits ABOVE the link in the operator's own
 * words — never in small print at the bottom. The ASA requires an affiliate
 * link to be identifiable as advertising ON THE PAGE, so the page carries a
 * plain "AD" marker where it cannot be missed.
 *
 * Until `affiliateUrl` is filled in the page still teaches the insight and says
 * the link is coming. It NEVER renders a dead button.
 */
export const CREDIT = {
  /** OPERATOR: paste the approved CheckMyFile affiliate URL here. Empty = the
   *  page explains the insight and says the link is not live yet. */
  affiliateUrl: '',
  /** The partner, named plainly wherever it is mentioned. */
  partner: 'CheckMyFile',

  /** The marker the ASA asks for: unmissable, above the fold, next to the offer. */
  adLabel: 'AD',
  adLabelFull: 'Advertisement — paid partnership',

  title: 'Your credit score is probably not what you think',
  intro: 'Different lenders check different credit agencies. Most people only ever see one of them.',

  /** The insight, in the operator's voice. The product is the answer, not the subject. */
  insight: {
    heading: 'Why one score is not the whole picture',
    body: [
      'There are four main credit agencies in the UK. A lender picks the one it uses; you do not.',
      'They hold different data. An account, a default or an address can sit on one and not the others.',
      'So a good score on the agency you happen to check says nothing about the one your lender reads.',
    ],
    /** The operator's own experience — the reason this page exists at all. */
    storyHeading: 'What happened to me',
    story: [
      'Mine looked excellent on one agency and noticeably worse across the full multi-agency view.',
      'Only seeing all of it showed me what was actually holding me back, so I could fix it.',
    ],
  },

  /** Why it matters before a mortgage or a bridge — the reason this is on a property site. */
  whyHere: {
    heading: 'Why this comes before the finance',
    body: [
      'Credit is the first hurdle for most people buying or refinancing.',
      'A broker can only work with the file a lender pulls, so it pays to see all of it first.',
    ],
  },

  /** DISCLOSURE — above the link, in the operator's own words, never small print. */
  disclosure: {
    heading: 'Before you click, three things',
    lines: [
      'This is the only paid partnership on this site.',
      'If you sign up through my link I get a small amount, at no extra cost to you.',
      'I use it myself and I would tell you about it either way.',
    ],
  },

  /** The link itself. */
  cta: {
    label: 'See your multi-agency report',
    /** Said beside the button, so nobody has to guess where it goes. */
    note: 'The link goes to CheckMyFile and is an affiliate link.',
  },

  /** Shown INSTEAD of the button while affiliateUrl is empty. Honest, not a teaser. */
  notLive: {
    heading: 'The link is not live yet',
    body: 'The partnership is being set up. The insight above stands either way.',
  },

  /** The video slot: click to load, below the fold, never autoplay. */
  video: {
    /** OPERATOR: paste the YouTube URL when recorded. Empty = the honest placeholder. */
    url: '',
    heading: 'The two-minute version',
    /** Said while there is no video — plainly a placeholder, not a tease. */
    placeholder: 'A short video walking through my own report is coming here.',
    /** The click-to-load button, so nothing third-party loads unasked. */
    load: 'Play the video',
    /** Said under the button: why it is not already embedded. */
    note: 'It loads from YouTube only when you press play.',
  },

  /** What this page is not. */
  limits: [
    'This is not credit advice, and not a promise about any lender.',
    'Checking your own report does not affect your score.',
  ],
} as const;

/** True only when there is a real link to send someone to. */
export function creditLinkReady(): boolean {
  return CREDIT.affiliateUrl.trim().startsWith('http');
}

/** True only when there is a real video to load. */
export function creditVideoReady(): boolean {
  return CREDIT.video.url.trim().startsWith('http');
}
