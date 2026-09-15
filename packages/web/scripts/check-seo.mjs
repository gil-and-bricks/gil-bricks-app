/**
 * S1 — THE SEO GATE. Checks the BUILT output, so it runs after the build.
 *
 * WHY IT IS A GATE AND NOT A TEST. Its assertions are about rendered HTML —
 * what a crawler actually receives — and vitest runs before `npm run build` in
 * CI. The first version of these checks lived in a vitest file, passed on a
 * machine that had built, and turned CI red on a fresh checkout with ENOENT on
 * dist/index.html. CLAUDE.md states the rule outright: a test that reads a
 * built artefact must be the file that OWNS the build.
 *
 * It refuses to run at all without a build rather than skipping quietly — a
 * skipped assertion is a lie unless the skip itself fails.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(WEB, 'dist');
const problems = [];
const ok = (m) => console.log(`    ✓ ${m}`);
const bad = (m) => { problems.push(m); console.log(`    ✗ ${m}`); };

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('No build at packages/web/dist.\nRun: npm run build -w packages/web');
  process.exit(1);
}

const html = (p) => readFileSync(join(DIST, p), 'utf8');
const graphOf = (p) => {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html(p));
  return m === null ? null : JSON.parse(m[1])['@graph'];
};
const visible = (p) => html(p)
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

console.log('\n=== structured data reaches the page ===');
const EMITTING = {
  'index.html': ['Organization', 'SoftwareApplication'],
  'brrrr/analyser/index.html': ['SoftwareApplication'],
  'flip/analyser/index.html': ['SoftwareApplication'],
  'hmo/analyser/index.html': ['SoftwareApplication'],
  'buy-to-let/analyser/index.html': ['SoftwareApplication'],
  'area-data/index.html': ['Dataset'],
  'comparables/index.html': ['Dataset'],
};
for (const [page, types] of Object.entries(EMITTING)) {
  const g = graphOf(page);
  if (g === null) { bad(`${page}: no JSON-LD at all`); continue; }
  const got = g.map((n) => n['@type']);
  if (JSON.stringify(got) !== JSON.stringify(types)) bad(`${page}: expected ${types.join('+')}, got ${got.join('+')}`);
  else ok(`${page}: ${got.join(' + ')}`);
}

console.log('\n=== never richer than the page it describes ===');
for (const page of ['index.html', 'brrrr/analyser/index.html']) {
  const g = graphOf(page) ?? [];
  if (g.some((n) => n.offers !== undefined) && !/\bfree\b/i.test(visible(page))) {
    bad(`${page}: the markup says free but the page never does`);
  } else ok(`${page}: the free claim is one the page makes in words`);
}

console.log('\n=== the refresh date actually reached the crawler ===');
for (const page of ['area-data/index.html', 'comparables/index.html']) {
  const ds = (graphOf(page) ?? []).find((n) => n['@type'] === 'Dataset');
  if (ds === undefined) { bad(`${page}: no Dataset`); continue; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds.dateModified ?? '')) {
    bad(`${page}: no dateModified — the refresh date is invisible to a crawler again`);
  } else if (new Date(ds.dateModified).getTime() > Date.now()) {
    bad(`${page}: dateModified ${ds.dateModified} is in the future — somebody hardcoded it`);
  } else ok(`${page}: dateModified ${ds.dateModified}, covers ${ds.temporalCoverage}`);
}

console.log('\n=== no page we ask search engines to ignore describes itself to them ===');
let leaks = 0;
for (const page of ['account', 'deals', 'privacy', 'terms', 'pack', 'start', 'styleguide', 'diagnostics', 'p/_']) {
  const f = `${page}/index.html`;
  if (!existsSync(join(DIST, f))) continue;
  const raw = html(f);
  if (!/name="robots" content="noindex/.test(raw)) { bad(`/${page}/ is not noindex but was expected to be`); continue; }
  if (raw.includes('application/ld+json')) { bad(`/${page}/ is noindex yet carries structured data`); leaks += 1; }
}
if (leaks === 0) ok('every noindex page carries none');

console.log('\n=== no fabricated claims anywhere in the built output ===');
const forbidden = /aggregateRating|ratingValue|reviewCount|"@type"\s*:\s*"Review"|FAQPage/;
let found = 0;
for (const page of Object.keys(EMITTING)) {
  if (forbidden.test(html(page))) { bad(`${page} claims a rating, a review or an FAQ`); found += 1; }
}
if (found === 0) ok('no rating, no review, no FAQ — none of them exist, so none are claimed');

console.log('\n=== the crawler policy, as served ===');
const robots = existsSync(join(DIST, 'robots.txt')) ? readFileSync(join(DIST, 'robots.txt'), 'utf8') : '';
if (robots === '') bad('no robots.txt in the build');
else {
  for (const agent of ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot']) {
    if (!robots.includes(`User-agent: ${agent}\nAllow: /`)) bad(`${agent} is not named and allowed`);
  }
  for (const agent of ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended']) {
    if (!robots.includes(`User-agent: ${agent}\nDisallow: /`)) bad(`${agent} is not blocked`);
  }
  const wildcards = (robots.match(/^User-agent: \*$/gm) ?? []).length;
  if (wildcards !== 1) bad(`${wildcards} wildcard groups — the standard defines no merge for more than one`);
  if (problems.length === 0) ok('five named and allowed, four training crawlers blocked, one wildcard');
}

console.log(problems.length === 0 ? '\n=== THE SEO GATE PASSES ===\n' : `\n=== ${problems.length} PROBLEM(S) ===\n`);
process.exit(problems.length === 0 ? 0 : 1);
