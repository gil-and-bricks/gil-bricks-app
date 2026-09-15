/**
 * S1 — NOBODY CLOSES THESE DOORS BY ACCIDENT, INCLUDING ME.
 *
 * Five crawlers must never be disallowed. Two of them — Googlebot and Bingbot —
 * are the difference between existing and not existing in search and in the AI
 * answers that browse through search. The other three fetch a page in order to
 * cite it, which is the distribution this product is actually short of.
 *
 * The rule is enforced against the RENDERED FILE, not against the config that
 * feeds it, because the file is what a crawler reads. A test that checked the
 * array would pass while a broken template emitted nothing at all.
 */
import { describe, expect, it } from 'vitest';
import { GET } from '../pages/robots.txt';
import { CONTENT_SIGNAL, SEARCH_CRAWLERS, TRAINING_CRAWLERS } from './crawlers';

/**
 * THE CONTRACT, WRITTEN OUT, NOT READ FROM THE THING UNDER TEST.
 *
 * The first version of this file looped over `SEARCH_CRAWLERS` to decide what to
 * check. Proving it bites exposed the flaw immediately: move Bingbot out of that
 * array and into the blocked one — the realistic mistake — and the test stops
 * CHECKING Bingbot, so it passes while Bing is disallowed. Two of the five
 * behaved that way. Googlebot, OAI-SearchBot and Claude-SearchBot only failed
 * because they appear in a hardcoded pair assertion further down.
 *
 * That is the round-trip trap this project has hit before: a test and its
 * subject reading the same list, agreeing with each other, and agreeing about
 * nothing. These five names are the requirement, so they are written here, and
 * `mustBeAllowed` is asserted to match the config in one direction only.
 */
const MUST_BE_ALLOWED = ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot'] as const;
const MUST_BE_BLOCKED = ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended'] as const;

const render = async (): Promise<string> => {
  const res = await (GET as unknown as (c: unknown) => Response | Promise<Response>)({} as never);
  return (res as Response).text();
};

/**
 * What a crawler actually concludes, parsed the way the standard says: find the
 * group whose User-agent matches, and read ITS rules. Falling back to `*` only
 * when nothing names the agent.
 *
 * Hand-rolled rather than grepped for, because `expect(txt).toContain('Allow')`
 * is exactly the shape of test that passes while the file says the opposite
 * three lines further down.
 */
function verdictFor(txt: string, agent: string): 'allowed' | 'disallowed' | 'unknown' {
  const groups: { agents: string[]; rules: string[] }[] = [];
  let cur: { agents: string[]; rules: string[] } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) { lastWasAgent = false; continue; }
    const [k, ...rest] = line.split(':');
    const key = (k ?? '').trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || cur === null) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (cur !== null) cur.rules.push(`${key} ${val}`);
    } else {
      lastWasAgent = false;
    }
  }
  const named = groups.find((g) => g.agents.includes(agent.toLowerCase()));
  const star = groups.find((g) => g.agents.includes('*'));
  const g = named ?? star;
  if (g === undefined) return 'unknown';
  // A bare `Disallow:` with no path disallows nothing; `Disallow: /` is the root.
  if (g.rules.some((r) => r === 'disallow /')) return 'disallowed';
  if (g.rules.some((r) => r.startsWith('allow'))) return 'allowed';
  return 'unknown';
}

