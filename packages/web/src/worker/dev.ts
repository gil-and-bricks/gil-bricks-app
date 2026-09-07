/**
 * DEV-ONLY routes — local sign-in and a realistic seed set for judging board design
 * without staring at an empty board. INERT IN PRODUCTION BY CONSTRUCTION: every route
 * requires BOTH
 *   1. env.DEV_LOGIN === 'on' — set ONLY in .dev.vars (gitignored, never uploaded by
 *      `wrangler deploy`); undefined in the deployed Worker.
 *   2. a localhost / 127.0.0.1 request host — the deployed Worker is only ever reached
 *      on its workers.dev / custom domain.
 * If either fails the route answers a bare 404, exactly as if it did not exist, so it
 * can never sign anyone in or seed data on the deployed site.
 */
import type { Env } from './index';
import { SESSION_DAYS, signSession } from './lib/jwt';
import { sessionCookie } from './lib/cookies';
import { clearDemoDeals, seedDemoDeals } from './lib/pipeline';
import { detailsPage, gonePage, revealPage, type FactFindRow } from './lib/factfind';
import { brokerReady, factFindReady } from '../config/bridging';
import { creditLinkReady } from '../config/credit';
import { captureReady } from '../config/capture';

const DEMO = { sub: 'demo-user', email: 'demo@local.test', name: 'Demo', avatar: '' } as const;

/** Both gates must pass. Returns false in production (no DEV_LOGIN, non-localhost). */
export function isDevEnv(env: Env, request: Request): boolean {
  const host = new URL(request.url).hostname;
  return env.DEV_LOGIN === 'on' && (host === 'localhost' || host === '127.0.0.1');
}

/**
 * The same gate as isDevEnv, plus one thing the five-surface preview needs and
 * the seed does not: to be reachable from the operator's OWN PHONE on the same
 * wifi, because a surface has to be judged where it will be used. So a private
 * network address counts as well as localhost.
 *
 * DEV_LOGIN is still what makes it impossible in production. It exists only in
 * .dev.vars, which `wrangler deploy` never uploads, so the deployed Worker has
 * no such value and answers the same bare 404 as a route that does not exist.
 * A public hostname is refused twice over: it is neither localhost nor private.
 */
export function isPreviewEnv(env: Env, request: Request): boolean {
  if (env.DEV_LOGIN !== 'on') return false;
  return isLocalHost(new URL(request.url).hostname);
}

/** localhost, a real private-range IPv4, or a .local name — and nothing else. */
export function isLocalHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') return true;
  if (host === 'local' || host.endsWith('.local')) return true;
  // A private ADDRESS, not a name that merely starts with one. "10.example.com"
  // is a registrable domain somebody else can own, and it used to pass here.
  const octets = host.split('.');
  if (octets.length !== 4 || !octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) return false;
  const [a, b] = octets.map(Number);
  return a === 10
    || (a === 192 && b === 168)
    || (a === 172 && b >= 16 && b <= 31)
    || a === 127;
}

const notFound = (): Response => new Response('Not Found', { status: 404 });
const seeSee = (to: string, cookie?: string): Response =>
  new Response(null, { status: 302, headers: cookie ? { Location: to, 'Set-Cookie': cookie } : { Location: to } });

async function ensureDemoUser(env: Env): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, email, name, avatar_url, created_at, marketing_consent) VALUES (?, ?, ?, '', ?, 0)",
  ).bind(DEMO.sub, DEMO.email, DEMO.name, new Date().toISOString()).run();
}

/** GET /auth/dev-login — sign in as the demo account and land on the board. */
export async function handleDevLogin(request: Request, env: Env): Promise<Response> {
  if (!isDevEnv(env, request)) return notFound();
  await ensureDemoUser(env);
  const jwt = await signSession(DEMO, env.JWT_SECRET);
  return seeSee('/deals', sessionCookie(jwt, SESSION_DAYS * 86400));
}

/** GET /dev/seed — load the realistic test set onto the demo account. */
export async function handleDevSeed(request: Request, env: Env): Promise<Response> {
  if (!isDevEnv(env, request)) return notFound();
  await ensureDemoUser(env);
  await seedDemoDeals(env.DB, DEMO.sub);
  return seeSee('/deals');
}

/** GET /dev/seed/clear — remove the seeded test set from the demo account. */
export async function handleDevSeedClear(request: Request, env: Env): Promise<Response> {
  if (!isDevEnv(env, request)) return notFound();
  await clearDemoDeals(env.DB, DEMO.sub);
  return seeSee('/deals');
}

