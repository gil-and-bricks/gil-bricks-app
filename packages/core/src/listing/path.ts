/**
 * Dot-path resolver used to read config-driven field paths out of a parsed
 * model (e.g. "prices.primaryPrice"). Config carries the PATHS (data); this is
 * the LOGIC (stays in the package, per the MV3 rule). Array indices allowed:
 * "floorplans.0.url".
 */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
