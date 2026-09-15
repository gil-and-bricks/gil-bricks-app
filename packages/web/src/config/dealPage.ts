/**
 * X2 — every word on the deal's own page.
 *
 * In config, never in the component: the charter's rule is that a new component
 * starts at ZERO inline strings, and the inline-copy ratchet enforces it.
 *
 * N5 applies here as everywhere: nothing over two sentences, nothing over about
 * thirty words, and no investor jargon.
 */
export const DEAL_PAGE_COPY = {
  title: 'This deal',
  loading: 'Loading this deal…',
  signedOut: 'Sign in to see this deal.',
  signIn: 'Go to your account',
  failed: 'We could not load this deal. Try again in a moment.',
  notFound: 'We could not find that deal.',
  backToBoard: 'Back to your pipeline',
  openAnalyser: 'Open in the analyser',
  /** The heading over what the extension read from the listing. */
  fromTheListing: 'From the listing',
} as const;
