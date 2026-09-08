import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * THE TOKEN NEVER LEAVES THE SERVER (E1).
 *
 * Runtime EPC calls were ruled out once already, and correctly: a bearer token
 * inside a published Chrome package is a published token. The only reason it is
 * allowed now is that a Worker can hold a secret the browser never sees — so
 * that property is the whole basis of the decision, and it is pinned here
 * rather than left to care.
 *
 * This is a SOURCE check, which runs in CI on every push. It is the companion
 * to the build check (grep the built bundles), which needs a build to exist.
 */
const web = fileURLToPath(new URL('../../..', import.meta.url));
const SECRET = 'EPC_BEARER_TOKEN';

/** Every source file under a directory, recursively. */
function sources(dir: string): string[] {
  return readdirSync(join(web, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx|astro|js|mjs)$/.test(f))
    .map((f) => join(dir, f));
}

describe('the EPC bearer token is server-side only', () => {
  it('no component, page, layout or client config so much as names it', () => {
    const clientDirs = ['src/components', 'src/pages', 'src/layouts', 'src/config', 'src/content', 'src/lib'];
    const leaks: string[] = [];
    for (const dir of clientDirs) {
      for (const f of sources(dir)) {
        if (readFileSync(join(web, f), 'utf8').includes(SECRET)) leaks.push(f);
      }
    }
    expect(leaks, 'the token belongs to the Worker alone').toEqual([]);
  });

  it('only the Worker names it, and only where it is read or typed', () => {
    const carriers = sources('src/worker')
      .filter((f) => !f.endsWith('.test.ts'))
      .filter((f) => readFileSync(join(web, f), 'utf8').includes(SECRET));
    expect(carriers.sort()).toEqual(['src/worker/index.ts']);
  });

  it('the client-side lookup calls OUR endpoint, never the register directly', () => {
    const client = readFileSync(join(web, 'src/components/analyser/epcArea.ts'), 'utf8');
    expect(client).not.toContain('get-energy-performance-data');
    expect(client).not.toContain('Authorization');
    expect(client).toContain('EPC_LOOKUP.endpoint');
  });

  it('the register host is named ONLY in the Worker', () => {
    const host = 'api.get-energy-performance-data.communities.gov.uk';
    const named = ['src/components', 'src/pages', 'src/layouts', 'src/config', 'src/lib']
      .flatMap(sources)
      .filter((f) => readFileSync(join(web, f), 'utf8').includes(host));
    expect(named, 'only the Worker may talk to the register').toEqual([]);
  });

  it('the secret is not in any committed env file', () => {
    // .dev.vars is gitignored and holds it locally; wrangler.jsonc must not.
    const wrangler = readFileSync(join(web, 'wrangler.jsonc'), 'utf8');
    expect(wrangler).not.toContain(SECRET);
  });
});
