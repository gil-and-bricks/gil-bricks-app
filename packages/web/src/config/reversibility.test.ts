/**
 * REVERSIBILITY GUARDRAIL (N1) — enforces the CLAUDE.md "Reversibility charter"
 * in the style of the no-manual-entry guardrail (worker/lib/pipeline.test.ts):
 * walk src/, fail LOUDLY when a rule is broken, and prove the checks are not
 * vacuous. What it enforces:
 *
 *   A. Feature flags live ONLY in src/config/features.ts.
 *   B. Brand colour values live ONLY in src/styles/tokens.css (one server-side
 *      allowlist, with its reason).
 *   C. Copy that config already owns (stage/park/fact labels, board + sticky
 *      copy, the cap message) is never re-typed in code.
 *   D. Components never compare a score/yield/ROI against a number literal
 *      (thresholds are config; verdict tiers are @gil-bricks/core).
 *   E. INLINE COPY RATCHET: every user-facing string in a component or lib is
 *      counted per file against a baseline. A NEW file starts at 0 — its copy
 *      must live in config. An existing file may only go DOWN. Moving copy to
 *      config = lower the baseline; adding inline copy = the build fails.
 *
 * Scope (honest): TSX/TS under src/components + src/lib, Astro site chrome
 * (src/components/**, src/layouts). Page PROSE under src/pages and src/content
 * (landing, legal, about) is content, not config, and is out of scope on
 * purpose — see docs/FEATURE_FLAGS.md → "What the guardrail covers".
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';
import { features } from './features';
import { ALL_STAGES, BOARD_COPY, FACT_TYPES, LIVE_CAP_MESSAGE, PARK_REASONS } from './pipeline';
import { STICKY_VERDICT } from './stickyVerdict';

const SRC = fileURLToPath(new URL('../', import.meta.url)); // packages/web/src
const rel = (p: string): string => relative(SRC, p).split('\\').join('/');
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
const isTest = (p: string): boolean => /\.test\.[a-z]+$/.test(p);
const ALL_FILES = walk(SRC);
const CODE_FILES = ALL_FILES.filter((p) => /\.(m|c)?(t|j)sx?$/.test(p) && !isTest(p));
const read = (p: string): string => readFileSync(p, 'utf8');

/** Strip // and block comments (and Astro/JSX {/* *​/}) so a label quoted in a
 * comment ("stage 'Offer in'") never trips the copy checks. Strings are left alone. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

/* ------------------------------------------------------------------------- */
/* E. the inline-copy counter                                                */
/* ------------------------------------------------------------------------- */

