/**
 * S1 — THE STANDING SECURITY GATES.
 *
 * These are not a review, they are the review's teeth: each one fails the build
 * if a protection this product relies on is removed or quietly weakened.
 */
import { coreConfig } from '@gil-bricks/core';
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import worker, { type Env } from './index';
import { SECURITY_HEADERS } from './lib/securityHeaders';
import { consume, identityOf, sweepRateLimits } from './lib/rateLimit';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const git = (args: string[]): string =>
  execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/**
 * A Worker environment with nothing real behind it — module scope, because the
 * header gates and the HEAD gates both call the real fetch handler and there is
 * no reason for two copies of it to drift apart.
 */
const env = (): Env => ({
  ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) },
  DB: { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }) }) },
  JWT_SECRET: 'test-secret', GOOGLE_CLIENT_SECRET: 'x', TURNSTILE_SECRET: 'x', KIT_API_KEY: 'k',
}) as unknown as Env;

/**
 * SECRET SHAPES. Deliberately narrow: a pattern that fires on ordinary code is
 * a pattern somebody turns off. Each one is a credential format whose presence
 * in a committed file has no innocent explanation.
 */
const SECRET_PATTERNS: [string, RegExp][] = [
  ['Google OAuth client secret', /GOCSPX-[A-Za-z0-9_-]{10,}/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['Stripe secret key', /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ['signed JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

describe('no secret is committed, anywhere in history', () => {
  it('every tracked file is clean', () => {
    const files = git(['ls-files']).split('\n').filter(Boolean);
    const hits: string[] = [];
    for (const f of files) {
      const abs = join(REPO, f);
      if (!existsSync(abs) || statSync(abs).size > 2_000_000) continue;
      const body = readFileSync(abs, 'utf8');
      for (const [name, re] of SECRET_PATTERNS) if (re.test(body)) hits.push(`${f}: ${name}`);
    }
    expect(hits).toEqual([]);
  });

  it('and so is every commit ever made, on every branch', () => {
    // The whole history as one blob — this repo is small enough to read it all,
    // and a secret removed in a later commit is still a secret that leaked.
    const all = git(['log', '-p', '--all', '--no-color']);
    const hits: string[] = [];
    for (const [name, re] of SECRET_PATTERNS) if (re.test(all)) hits.push(name);
    expect(hits).toEqual([]);
  });

  it('no real secret-bearing file is tracked, and the ignore rules still cover them', () => {
    const tracked = git(['ls-files']).split('\n');
    for (const f of tracked) {
      expect(f, `${f} must never be tracked`).not.toMatch(/(^|\/)(\.env|\.dev\.vars)(\.|$)/);
    }
    const ignore = readFileSync(join(REPO, '.gitignore'), 'utf8');
    for (const rule of ['.dev.vars', '.env']) expect(ignore).toContain(rule);
  });

  it('the built client bundle carries no secret shape either', () => {
    const dist = join(REPO, 'packages/web/dist');
    if (!existsSync(dist)) return; // nothing built in this run
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const hits: string[] = [];
    for (const f of walk(dist)) {
      if (!/\.(js|mjs|html|json|css|txt)$/.test(f) || statSync(f).size > 8_000_000) continue;
      const body = readFileSync(f, 'utf8');
      for (const [name, re] of SECRET_PATTERNS) if (re.test(body)) hits.push(`${f.replace(dist, 'dist')}: ${name}`);
    }
    expect(hits).toEqual([]);
  });

  it('and no server-only env name is ever read from client code', () => {
    const src = join(REPO, 'packages/web/src');
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const SERVER_ONLY = ['JWT_SECRET', 'GOOGLE_CLIENT_SECRET', 'TURNSTILE_SECRET', 'KIT_API_KEY', 'EPC_BEARER_TOKEN', 'HEALTH_TOKEN'];
    const offenders: string[] = [];
    for (const f of walk(src)) {
      if (!/\.(ts|tsx|astro)$/.test(f) || /\.test\./.test(f)) continue;
      // Worker code is the server. Everything else ships to a browser.
      if (f.includes('/worker/')) continue;
      const body = readFileSync(f, 'utf8');
      for (const name of SERVER_ONLY) if (body.includes(name)) offenders.push(`${f.replace(src, 'src')}: ${name}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('every response carries the security headers', () => {
  const PATHS = ['/', '/api/me', '/api/health', '/broker/factfind', '/broker/enquiry', '/does-not-exist'];

  for (const p of PATHS) {
    it(`${p} carries all of them`, async () => {
      const res = await worker.fetch(new Request(`https://s.test${p}`), env());
      for (const h of Object.keys(SECURITY_HEADERS)) {
        expect(res.headers.get(h), `${p} is missing ${h}`).toBeTruthy();
      }
    });
  }

  it('the site cannot be framed — the clickjacking route to "Delete everything"', async () => {
    const res = await worker.fetch(new Request('https://s.test/'), env());
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('the analyser URL cannot leak to Rightmove or Zoopla in a Referer', async () => {
    const res = await worker.fetch(new Request('https://s.test/'), env());
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('the broker pages keep their OWN stricter values rather than being overwritten', async () => {
    const res = await worker.fetch(new Request('https://s.test/broker/enquiry'), env());
    // no-referrer is stricter than the site default, and must survive
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    // and they still pick up the site-wide ones
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  /**
   * "ONLY" HAS TO MEAN ONLY (M5).
   *
   * What stood here was four `toContain` calls. Every one of them still passed
   * with `https://evil.example` added to `connect-src`, because containing four
   * good origins says nothing about the fifth. The word "only" in the title was
   * unsupported by the assertion underneath it — the exact shape the M4 audit
   * was asked to find.
   *
   * So this compares the SET. Every host named anywhere in the policy is pulled
   * out and matched against the list below; a new origin fails until somebody
   * writes it down here, which is the point — adding a host the app talks to is
   * a decision, not a typo.
   */
  /**
   * PER DIRECTIVE, not one flat set. The first version of this pulled every
   * host in the policy into a single list and compared that — which caught a
   * new origin but said NOTHING about what it was allowed to do. Moving
   * media.rightmove.co.uk out of img-src and into script-src would have left
   * the set identical and the test green, while handing a portal the right to
   * run code on our pages. What each host may do is the whole point.
   */
  /** Read, not retyped: DM1 moved this host and four copies of it had to be found. */
  const DATA_ORIGIN = new URL(coreConfig.dataBaseUrl).origin;
  const TILES_ORIGIN = new URL(coreConfig.tilesBaseUrl).origin;
  /** Both hosts, deduplicated — they collapse to one entry if ever reunited. */
  const DATA_HOSTS = [...new Set([DATA_ORIGIN, TILES_ORIGIN])];

  const CSP_EXPECTED: Record<string, string[]> = {
    'default-src': [],
    'script-src': ['https://challenges.cloudflare.com'],
    'style-src': [],
    'img-src': [
      'https://*.googleusercontent.com',
      ...DATA_HOSTS,
      'https://media.rightmove.co.uk',
      'https://*.zoocdn.com',
    ],
    'font-src': [],
    'connect-src': [
      'https://data.police.uk',
      'https://environment.data.gov.uk',
      'https://www.planning.data.gov.uk',
      'https://landregistry.data.gov.uk',
      ...DATA_HOSTS,
      'https://challenges.cloudflare.com',
    ],
    'frame-src': [
      'https://challenges.cloudflare.com',
      'https://www.youtube-nocookie.com',
      'https://www.youtube.com',
    ],
    'worker-src': [],
    'frame-ancestors': [],
    'object-src': [],
    'base-uri': [],
    'form-action': [],
    'upgrade-insecure-requests': [],
  };

  /** Directive → the hosts it names. Keywords and bare schemes are not hosts. */
  const hostsByDirective = (csp: string): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const raw of csp.split(';')) {
      const parts = raw.trim().split(/\s+/).filter((x) => x !== '');
      if (parts.length === 0) continue;
      out[parts[0]] = parts.slice(1)
        .filter((t) => !t.startsWith("'") && t !== 'data:' && t !== 'blob:')
        .sort();
    }
    return out;
  };

  it('every directive names only the origins that directive needs — and no others', () => {
    const got = hostsByDirective(SECURITY_HEADERS['content-security-policy']);
    const want = Object.fromEntries(Object.entries(CSP_EXPECTED).map(([k, v]) => [k, [...v].sort()]));
    expect(got).toEqual(want);
  });

  it('and closes the four routes that need no script at all', () => {
    const csp = SECURITY_HEADERS['content-security-policy'];
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(csp, directive).toContain(directive);
    }
  });
});

/**
 * S1 — THE EPC ENDPOINT CANNOT BE USED AS A FREE PROXY.
 *
 * It is public by design: the analyser works signed-out and an EPC lookup is
 * part of that. But every cache MISS spends our bearer token against the EPC
 * register, and nothing stopped a script sweeping postcodes until the register
 * throttled us or pulled the token — breaking the feature for everyone.
 */
describe('the EPC lookup is rate limited, and only where it costs us', () => {
  const RULE = { bucket: 'epc', limit: 3, windowSeconds: 600 };

  const db = () => {
    const rows = new Map<string, { count: number; expires_at: number }>();
    return {
      calls: rows,
      prepare(sql: string) {
        let bound: unknown[] = [];
        return {
          bind(...v: unknown[]) { bound = v; return this; },
          async run() {
            if (sql.includes('INSERT INTO rate_limits')) {
              const k = String(bound[0]);
              const cur = rows.get(k);
              rows.set(k, { count: (cur?.count ?? 0) + 1, expires_at: Number(bound[1]) });
            }
            if (sql.includes('DELETE FROM rate_limits')) {
              for (const [k, v] of rows) if (v.expires_at < Number(bound[0])) rows.delete(k);
            }
            return { meta: { changes: 1 } };
          },
          async first() {
            return sql.includes('SELECT count') ? rows.get(String(bound[0])) ?? null : null;
          },
          async all() { return { results: [] }; },
        };
      },
    } as unknown as D1Database & { calls: Map<string, { count: number; expires_at: number }> };
  };

  it('lets a normal person through and stops a script', async () => {
    const d = db();
    const allowed: boolean[] = [];
    for (let i = 0; i < 5; i++) allowed.push((await consume(d, RULE, '1.2.3.4')).allowed);
    expect(allowed).toEqual([true, true, true, false, false]);
  });

  it('counts each caller separately — one abuser cannot lock everybody out', async () => {
    const d = db();
    for (let i = 0; i < 5; i++) await consume(d, RULE, '1.2.3.4');
    expect((await consume(d, RULE, '5.6.7.8')).allowed).toBe(true);
  });

  it('the window rolls, so a refused caller is not banned for ever', async () => {
    const d = db();
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 5; i++) await consume(d, RULE, '1.2.3.4', t0);
    expect((await consume(d, RULE, '1.2.3.4', t0)).allowed).toBe(false);
    expect((await consume(d, RULE, '1.2.3.4', t0 + RULE.windowSeconds * 1000)).allowed).toBe(true);
  });

  it('the identity is Cloudflare\'s own header, never a spoofable one', async () => {
    const spoofed = new Request('https://s.test/api/epc', {
      headers: { 'X-Forwarded-For': '9.9.9.9', 'CF-Connecting-IP': '1.2.3.4' },
    });
    expect(identityOf(spoofed)).toBe('1.2.3.4');
    // and with no trusted header it shares ONE bucket rather than going free
    expect(identityOf(new Request('https://s.test/api/epc', { headers: { 'X-Forwarded-For': '9.9.9.9' } }))).toBe('unknown');
  });

  it('FAILS OPEN on a database error — a D1 blip must not take the analyser down', async () => {
    const broken = { prepare() { throw new Error('d1 down'); } } as unknown as D1Database;
    expect((await consume(broken, RULE, '1.2.3.4')).allowed).toBe(true);
  });

  it('old buckets are swept, so the limiter cannot become the thing it prevents', async () => {
    const d = db();
    await consume(d, RULE, '1.2.3.4', 1_000_000_000_000);
    expect(d.calls.size).toBe(1);
    await sweepRateLimits(d, 1_000_000_000_000 + RULE.windowSeconds * 3000);
    expect(d.calls.size).toBe(0);
  });
});

/**
 * S1 — THE STATIC PAGES ARE COVERED TOO.
 *
 * `run_worker_first` in wrangler.jsonc lists four path prefixes; every other
 * page is served by Cloudflare's asset layer without the Worker running, so the
 * Worker's wrapper cannot reach them. `public/_headers` covers those. Both must
 * exist and must agree — this is what stops one being updated without the other.
 */
describe('static pages carry the same protections as Worker routes', () => {
  const headersFile = readFileSync(join(REPO, 'packages/web/public/_headers'), 'utf8');
  const wrangler = readFileSync(join(REPO, 'packages/web/wrangler.jsonc'), 'utf8');

  it('_headers applies them to every path', () => {
    expect(headersFile).toMatch(/^\/\*$/m);
    for (const h of ['Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options',
      'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security']) {
      expect(headersFile, h).toContain(h);
    }
  });

  it('and names the same origins as the Worker policy — the two cannot drift', () => {
    const workerCsp = SECURITY_HEADERS['content-security-policy'];
    for (const origin of ['data.police.uk', 'environment.data.gov.uk', 'www.planning.data.gov.uk',
      'landregistry.data.gov.uk', 'challenges.cloudflare.com', 'youtube-nocookie.com',
      'media.rightmove.co.uk', '*.zoocdn.com']) {
      expect(workerCsp, `worker: ${origin}`).toContain(origin);
      expect(headersFile, `_headers: ${origin}`).toContain(origin);
    }
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(workerCsp, `worker: ${directive}`).toContain(directive);
      expect(headersFile, `_headers: ${directive}`).toContain(directive);
    }
  });

  /**
   * THE POLICY HAS TO PERMIT THE PRODUCT.
   *
   * F1's floor plan and R3's photo carousel both rest on the same position: the
   * image is the PORTAL'S, so the user's own browser renders it from the
   * portal's server and we never fetch or hold it. Both shipped without anyone
   * adding those hosts to `img-src`, so every one of those images was blocked —
   * the floor plan was a black rectangle and the carousel said "That photo
   * would not load", with the real reason only in the console.
   *
   * The boundary tests prove we never FETCH a portal image. Nothing proved the
   * browser is allowed to DISPLAY one. This does.
   */
  it('img-src lets the browser display the portal images the product is built on', () => {
    const workerCsp = SECURITY_HEADERS['content-security-policy'];
    const imgSrc = (csp: string): string => (csp.split(';').find((d) => d.trim().startsWith('img-src')) ?? '');
    for (const host of ['https://media.rightmove.co.uk', 'https://*.zoocdn.com']) {
      expect(imgSrc(workerCsp), `worker img-src: ${host}`).toContain(host);
      expect(imgSrc(headersFile), `_headers img-src: ${host}`).toContain(host);
    }
  });

  it('but they may ONLY paint pixels — no script, no connection, no frame', () => {
    const workerCsp = SECURITY_HEADERS['content-security-policy'];
    for (const directive of ['script-src', 'connect-src', 'frame-src', 'default-src']) {
      const d = workerCsp.split(';').find((x) => x.trim().startsWith(directive)) ?? '';
      for (const host of ['rightmove', 'zoocdn']) {
        expect(d, `${directive} must not name ${host}`).not.toContain(host);
      }
    }
  });

  it('every Worker-served prefix really is listed as run_worker_first', () => {
    // If a prefix were dropped here, its route would be swallowed by the asset
    // layer and the Worker's headers (and the route itself) would never run.
    for (const prefix of ['/auth/*', '/api/*', '/dev/*', '/broker/*']) {
      expect(wrangler, prefix).toContain(prefix);
    }
  });
})

/**
 * A HEAD IS A GET WITHOUT A BODY (M1).
 *
 * Every route branch matches on `method === 'GET'`, so a HEAD fell through to
 * the catch-all 404 — including /api/health, whose whole job is to say whether
 * the app is alive. Any monitor set to HEAD, which is the common default, was
 * told the site was down from 2026-09-02 onwards while it was fine.
 */
describe('the Worker answers HEAD the way the whole internet expects', () => {
  /**
   * ASKED, NOT GREPPED (M5).
   *
   * What stood here sliced index.ts between two character offsets and searched
   * the text for "request.method === 'HEAD'". No test in the repository ever
   * sent a HEAD request. It was written two days after a HEAD fault took the
   * health monitor blind for a fortnight, and it would have passed just as
   * happily if the conversion had been written and then never wired to the
   * exit — which is the fault it was supposed to catch.
   *
   * These send one.
   */
  const headAndGet = async (path: string): Promise<{ head: Response; get: Response }> => ({
    head: await worker.fetch(new Request(`https://s.test${path}`, { method: 'HEAD' }), env()),
    get: await worker.fetch(new Request(`https://s.test${path}`), env()),
  });

  it.each(['/', '/api/health', '/does-not-exist'])('HEAD %s answers with the status a GET would', async (path) => {
    const { head, get } = await headAndGet(path);
    expect(head.status, `${path}: HEAD must not fall through to the 404`).toBe(get.status);
  });

  it('HEAD /api/health is a 200, which is the whole reason this exists', async () => {
    const res = await worker.fetch(new Request('https://s.test/api/health', { method: 'HEAD' }), env());
    expect(res.status).toBe(200);
  });

  it('and returns no body at all', async () => {
    const res = await worker.fetch(new Request('https://s.test/api/health', { method: 'HEAD' }), env());
    expect(await res.text()).toBe('');
  });

  it('carrying the same headers a GET would carry, security ones included', async () => {
    const { head, get } = await headAndGet('/api/health');
    for (const h of Object.keys(SECURITY_HEADERS)) {
      expect(head.headers.get(h), `HEAD is missing ${h}`).toBe(get.headers.get(h));
    }
    expect(head.headers.get('content-type')).toBe(get.headers.get('content-type'));
  });
});

/**
 * DM1 — THE TWO POLICIES ARE ONE POLICY.
 *
 * There are two CSPs: the Worker's, for anything it answers, and the one in
 * public/_headers for the static paths the Worker never sees. They have always
 * been meant to be identical and nothing made them so — the old test compared
 * the ORIGINS each named, which is a weaker claim than it looks. Moving the
 * data bucket to its own domain proved the point: the Worker's policy could
 * have been updated and this file left on the old r2.dev host, and a
 * same-origins check across two different lists would still have passed.
 *
 * Byte-identical, or it fails.
 */
describe('the static _headers policy and the Worker policy are the same policy', () => {
  const HEADERS_FILE = readFileSync(
    fileURLToPath(new URL('../../public/_headers', import.meta.url)), 'utf8',
  );

  /** The one `/*` block's CSP line, exactly as Cloudflare will serve it. */
  const staticCsp = (): string => {
    const line = HEADERS_FILE.split('\n').find((l) => /^\s+Content-Security-Policy:/.test(l));
    expect(line, 'no Content-Security-Policy line in public/_headers').toBeDefined();
    return (line as string).replace(/^\s*Content-Security-Policy:\s*/, '').trim();
  };

  it('finds a policy in both places', () => {
    expect(staticCsp().length).toBeGreaterThan(200);
    expect(SECURITY_HEADERS['content-security-policy'].length).toBeGreaterThan(200);
  });

  it('is byte-identical in both places', () => {
    expect(staticCsp()).toBe(SECURITY_HEADERS['content-security-policy']);
  });

  it('names the data bucket that config actually points at, in both', () => {
    // BOTH hosts: the JSON is on the product's own domain, the map's 1.07GB
    // archive is deliberately not (see coreConfig.tilesBaseUrl).
    for (const origin of [new URL(coreConfig.dataBaseUrl).origin, new URL(coreConfig.tilesBaseUrl).origin]) {
      expect(staticCsp(), origin).toContain(origin);
      expect(SECURITY_HEADERS['content-security-policy'], origin).toContain(origin);
    }
  });
});