describe('robots.txt — the five that must never be shut out', () => {
  it('names and allows every search-and-answer crawler', async () => {
    const txt = await render();
    for (const agent of MUST_BE_ALLOWED) {
      expect(txt, `${agent} is not named in robots.txt`).toContain(`User-agent: ${agent}`);
      expect(verdictFor(txt, agent), `${agent} must be allowed`).toBe('allowed');
    }
  });

  it('the config still covers the contract — nothing quietly dropped from it', () => {
    // One direction only: every name the contract requires must be in the
    // config. The config may hold MORE (a new citing crawler), and that is fine.
    const configured = SEARCH_CRAWLERS.map((c) => c.agent);
    for (const agent of MUST_BE_ALLOWED) {
      expect(configured, `${agent} was removed from SEARCH_CRAWLERS`).toContain(agent);
    }
  });

  it('THE DETECTOR BITES — a disallow on any one of them is caught', async () => {
    /**
     * The test above is only worth having if it can fail. Each of the five is
     * disallowed in turn, in the rendered text, and the verdict must flip. A
     * rule nobody has watched fail is a rule nobody knows works.
     */
    const txt = await render();
    for (const agent of MUST_BE_ALLOWED) {
      const broken = txt.replace(
        new RegExp(`User-agent: ${agent}\\nAllow: /`),
        `User-agent: ${agent}\nDisallow: /`,
      );
      expect(broken, `${agent}: the break did not apply`).not.toBe(txt);
      expect(verdictFor(broken, agent), `${agent} was disallowed and nothing noticed`).toBe('disallowed');
    }
  });

  it('and bites when a name is DELETED, not only when it is disallowed', async () => {
    // The subtler failure: drop the named group and the agent falls through to
    // the wildcard. That reads as "allowed" today, so the verdict alone would
    // not catch it — the NAME is what this asserts.
    const txt = await render();
    for (const agent of MUST_BE_ALLOWED) {
      const broken = txt.replace(`User-agent: ${agent}\nAllow: /\n\n`, '');
      expect(broken, `${agent}: the deletion did not apply`).not.toBe(txt);
      expect(broken).not.toContain(`User-agent: ${agent}`);
    }
  });

  it('blocks every training crawler, and they are a different set', async () => {
    const txt = await render();
    for (const agent of MUST_BE_BLOCKED) {
      expect(verdictFor(txt, agent), `${agent} must be blocked`).toBe('disallowed');
    }
    for (const c of TRAINING_CRAWLERS) {
      expect(verdictFor(txt, c.agent), `${c.agent}: ${c.why}`).toBe('disallowed');
    }
    // The pairs that make the distinction matter. Getting either backwards
    // forfeits the citation or hands over the training.
    for (const [search, train] of [['OAI-SearchBot', 'GPTBot'], ['Claude-SearchBot', 'ClaudeBot'], ['Googlebot', 'Google-Extended']]) {
      expect(verdictFor(txt, search as string)).toBe('allowed');
      expect(verdictFor(txt, train as string)).toBe('disallowed');
    }
  });

  it('carries ONE wildcard group — two is undefined behaviour', async () => {
    /**
     * Cloudflare's managed block used to be prepended to this file, so the
     * served robots.txt had two `User-agent: *` groups. The standard does not
     * define how they merge and parsers differ. This fails if the managed block
     * ever comes back, or if anyone adds a second wildcard here.
     */
    const txt = await render();
    expect((txt.match(/^User-agent: \*$/gm) ?? []).length).toBe(1);
  });

  it('states the content signal and names the sitemap absolutely', async () => {
    const txt = await render();
    expect(txt).toContain(`Content-Signal: ${CONTENT_SIGNAL}`);
    const sitemap = /^Sitemap: (\S+)$/m.exec(txt);
    expect(sitemap, 'no sitemap line').not.toBeNull();
    expect(sitemap?.[1]).toMatch(/^https:\/\/proplaunch\.ai\/sitemap\.xml$/);
  });

  it('the parser itself is not vacuous', () => {
    // It must actually distinguish, or every assertion above is theatre.
    const sample = 'User-agent: Googlebot\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n';
    expect(verdictFor(sample, 'Googlebot')).toBe('allowed');
    expect(verdictFor(sample, 'GPTBot')).toBe('disallowed');
    expect(verdictFor(sample, 'SomeOtherBot')).toBe('allowed');   // falls through to *
    expect(verdictFor('User-agent: *\nDisallow: /\n', 'Googlebot')).toBe('disallowed');
  });
});
