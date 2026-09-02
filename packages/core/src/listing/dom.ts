/**
 * DOM/script-tag reading helpers (E5). Everything here reads from a Document the
 * caller already has — the page the user opened, in the extension's ISOLATED
 * world. We read the SERIALISED data out of <script> tag text (never by touching
 * the page's `window.__PAGE_MODEL` / `self.__next_f`, which live in the main
 * world we deliberately don't enter). The parsing LOGIC lives here in the
 * package; only paths/selectors come from remote config.
 */

/** All inline <script> tag text contents on the page. */
export function scriptTexts(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('script')).map((s) => s.textContent ?? '');
}

// ---- Rightmove: window.__PAGE_MODEL (flatted serialisation) ----

/** Resolve a `flatted`-serialised registry back into the real object graph. */
export function unflatten(registry: unknown[]): Record<string, unknown> {
  const resolved = new Map<number, unknown>();
  const rebuild = (idx: unknown): unknown => {
    if (typeof idx !== 'number') return idx;
    if (resolved.has(idx)) return resolved.get(idx);
    const v = registry[idx];
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      resolved.set(idx, out);
      for (const r of v) out.push(rebuild(r));
      return out;
    }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      resolved.set(idx, out);
      for (const [k, r] of Object.entries(v as Record<string, unknown>)) out[k] = rebuild(r);
      return out;
    }
    resolved.set(idx, v);
    return v;
  };
  return rebuild(0) as Record<string, unknown>;
}

/** Brace-match the object literal following `window.__PAGE_MODEL =` in a script. */
function braceMatchAfter(src: string, fromIndex: number): string | null {
  let i = fromIndex;
  while (i < src.length && src[i] !== '{') i++;
  if (src[i] !== '{') return null;
  const start = i;
  let depth = 0;
  let instr = false;
  let esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (instr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') instr = false;
    } else if (c === '"') instr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

/** Pull Rightmove's propertyData (unflattened), or null if absent/unparseable. */
export function getRightmovePageModel(doc: Document): Record<string, unknown> | null {
  const script = scriptTexts(doc).find((t) => t.includes('window.__PAGE_MODEL'));
  if (!script) return null;
  const at = script.indexOf('window.__PAGE_MODEL');
  const eq = script.indexOf('=', at);
  if (eq < 0) return null;
  const objText = braceMatchAfter(script, eq + 1);
  if (!objText) return null;
  try {
    const outer = JSON.parse(objText) as { data?: string };
    if (typeof outer.data !== 'string') return null;
    const root = unflatten(JSON.parse(outer.data) as unknown[]);
    const pd = (root as Record<string, unknown>).propertyData;
    return pd && typeof pd === 'object' ? (pd as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---- Zoopla: self.__next_f flight chunks ----

/** Concatenate the React-Flight text chunks from `self.__next_f.push([1,"…"])`.
 * Bracket-scans the `[...]` argument (respecting string escapes) rather than a
 * non-greedy regex, so a literal "])" inside a string value can't truncate the
 * chunk to invalid JSON and silently drop the whole listing model. */
export function decodeZooplaFlight(doc: Document): string {
  const marker = 'self.__next_f.push(';
  const parts: string[] = [];
  for (const text of scriptTexts(doc)) {
    if (!text.includes('__next_f')) continue;
    let idx = 0;
    while ((idx = text.indexOf(marker, idx)) !== -1) {
      let j = idx + marker.length;
      while (j < text.length && text[j] !== '[') j++;
      if (text[j] !== '[') { idx += marker.length; continue; }
      let arrText: string;
      try {
        arrText = scanValue(text, j);
      } catch {
        idx += marker.length;
        continue;
      }
      try {
        const arr = JSON.parse(arrText) as unknown[];
        if (arr.length > 1 && typeof arr[1] === 'string') parts.push(arr[1]);
      } catch {
        /* skip non-JSON pushes */
      }
      idx = j + arrText.length;
    }
  }
  return parts.join('');
}

/** Balanced-scan the value token that starts at `j` in `s`. */
function scanValue(s: string, j: number): string {
  const c = s[j];
  if (c === '{' || c === '[') {
    const open = c;
    const close = c === '{' ? '}' : ']';
    let depth = 0;
    let instr = false;
    let esc = false;
    for (let k = j; k < s.length; k++) {
      const ch = s[k];
      if (instr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') instr = false;
      } else if (ch === '"') instr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return s.slice(j, k + 1);
      }
    }
    throw new Error('unbalanced');
  }
  if (c === '"') {
    let esc = false;
    for (let k = j + 1; k < s.length; k++) {
      const ch = s[k];
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') return s.slice(j, k + 1);
    }
    throw new Error('unterminated');
  }
  let k = j;
  while (k < s.length && !',}]'.includes(s[k])) k++;
  return s.slice(j, k).trim();
}

/** Value of the FIRST occurrence of `"key"` in a flight/JSON string, parsed. */
export function valueAfter(s: string, key: string): unknown {
  const i = s.indexOf(`"${key}"`);
  if (i < 0) return undefined;
  let j = s.indexOf(':', i) + 1;
  if (j <= 0) return undefined;
  while (s[j] === ' ' || s[j] === '\n') j++;
  try {
    return JSON.parse(scanValue(s, j));
  } catch {
    return undefined;
  }
}

// ---- fallback sources (ld+json, OpenGraph/meta) ----

/** Parsed `application/ld+json` objects, optionally filtered by @type. */
export function getLdJson(doc: Document, type?: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  for (const el of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const d = JSON.parse(el.textContent ?? '');
      for (const obj of Array.isArray(d) ? d : [d]) {
        if (obj && (!type || obj['@type'] === type)) out.push(obj);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

/** <meta property="og:x"> or <meta name="x"> content. */
export function getMeta(doc: Document, key: string): string | undefined {
  const el =
    doc.querySelector(`meta[property="${key}"]`) ?? doc.querySelector(`meta[name="${key}"]`);
  const c = el?.getAttribute('content');
  return c && c.trim() ? c.trim() : undefined;
}