/** Attributes whose string value a person reads or hears. (class/href/id/etc. are not copy.) */
const USER_FACING_ATTRS = new Set([
  'aria-label', 'aria-description', 'aria-roledescription', 'aria-placeholder', 'aria-valuetext',
  'title', 'placeholder', 'alt', 'label', 'hint', 'tip', 'description', 'headline', 'summary',
  'message', 'text', 'caption', 'legend', 'heading', 'blurb', 'eyebrow', 'cta', 'tagline',
]);
/** Attributes that are never copy, whatever they are attached to. */
const NEVER_COPY_ATTRS = new Set([
  'class', 'className', 'href', 'src', 'id', 'style', 'key', 'ref', 'type', 'role', 'name',
  'for', 'htmlFor', 'target', 'rel', 'width', 'height', 'value', 'slot', 'client', 'lang',
  'method', 'action', 'autocomplete', 'inputmode', 'pattern', 'min', 'max', 'step', 'loading',
  'referrerpolicy', 'decoding', 'crossorigin', 'charset', 'content', 'property', 'as',
]);
const hasWords = (s: string): boolean => /[A-Za-z]{2,}/.test(s);
/** A sentence-like literal in plain TS: three or more words, not SQL/URL/path. */
const looksLikeSentence = (s: string): boolean => {
  const t = s.trim();
  if ((t.match(/[A-Za-z]{2,}/g) ?? []).length < 3 || !/\s/.test(t)) return false;
  if (/^(select|insert|update|delete|create|pragma|with|alter|drop)\b/i.test(t)) return false;
  if (/:\/\//.test(t) || /^[./(]/.test(t)) return false;            // URL, path, media query
  if (t.split(/\s+/).every((w) => /[-_]/.test(w))) return false;      // a class-name list
  return true;
};

/**
 * Count user-facing strings in one TS/TSX source. Returns the strings so a
 * failure can NAME them. Counts: JSX text with letters; string/template literals
 * that are JSX children (`{cond && 'text'}`); string values of user-facing
 * attributes; and, outside JSX, sentence-like string literals (≥3 words) that
 * are not `new Error(...)` / console messages / SQL / URLs.
 */
export function inlineCopy(source: string, filename = 'x.tsx'): string[] {
  const found: string[] = [];
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true });
  } catch (err) {
    throw new Error(`reversibility guardrail could not parse ${filename}: ${(err as Error).message}`);
  }
  /** userFacing: JSX child / user-facing attr; devFacing: Error/console; ignore: a
   * non-user-facing JSX attribute (class, style, href…) — nothing in it is copy. */
  type Ctx = { userFacing: boolean; devFacing: boolean; ignore?: boolean; onComponent?: boolean };
  const literalText = (n: any): string | null => {
    if (n.type === 'StringLiteral') return n.value;
    if (n.type === 'TemplateLiteral') return n.quasis.map((q: any) => q.value.cooked ?? q.value.raw).join('');
    return null;
  };
  const SKIP_KEYS = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'range']);
  const visit = (n: any, ctx: Ctx): void => {
    if (!n || typeof n.type !== 'string') return;
    let next = ctx;
    switch (n.type) {
      case 'JSXText':
        if (hasWords(n.value)) found.push(n.value.trim().replace(/\s+/g, ' '));
        return;
      case 'JSXAttribute': {
        const name = n.name?.type === 'JSXNamespacedName' ? `${n.name.namespace.name}:${n.name.name.name}` : n.name?.name ?? '';
        // `value` is copy on a custom component (<Tile value="Not reachable">),
        // a key on a native input/option (<option value="btl">).
        const userFacing = USER_FACING_ATTRS.has(String(name)) || (name === 'value' && ctx.onComponent === true);
        if (userFacing || String(name) === 'dangerouslySetInnerHTML') {
          next = { userFacing: true, devFacing: false };
        } else if (ctx.onComponent === true && !NEVER_COPY_ATTRS.has(String(name)) && !/^(data|aria)-/.test(String(name))) {
          // An unknown prop on OUR OWN component can still carry a sentence
          // (<Card note="Sold prices only go back to 1995.">) — hold it to the
          // same sentence rule as plain TS rather than waving it through.
          next = { userFacing: false, devFacing: false };
        } else {
          next = { userFacing: false, devFacing: false, ignore: true };
        }
        break;
      }
      case 'NewExpression':
      case 'ThrowStatement':
        next = { userFacing: false, devFacing: true };
        break;
      case 'CallExpression': {
        const callee = n.callee;
        if (callee?.type === 'MemberExpression' && callee.object?.type === 'Identifier' && callee.object.name === 'console') {
          next = { userFacing: false, devFacing: true };
        }
        break;
      }
      case 'ImportDeclaration':
      case 'TSTypeAnnotation':
      case 'TSTypeReference':
      case 'TSLiteralType':
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        return;
      case 'StringLiteral':
      case 'TemplateLiteral': {
        const text = literalText(n);
        if (text !== null && !ctx.devFacing && !ctx.ignore) {
          if (ctx.userFacing ? hasWords(text) : looksLikeSentence(text)) found.push(text.trim().replace(/\s+/g, ' '));
        }
        if (n.type === 'StringLiteral') return;
        break;
      }
      default:
        break;
    }
    for (const key of Object.keys(n)) {
      if (SKIP_KEYS.has(key)) continue;
      const v = n[key];
      let childCtx = next;
      if ((n.type === 'JSXElement' || n.type === 'JSXFragment') && key === 'children') childCtx = { userFacing: true, devFacing: false };
      else if (n.type === 'JSXElement' && key === 'openingElement') {
        const nm = v?.name?.type === 'JSXIdentifier' ? String(v.name.name) : '';
        childCtx = { userFacing: false, devFacing: false, onComponent: /^[A-Z]/.test(nm) };
      }
      if (Array.isArray(v)) v.forEach((c) => visit(c, childCtx));
      else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v, childCtx);
    }
  };
  visit(ast.program, { userFacing: false, devFacing: false });
  return found;
}