/* -------------------------------------------------------------------------
 * THE FIVE SURFACES NOBODY HAS EVER SEEN (A1)
 *
 * Five things are built, gated on config the operator has not filled in, and
 * therefore have never rendered for anyone: the bridging enquiry form, the
 * broker fact-find, the broker's own link page, the credit page's affiliate
 * button, and the capture offer on the three tools (docs/AUDIT.md §4.2).
 *
 * This is the index that walks them. It is NOT a preview of fake pages — the
 * links go to the real pages. What makes them appear is
 * `npm run preview:surfaces`, which puts obviously-fake values into the config
 * that gates them and takes them out again when it stops. The two pages that
 * cannot be reached without a database row and a token — the broker's link page
 * before and after it is opened — are rendered here from the real renderer with
 * an invented row.
 *
 * Impossible in production: the gate above, plus config that only a local
 * script ever writes.
 * ---------------------------------------------------------------------- */

const PREVIEW_ROW: FactFindRow = {
  id: 'preview',
  email: 'alex@preview.invalid',
  phone: '07700 900123',
  applicant_name: 'Alex Morgan',
  buying_ltd: 'yes',
  company_name: 'Morgan Property Ltd',
  dob: '1985-04-12',
  address: '12 Example Street, Cardiff, CF10 1AA',
  owns_home: 'yes',
  mortgage_provider: 'A high-street lender',
  other_properties: '2',
  refurb_experience: 'two full refurbishments',
  good_credit: 'yes',
  credit_report: 'yes',
  savings: '45000',
  deposit_source: 'savings',
  gift_from: '',
  equity_property: 'yes',
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
} as FactFindRow;

/** GET /dev/preview — the index; ?show=broker-details|broker-link|broker-gone renders one. */
export function handleDevPreview(request: Request, env: Env): Response {
  if (!isPreviewEnv(env, request)) return notFound();
  const show = new URL(request.url).searchParams.get('show') ?? '';
  if (show === 'broker-details') return html(detailsPage(PREVIEW_ROW));
  if (show === 'broker-link') return html(revealPage('preview-token'));
  if (show === 'broker-gone') return html(gonePage());

  // Every gate, not just the broker's: the fact-find, the credit button and the
  // tool offer each have their own, and a page whose job is to say "these are
  // visible now" must not guess.
  const gates = [brokerReady(), factFindReady(), creditLinkReady(), captureReady('stamp-duty')];
  const ready = gates.every(Boolean);
  const rows = PREVIEW_SURFACES.map((s) => `
    <li>
      <h2>${escapeHtml(s.name)}</h2>
      <p><a href="${escapeHtml(s.href)}">${escapeHtml(s.href)}</a></p>
      <p class="look">${escapeHtml(s.look)}</p>
      ${s.laptop === true ? '<p class="look">Laptop only — see the note above.</p>' : ''}
    </li>`).join('');

  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Five surfaces — preview</title>
<style>
 body { margin:0; padding:24px; font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; background:#111; color:#f4f4f4; }
 main { max-width: 44rem; margin: 0 auto; }
 h1 { font-size: 1.3rem; margin: 0 0 4px; }
 h2 { font-size: 1rem; margin: 0 0 4px; }
 ol { list-style: decimal; padding-left: 1.2rem; }
 li { margin: 0 0 24px; }
 a { color: #9ecbff; overflow-wrap: anywhere; }
 p { margin: 0 0 6px; }
 .look, .note { opacity: .75; font-size: .9rem; }
 .warn { border: 1px solid #555; border-radius: 10px; padding: 12px 16px; margin: 0 0 24px; }
</style></head><body><main>
<h1>The five surfaces you have never seen</h1>
<p class="note">Local only. This page does not exist on the deployed site.</p>
<div class="warn">
  <p>${ready
    ? 'Fake broker and tool details are loaded, so all five render.'
    : 'The real config is loaded, so most of these still hide themselves. Stop this server and run <code>npm run preview:surfaces</code> instead.'}</p>
  <p class="note">Nothing here is real. The fake details go when the server stops.</p>
  <p class="note">Four of the five work on a phone. The fact-find needs the laptop, because signing in needs localhost.</p>
</div>
<ol>${rows}</ol>
</main></body></html>`);
}

const html = (body: string): Response =>
  new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    },
  });

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** What to open, and what to look at when you get there. */
const PREVIEW_SURFACES: readonly { name: string; href: string; look: string; laptop?: boolean }[] = [
  {
    name: 'The bridging enquiry form',
    href: '/bridging-finance',
    look: 'It is at the foot of the page. Check the phone field says why it needs a number.',
  },
  {
    name: 'The broker fact-find',
    href: '/bridging-finance',
    look: 'Sign in, then send an enquiry that qualifies. Three screens open underneath it.',
    laptop: true,
  },
  {
    name: "The broker's link page",
    href: '/dev/preview?show=broker-link',
    look: 'What he gets: a button, not the details. Then ?show=broker-details and ?show=broker-gone.',
  },
  {
    name: 'The credit page button',
    href: '/credit',
    look: 'At the foot of the page. Check it is marked as an ad and opens in a new tab.',
  },
  {
    name: 'The tool capture offer',
    href: '/tools/stamp-duty',
    look: 'Work out a figure. The offer appears under the answer, never in front of it.',
  },
];
