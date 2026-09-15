/**
 * S1 — WHO MAY CRAWL THIS SITE, AND WHY. One file, in the repo, under test.
 *
 * WHY THIS EXISTS AT ALL. Until now the live robots.txt was Cloudflare's
 * MANAGED block prepended to our own route's output. The training-crawler
 * blocks the product relies on came from a dashboard toggle — not from the
 * repository, not covered by any test, and invisible in a diff. A setting like
 * that can be changed by anyone with console access, or by Cloudflare altering
 * its own default, and nothing here would fail. That is precisely the kind of
 * thing that breaks quietly and is noticed a month later.
 *
 * THE DISTINCTION THIS FILE TURNS ON, because it is not obvious and getting it
 * backwards is expensive in opposite directions:
 *
 *   A TRAINING crawler takes the content to train a model. It returns nothing:
 *   no visit, no citation, no attribution. Blocked.
 *
 *   A SEARCH-AND-ANSWER crawler fetches a page in real time in order to CITE it
 *   in an answer somebody is reading now. Being the thing an assistant quotes
 *   when a person asks how to analyse a UK property deal is distribution this
 *   product actively wants. Allowed, and named rather than left to fall through
 *   a wildcard — an implicit allow is one careless edit from becoming an
 *   implicit deny, and nobody would notice.
 *
 * Some operators are BOTH, with separate agents for each job, and those are the
 * ones the distinction matters for: Google crawls with Googlebot and trains with
 * Google-Extended; OpenAI crawls with OAI-SearchBot and trains with GPTBot;
 * Anthropic crawls with Claude-SearchBot and trains with ClaudeBot. Blocking the
 * wrong half of a pair either forfeits the citation or hands over the training.
 */

export interface Crawler {
  /** The exact User-agent token, as the operator documents it. */
  readonly agent: string;
  /** Why this one is on this list. Printed nowhere; read by whoever changes it. */
  readonly why: string;
}

/**
 * ALLOWED, AND NAMED. Every one of these fetches a page in order to send a
 * reader to it or quote it with attribution.
 *
 * `robots.test.ts` fails if any of the five is ever disallowed, and the test is
 * proved to bite by disallowing each in turn.
 */
export const SEARCH_CRAWLERS: readonly Crawler[] = [
  { agent: 'Googlebot', why: 'classic search, and the crawl behind AI Overviews. Blocking it is the most expensive mistake available here.' },
  { agent: 'Bingbot', why: 'Bing’s index, which is what ChatGPT browses. Invisible to Bing is invisible to a large share of AI answers.' },
  { agent: 'OAI-SearchBot', why: 'OpenAI’s SEARCH crawler — fetches to cite in ChatGPT. Not GPTBot, which trains and is blocked below.' },
  { agent: 'PerplexityBot', why: 'Perplexity indexes to cite with a link back.' },
  { agent: 'Claude-SearchBot', why: 'Anthropic’s SEARCH crawler — fetches to cite. Not ClaudeBot, which trains and is blocked below.' },
];

/**
 * BLOCKED. These take content to train models and return nothing.
 *
 * MOVED HERE FROM CLOUDFLARE'S MANAGED BLOCK so the policy lives in the repo,
 * fails a test if it changes, and shows up in a diff. The managed block is being
 * switched off in the dashboard in the same change; if it were left on, the file
 * would carry two `User-agent: *` groups, which the spec does not define a
 * merge for and different parsers resolve differently.
 */
export const TRAINING_CRAWLERS: readonly Crawler[] = [
  { agent: 'GPTBot', why: 'OpenAI model training.' },
  { agent: 'ClaudeBot', why: 'Anthropic model training.' },
  { agent: 'CCBot', why: 'Common Crawl — the corpus a great many models are trained from.' },
  { agent: 'Google-Extended', why: 'Gemini training. Does NOT affect Googlebot or search ranking; Google documents them as separate.' },
  { agent: 'Applebot-Extended', why: 'Apple model training. Applebot itself (search) is not blocked.' },
  { agent: 'Amazonbot', why: 'Amazon model training.' },
  { agent: 'Bytespider', why: 'ByteDance training, and a heavy crawler.' },
  { agent: 'meta-externalagent', why: 'Meta model training.' },
];

/**
 * THE CONTENT SIGNAL, kept from Cloudflare's block because it states our policy
 * exactly and losing it would be a regression in signal: search yes, training
 * no, reference use. It is a declaration of rights reservation, not an access
 * control — the Disallow lines above are what actually refuses anybody.
 */
export const CONTENT_SIGNAL = 'search=yes,ai-train=no,use=reference';