/** Astro site chrome: text nodes and user-facing attributes in the template part. */
export function inlineCopyAstro(source: string): string[] {
  const parts = source.split(/^---\s*$/m);
  const template = parts.length >= 3 ? parts.slice(2).join('---') : source;
  const body = template.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const noComments = body.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const found: string[] = [];
  // A text node may WRAP an expression (`PropLaunch is made by {siteConfig.makerName}`),
  // so expressions are stripped from inside each text node — never from the whole
  // template, which would swallow the markup (and the copy) nested inside a
  // conditional. What is left is skipped if it still reads as code, not prose.
  const CODE = /&&|\|\||=>|\?\?|===|\?\.|\$\{|\($|^\)/;
  const stripExpressions = (text: string): string => {
    let out = text;
    for (let pass = 0; pass < 5; pass++) {
      const next = out.replace(/\{[^{}]*\}/g, ' ');
      if (next === out) break;
      out = next;
    }
    // an expression that opens or closes across the node boundary
    out = out.replace(/\{[^}]*$/, ' ').replace(/^[^{]*\}/, ' ');
    return out.trim();
  };
  for (const m of noComments.matchAll(/>([^<>]*?)</g)) {
    const t = stripExpressions(m[1]);
    if (t !== '' && !CODE.test(t) && hasWords(t)) found.push(t.replace(/\s+/g, ' '));
  }
  const attrNames = Array.from(USER_FACING_ATTRS).join('|');
  for (const m of noComments.matchAll(new RegExp(`\\b(${attrNames})\\s*=\\s*(["'])([^"']*)\\2`, 'g'))) {
    if (hasWords(m[3])) found.push(m[3]);
  }
  // template expressions like {'text'} / {cond && 'some text'}
  for (const m of noComments.matchAll(/\{[^{}]*?(['"`])([^'"`]*[A-Za-z]{2,}\s+[A-Za-z]{2,}[^'"`]*)\1[^{}]*?\}/g)) found.push(m[2]);
  return found;
}

/**
 * THE BASELINE — inline user-facing strings per file, as counted on 2026-09-04 (N1).
 * Only ever LOWER a number (you moved copy to config — good). A file not listed
 * here is held to ZERO. Never raise a number: put the string in config instead.
 */
const INLINE_COPY_BASELINE: Record<string, number> = {
  'components/analyser/ActionBar.tsx': 3,
  'components/analyser/Article4Flag.tsx': 1,
  'components/analyser/BrrrrVerdict.tsx': 2,
  'components/analyser/CompsModule.tsx': 11,
  'components/analyser/GdvModule.tsx': 1,
  'components/analyser/HmoVerdict.tsx': 2,
  'components/analyser/StrategyInputs.tsx': 1,
  'components/analyser/StrategySwitcher.tsx': 1,
  'components/analyser/SubjectForm.tsx': 1,
  'components/analyser/Tooltip.tsx': 1,
  'components/analyser/ValuationCard.tsx': 1,
  'components/analyser/mapImpl.ts': 7,
  'components/area/AreaApp.tsx': 22,
  'components/auth/AccountApp.tsx': 1,
  'components/auth/LoginWall.tsx': 2,
  'components/deals/DealBoard.tsx': 1,
  'components/site/Footer.astro': 0,
  'components/site/TabBar.astro': 2,
  'lib/area/crime.ts': 5,
  'lib/area/flood.ts': 1,
  'lib/map/style.ts': 1,
};

/** Every way a feature switch could be written outside the ONE flags file.
 * Kept honest by check A2, which asserts each shape still matches a probe. */
const FLAG_SHAPES = [
  /\bsiteConfig\.features\b/,                                 // the old home
  /\bfeatures\s*:\s*\{\s*\w+\s*:\s*(true|false)/,             // a flag object inside another config
  /\b(features|flags)\s*(:\s*[\w<>{}[\]|\s]+)?=\s*\{[^}]*\b(true|false)\b/, // a flags object declared elsewhere
  /\b(FEATURE|FLAG|ENABLE)_[A-Z_]+\s*=\s*(true|false)\b/,
  /\bimport\.meta\.env\.(?!PROD|DEV|SSR|MODE|BASE_URL)(PUBLIC_)?[A-Z_]+/, // build-time switch (Vite's own PROD/DEV/SSR/MODE are not flags)
  /\bexport\s+const\s+\w+(\s*:\s*boolean)?\s*=\s*(true|false)\b/, // an exported boolean switch
];
/** Flags could hide in an .astro frontmatter too, so check A reads those. */
const FLAG_FILES = ALL_FILES.filter((p) => !isTest(p) && /\.(m|c)?(t|j)sx?$/.test(p) || /\.astro$/.test(p));

const RATCHET_FILES = ALL_FILES.filter((p) => {
  const r = rel(p);
  if (isTest(p)) return false;
  if (/\.(tsx|ts)$/.test(r) && (r.startsWith('components/') || r.startsWith('lib/'))) return true;
  if (/\.astro$/.test(r) && (r.startsWith('components/') || r.startsWith('layouts/'))) return true;
  return false;
});

function countFor(p: string): string[] {
  return p.endsWith('.astro') ? inlineCopyAstro(read(p)) : inlineCopy(read(p), rel(p));
}


/* ---- check F: arithmetic on domain values, in files that only present ---- */

/**
 * Words that make a number a DOMAIN number rather than a pixel, an index or a
 * loop counter. Arithmetic on one of these is a calculation, and calculations
 * live in @gil-bricks/core (charter rule 3).
 *
 * It classifies by what the code CALLS its values, so it is a strong smell
 * detector, not a proof: rename `typicalPrice` to `here` and this will not see
 * it. docs/FEATURE_FLAGS.md says so plainly — the rule is still review
 * discipline, and this catches the ordinary way it gets broken.
 */
const DOMAIN_NOUN = /\b(price|tax|rent|roi|yield|icr|cashflow|profit|equity|ltv|refurb|gdv|arv|deposit|ppsqm|ppsqft|sqm|sqft|typical|bridging|arrangement|stamp|duty|mortgage|interest)\b/i;
/** Turning a fraction into a percentage for a formatter is display, not maths. */
const DISPLAY_SHAPES = [/^[\w.$?[\]()!]+\s*\*\s*100$/];
/** A formatter returns a STRING: joining one to something else is not maths. */
const FORMATTER = /^(fmt|format)[A-Z]/;

/**
 * Every outermost arithmetic expression that touches a domain value, including
 * `total += price` — the compound assignment is how the band ladder this sprint
 * moved into core was written, and a walk that only knew about `a + b` would
 * have missed the very thing it exists to catch.
 *
 * Parsed, not grepped: the same `* 100` is legitimate in one place and a
 * calculation in the next, so the operand decides, and only an AST knows the
 * operands. A matched expression is not descended into, so one calculation
 * counts once.
 */
function domainArithmetic(src: string, where = 'probe'): string[] {
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  } catch (err) {
    // Fail LOUD, like the copy counter does. Returning [] would mean an
    // unparseable file scored zero and passed a baseline of zero.
    throw new Error(`reversibility guardrail could not parse ${where}: ${(err as Error).message}`);
  }
  const hits: string[] = [];
  const text = (n: { start: number | null; end: number | null }): string =>
    src.slice(n.start ?? 0, n.end ?? 0).replace(/\s+/g, ' ');
  const isStr = (n: { type?: string; callee?: { name?: string; property?: { name?: string } } } | null | undefined): boolean => {
    if (n?.type === 'StringLiteral' || n?.type === 'TemplateLiteral') return true;
    // fmtMoney(x) + ' each' is string building, not arithmetic.
    const called = n?.callee?.name ?? n?.callee?.property?.name ?? '';
    return n?.type === 'CallExpression' && FORMATTER.test(called);
  };
  const record = (t: string): void => {
    const words = t.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    if (DOMAIN_NOUN.test(words) && !DISPLAY_SHAPES.some((re) => re.test(t))) hits.push(t.slice(0, 90));
  };
  const walk = (n: Record<string, unknown> | null | undefined): void => {
    if (n === null || typeof n !== 'object') return;
    const node = n as {
      type?: string; operator?: string;
      left?: { type?: string }; right?: { type?: string };
      start?: number | null; end?: number | null;
    };
    const arithmetic = ['+', '-', '*', '/', '%'];
    const compound = ['+=', '-=', '*=', '/=', '%='];
    const isBinary = node.type === 'BinaryExpression' && arithmetic.includes(node.operator ?? '');
    const isCompound = node.type === 'AssignmentExpression' && compound.includes(node.operator ?? '');
    if ((isBinary || isCompound) && !isStr(node.left) && !isStr(node.right)) {
      const before = hits.length;
      record(text(node as { start: number | null; end: number | null }));
      if (hits.length > before) return; // the whole calculation is one hit
    }
    for (const key of Object.keys(n)) {
      const v = (n as Record<string, unknown>)[key];
      if (Array.isArray(v)) v.forEach((x) => walk(x as Record<string, unknown>));
      else if (v !== null && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string') walk(v as Record<string, unknown>);
    }
  };
  walk(ast.program as unknown as Record<string, unknown>);
  return hits;
}

/** The frontmatter of an .astro file, which is ordinary TypeScript. */
function astroFrontmatter(src: string): string {
  const m = /^---\n([\s\S]*?)\n---/.exec(src);
  return m === null ? '' : m[1];
}

/**
 * ARITHMETIC RATCHET (A1). Charter rule 3: a component may format a figure and
 * never compute one. These are the calculations that were already here when the
 * rule got a test — SVG geometry, sort comparators, a £/sqft conversion done in
 * four places, an IQM narration that re-derives what core already returns.
 *
 * Only ever LOWER a number. A file not listed here is held to ZERO: new work
 * has no excuse, because the engine is one import away.
 */
const ARITHMETIC_BASELINE: Record<string, number> = {
  'components/analyser/BrrrrVerdict.tsx': 1,
  'components/analyser/CompsModule.tsx': 4,
  'components/analyser/mapImpl.ts': 1,
  'components/area/AreaApp.tsx': 1,
  'components/tools/EquityTool.tsx': 1,
  'lib/deals/retrade.ts': 1,
  'lib/deals/urgency.ts': 1,
  'lib/map/geo.ts': 1,
};

/* ------------------------------------------------------------------------- */

describe('REVERSIBILITY CHARTER guardrail (N1)', () => {
  it('A. feature flags live ONLY in src/config/features.ts', () => {
    const offenders = FLAG_FILES
      .filter((p) => rel(p) !== 'config/features.ts')
      .filter((p) => FLAG_SHAPES.some((re) => re.test(stripComments(read(p)))))
      .map(rel);
    expect(offenders, 'a feature flag outside src/config/features.ts').toEqual([]);
    expect(Object.keys(features).length).toBeGreaterThan(0);
  });

  it('A2. the flag shapes actually match the ways a flag could be written', () => {
    // A positive control: if a regex is broken, this fails instead of check A
    // going quietly blind.
    const PROBES = [
      "const on = siteConfig.features.dealScore;",
      "export const features = { newThing: true };",
      "const flags = { newThing: false };",
      "export const FEATURE_NEW_THING = true;",
      "if (import.meta.env.PUBLIC_NEW_THING === 'on') {}",
      "export const showNewThing = true;",
      "export const showNewThing: boolean = false;",
    ];
    for (const probe of PROBES) {
      expect(FLAG_SHAPES.some((re) => re.test(probe)), `no flag shape matches: ${probe}`).toBe(true);
    }
  });

  it('B. brand HEX values live ONLY in tokens.css (allowlist: the server-rendered OAuth error page)', () => {
    const tokens = read(join(SRC, 'styles/tokens.css'));
    const brandHex = Array.from(new Set((tokens.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase())))
      .filter((h) => h !== '#ffffff' && h !== '#000000');
    expect(brandHex.length).toBeGreaterThanOrEqual(6);
    // no trailing \\b: an 8-digit #rrggbbaa copy of a brand colour is still a copy.
    // (Pre-N1 rgba() tints of the lime are NOT covered — see docs/FEATURE_FLAGS.md.)
    const re = new RegExp(`(${brandHex.join('|')})`, 'i');
    const ALLOW: Record<string, string> = {
      // The Google sign-in error page is built in the Worker with no stylesheet
      // available, so the brand ground + lime must be inline there. Everything else
      // reads tokens.css.
      'worker/index.ts': 'server-rendered OAuth error page, no stylesheet',
    };
    const offenders = ALL_FILES
      .filter((p) => /\.(ts|tsx|astro|css|mjs|js)$/.test(p) && !isTest(p) && rel(p) !== 'styles/tokens.css')
      .filter((p) => re.test(stripComments(read(p))))
      .map(rel)
      .sort();
    expect(offenders, 'brand hex outside tokens.css — use var(--token); if it truly cannot, add it to ALLOW with the reason').toEqual(Object.keys(ALLOW).sort());
  });

  it('C. copy that config owns is never re-typed in code', () => {
    const owned = new Set<string>();
    for (const s of ALL_STAGES) for (const v of [s.label, s.blurb, s.todo]) owned.add(v);
    for (const r of PARK_REASONS) owned.add(r.label);
    for (const f of FACT_TYPES) owned.add(f.label);
    owned.add(LIVE_CAP_MESSAGE);
    const walkStrings = (o: unknown): void => {
      if (typeof o === 'string') owned.add(o);
      else if (o && typeof o === 'object') Object.values(o).forEach(walkStrings);
    };
    walkStrings(BOARD_COPY);
    walkStrings(STICKY_VERDICT.copy);
    const labels = Array.from(owned).filter((s) => s.trim().length >= 8);
    expect(labels.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const p of ALL_FILES) {
      const r = rel(p);
      if (isTest(p) || r.startsWith('config/') || !/\.(ts|tsx|astro)$/.test(r)) continue;
      const src = stripComments(read(p));
      for (const l of labels) {
        if (src.includes(`'${l}'`) || src.includes(`"${l}"`) || src.includes(`>${l}<`)) offenders.push(`${r}: ${JSON.stringify(l)}`);
      }
    }
    expect(offenders, 'config-owned copy re-typed — read it from the config export').toEqual([]);
  });

  it('D. components never compare a score / yield / ROI against a number literal', () => {
    const re = /\b(score|roi|yield|icr|verdict)\w*\s*(>=|<=|>|<|===|==)\s*\d/i;
    const offenders = CODE_FILES
      .filter((p) => rel(p).startsWith('components/'))
      .filter((p) => re.test(stripComments(read(p))))
      .map(rel);
    expect(offenders, 'a threshold in a component — thresholds are config; tiers are @gil-bricks/core').toEqual([]);
  });

  it('E. INLINE COPY RATCHET: no file gains inline user-facing copy; new files start at zero', () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const p of RATCHET_FILES) {
      const r = rel(p);
      seen.add(r);
      const strings = countFor(p);
      const n = strings.length;
      const base = INLINE_COPY_BASELINE[r] ?? 0;
      if (n > base) {
        problems.push(`${r}: ${n} inline strings (baseline ${base}). Move the new copy to config — e.g. ${strings.slice(-3).map((s) => JSON.stringify(s.slice(0, 60))).join(', ')}`);
      } else if (n < base) {
        problems.push(`${r}: ${n} inline strings, baseline says ${base} — copy was moved or removed (good): lower INLINE_COPY_BASELINE to ${n}`);
      }
    }
    for (const r of Object.keys(INLINE_COPY_BASELINE)) {
      if (!seen.has(r)) problems.push(`${r} is in INLINE_COPY_BASELINE but no longer exists — delete its entry`);
    }
    expect(problems).toEqual([]);
  });


  it('F. ARITHMETIC RATCHET: presentation code never gains a new calculation', () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const p of RATCHET_FILES) {
      const r = rel(p);
      seen.add(r);
      // .astro frontmatter is ordinary TypeScript, and a page can do maths in it.
      const src = r.endsWith('.astro') ? astroFrontmatter(read(p)) : read(p);
      const hits = src.trim() === '' ? [] : domainArithmetic(src, r);
      const base = ARITHMETIC_BASELINE[r] ?? 0;
      if (hits.length > base) {
        problems.push(`${r}: ${hits.length} calculations on domain values (baseline ${base}). Move it into @gil-bricks/core — e.g. ${hits.slice(-2).map((h) => JSON.stringify(h)).join(', ')}`);
      } else if (hits.length < base) {
        problems.push(`${r}: ${hits.length} calculations, baseline says ${base} — one moved into core (good): lower ARITHMETIC_BASELINE to ${hits.length}`);
      }
    }
    for (const r of Object.keys(ARITHMETIC_BASELINE)) {
      if (!seen.has(r)) problems.push(`${r} is in ARITHMETIC_BASELINE but no longer exists — delete its entry`);
    }
    expect(problems).toEqual([]);
  });

  it('the arithmetic detector is NOT vacuous: it catches real calculations and ignores display', () => {
    const CAUGHT = [
      // the area percentage this sprint moved into core
      'const pct = Math.round(((stats.typicalPrice - mileTypical) / mileTypical) * 100);',
      // the effective rate this sprint moved into core
      'const rate = (result.tax / answer.price) * 100;',
      // the band ladder, written the way it actually was — a compound assignment
      'for (const b of bands) { running += b.tax; }',
      // a total invented in the UI from parts the engine returned
      'const all = analysis.bridging.interest + analysis.bridging.arrangement;',
    ];
    const IGNORED = [
      // a DOMAIN fraction turned into a percentage for a formatter: this is the
      // one DISPLAY_SHAPES exists for, so the probe has to carry a domain noun.
      'const shown = fmtPct(analysis.icr.threshold * 100);',
      // a formatter returns a string; joining one to something is not maths
      "const caption = fmtMoney(price) + ' each';",
      // pixel geometry and array indexing name nothing about money
      'const y = H - PAD - (i / n) * (H - PAD * 2);',
      'const next = index + 1;',
    ];
    for (const probe of CAUGHT) {
      expect(domainArithmetic(probe).length, `should be caught: ${probe}`).toBeGreaterThan(0);
    }
    for (const probe of IGNORED) {
      expect(domainArithmetic(probe), `should be ignored: ${probe}`).toEqual([]);
    }
    // and it refuses to score a file it cannot read, rather than passing it
    expect(() => domainArithmetic('const x = price * 1.05;\nfunction ( { oops', 'broken.ts')).toThrow(/could not parse/);
  });

  it('the copy counter is NOT vacuous: it counts real copy and ignores class names, hrefs and dev errors', () => {
    const tsx = `
      import { x } from 'y';
      const C = () => (
        <section class="glass card" id="verdict-h" aria-labelledby="verdict-h">
          <h2 title="Show the maths">Deal verdict</h2>
          <p>{ok ? 'passes' : 'fails'}</p>
          <p>{\`Cash in (incl. \${taxName})\`}</p>
          <a href="/buy-to-let" class="btn primary">Go</a>
          <Tile label="Max price" value={x !== null ? fmt(x) : 'Not reachable'} />
          <select><option value="btl">Buy to let</option></select>
        </section>
      );
      const msg = 'These numbers don’t work together — check the deposit.';
      const sql = 'SELECT id FROM deals WHERE user_id = ?';
      if (!v) throw new Error('Strategy config is missing its verdict threshold');
      console.warn('map failed to render a tile');
    `;
    const got = inlineCopy(tsx);
    expect(got).toContain('Deal verdict');
    expect(got).toContain('Show the maths');
    expect(got).toContain('passes');
    expect(got).toContain('fails');
    expect(got.some((s) => s.includes('Cash in'))).toBe(true);
    expect(got).toContain('Go');
    expect(got).toContain('Max price');
    expect(got).toContain('Not reachable');
    expect(got).toContain('Buy to let');
    expect(got).not.toContain('btl');
    expect(got).toContain('These numbers don’t work together — check the deposit.');
    expect(got.some((s) => /glass card|verdict-h|buy-to-let|btn primary/.test(s))).toBe(false);
    expect(got.some((s) => /SELECT|missing its verdict|failed to render/.test(s))).toBe(false);

    const astro = '---\nconst a = 1;\n---\n<nav aria-label="Main"><a href="/x" class="btn">Analyse a deal</a>{/* a comment with words */}<span>{count}</span></nav>';
    const a = inlineCopyAstro(astro);
    expect(a).toContain('Main');
    expect(a).toContain('Analyse a deal');
    expect(a.some((s) => /comment with words|btn/.test(s))).toBe(false);

    // and the comment stripper: a label inside a comment is not a re-type
    expect(stripComments("// stage 'Offer in'\nconst x = 'y'; /* 'Numbers don’t work' */")).not.toContain('Offer in');
    expect(stripComments("const u = 'https://a/b'; // c")).toContain('https://a/b');
  });
});
