/**
 * THE DEV ROUTES ARE IMPOSSIBLE IN PRODUCTION (A1).
 *
 * /dev/preview renders five surfaces with fake broker details. It is gated on
 * DEV_LOGIN — a value that exists only in .dev.vars, which `wrangler deploy`
 * never uploads — plus a local host. That claim had no test behind it, in a
 * product whose whole rulebook is enforced by tests. It has one now.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocalHost, isPreviewEnv, handleDevPreview, phoneNote } from './dev';
import type { Env } from './index';

const env = (devLogin?: string): Env => ({ DEV_LOGIN: devLogin } as unknown as Env);
const req = (url: string): Request => new Request(url);

describe('isLocalHost', () => {
  it('accepts the machine you are sitting at, and a private address on your own wifi', () => {
    for (const h of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.102', '172.16.4.1', '172.31.255.254', 'mac.local']) {
      expect(isLocalHost(h), h).toBe(true);
    }
  });

  it('refuses a public hostname that merely LOOKS private', () => {
    // Every one of these is a registrable domain somebody else can own, and a
    // prefix match used to let them all through.
    // BOTH OUR PUBLIC HOSTS ARE IN THIS LIST ON PURPOSE. The old one stayed
    // when the product moved (DM1) — it still answers /dev/* rather than
    // redirecting, so it is still a host this guard has to refuse — and the new
    // one was added beside it, because a guard that only knows the address we
    // have left is a guard for nothing.
    for (const h of ['10.example.com', '192.168.evil.co.uk', '172.16.attacker.net', 'gil-bricks-app.gil-782.workers.dev', 'proplaunch.ai', 'www.proplaunch.ai', 'example.com', '8.8.8.8', '172.15.0.1', '172.32.0.1', '11.0.0.1']) {
      expect(isLocalHost(h), h).toBe(false);
    }
  });
});

describe('the preview cannot exist in production', () => {
  it('is refused without DEV_LOGIN, however local the host looks', () => {
    expect(isPreviewEnv(env(undefined), req('http://localhost:8787/dev/preview'))).toBe(false);
    expect(isPreviewEnv(env('off'), req('http://127.0.0.1:8787/dev/preview'))).toBe(false);
  });

  it('is refused on a public host, even with DEV_LOGIN somehow set', () => {
    expect(isPreviewEnv(env('on'), req('https://gil-bricks-app.gil-782.workers.dev/dev/preview'))).toBe(false);
    expect(isPreviewEnv(env('on'), req('https://proplaunch.ai/dev/preview'))).toBe(false);
    expect(isPreviewEnv(env('on'), req('https://10.example.com/dev/preview'))).toBe(false);
  });

  it('answers a bare 404 in production, saying nothing about itself', async () => {
    const res = handleDevPreview(req('https://gil-bricks-app.gil-782.workers.dev/dev/preview'), env(undefined));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toBe('Not Found');
    expect(body.toLowerCase()).not.toContain('preview');
  });

  it('renders locally with DEV_LOGIN on, and tells search engines to keep out', async () => {
    const res = handleDevPreview(req('http://localhost:8787/dev/preview'), env('on'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toContain('five surfaces');
  });

  /**
   * The note said "Four of the five work on a phone" while TWO of them needed
   * a laptop: the bridging enquiry form is a sign-in card until you are signed
   * in, and sign-in only works on localhost because that is the registered
   * OAuth redirect. The number and the flags were two separate facts, so one
   * went stale silently. The number is counted from the list now.
   */
  describe('the phone note', () => {
    it('counts the surfaces instead of asserting a number', () => {
      expect(phoneNote()).toBe(
        'Three of the five work on a phone. The bridging enquiry form and the broker fact-find need the laptop, because signing in needs localhost.',
      );
    });

    it('and the page prints what it counted', async () => {
      const body = await handleDevPreview(req('http://localhost:8787/dev/preview'), env('on')).text();
      expect(body).toContain('Three of the five work on a phone.');
      expect(body, 'the stale number must not come back').not.toContain('Four of the five');
      // both laptop-only surfaces are marked in the list itself, not just the note
      expect((body.match(/Laptop only/g) ?? []).length).toBe(2);
    });
  });
});

/**
 * DM1 — A GATE THAT BOOTS A LOCAL WORKER MUST BOOT IT AS LOCALHOST.
 *
 * The guard above is deliberately strict: a dev route needs a localhost host,
 * and that is what makes it inert on the deployed site. The trap is that
 * wrangler takes the hostname a LOCALLY-RUN Worker sees from the first `routes`
 * entry in wrangler.jsonc — so the moment the product got a custom domain, a
 * Worker started on localhost:8788 began seeing `http://proplaunch.ai/...` and
 * every dev route correctly refused it. Two gates went dark and the symptom
 * ("signing in did not land on the board") named neither cause nor fix.
 *
 * The answer was never to loosen the guard. It was `--local-upstream localhost`
 * in the gates that boot a Worker. This fails if a future one forgets, or if
 * someone reaches for the guard instead.
 */
describe('the gates that boot a local Worker keep the dev door reachable', () => {
  const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const CONFIG = read('../../wrangler.jsonc');

  /** Every script that starts its own `wrangler dev`. Found, not listed. */
  const SCRIPTS_DIR = fileURLToPath(new URL('../../scripts/', import.meta.url));
  const booters = readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => ({ name: f, body: readFileSync(join(SCRIPTS_DIR, f), 'utf8') }))
    .filter((f) => /['"]wrangler['"][\s\S]{0,80}['"]dev['"]/.test(f.body) || /wrangler',\s*\['dev'/.test(f.body));

  it('finds the scripts that boot one — a check over an empty list proves nothing', () => {
    // preview-surfaces.mjs is here because this test found it: it boots a
    // Worker too, is guarded by isPreviewEnv, and was equally dark after the
    // domain move — the operator's own five-surface preview, which nothing
    // else exercises.
    expect(booters.map((b) => b.name).sort())
      .toEqual(['check-pack.mjs', 'check-signed-in.mjs', 'preview-surfaces.mjs']);
  });

  it('only matters while wrangler.jsonc actually carries a route', () => {
    // If the routes ever go away this whole hazard goes with them, and this
    // test should be deleted rather than left asserting a flag nobody needs.
    expect(CONFIG).toMatch(/"routes"\s*:\s*\[/);
    expect(CONFIG).toMatch(/"custom_domain"\s*:\s*true/);
  });

  it('every one of them boots the Worker as localhost', () => {
    for (const b of booters) {
      expect(b.body, `${b.name} boots a local Worker without --local-upstream localhost`)
        .toContain("'--local-upstream', 'localhost'");
    }
  });

  // (An earlier version also asserted these scripts never NAME isDevEnv. That
  //  measured prose, not behaviour: the gates' own failure message quotes the
  //  guard by name, which is the most useful thing it says. Dropped.)
});
