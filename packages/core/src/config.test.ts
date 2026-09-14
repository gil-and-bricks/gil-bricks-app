import { describe, expect, it } from 'vitest';
import { coreConfig } from './config';

/**
 * DP2 — THE HOSTS THE PRODUCT FETCHES FROM.
 *
 * `tilesBaseUrl` exists as its own field because the map's 1.07GB archive and
 * the few hundred KB of sector JSON are two different things that have already
 * had to live in two different places once. These assert what each one must be
 * true of, not that they are equal — so pointing them apart again is a config
 * edit and not a test rewrite.
 */
describe('the data hosts', () => {
  it('are https, with no trailing slash to double up a path', () => {
    for (const url of [coreConfig.dataBaseUrl, coreConfig.tilesBaseUrl, coreConfig.appBaseUrl]) {
      expect(url).toMatch(/^https:\/\//);
      expect(url.endsWith('/'), url).toBe(false);
    }
  });

  it('keep the development endpoint out of the DATA path', () => {
    // r2.dev is Cloudflare's development URL: uncached and rate limited, and
    // explicitly not for production traffic.
    expect(coreConfig.dataBaseUrl).not.toContain('r2.dev');
    expect(coreConfig.appBaseUrl).not.toContain('r2.dev');
  });

  it('keep it out of the TILES path too, now the rule excludes /map/', () => {
    /**
     * THIS TEST USED TO ASSERT THE OPPOSITE, and that was the point of it.
     *
     * The archive spent DM1 on the development host because the data bucket's
     * Cache Rule broke byte-serving over an object that size — three
     * consecutive red CI runs on /comparables, green on the commit that moved
     * it off. That exception was written here as an assertion rather than a
     * comment so it could not be forgotten: flipping the config failed this
     * test, and this test sent whoever flipped it to check the rule first.
     *
     * The rule now excludes /map/ — a range request to the archive answers
     * cf-cache-status DYNAMIC where it used to answer BYPASS — so the archive
     * is back on the one host and the exception is gone. One host, and no
     * rate-limited development endpoint anywhere in the request path.
     */
    expect(coreConfig.tilesBaseUrl).not.toContain('r2.dev');
  });

  it('are ONE host today, which is what collapses the CSP to a single entry', () => {
    // securityHeaders.ts de-duplicates these into `DATA_HOSTS`. They are still
    // two fields on purpose — they have needed to differ once — so this asserts
    // today's fact, and pointing them apart again is a config edit plus this
    // line, not an archaeology exercise.
    expect(coreConfig.tilesBaseUrl).toBe(coreConfig.dataBaseUrl);
  });

  it('are both real, parseable origins', () => {
    for (const url of [coreConfig.dataBaseUrl, coreConfig.tilesBaseUrl]) {
      expect(() => new URL(url), url).not.toThrow();
      expect(new URL(url).origin, url).toBe(url);
    }
  });
});
