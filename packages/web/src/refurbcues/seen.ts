/**
 * R3 — WHAT THIS PERSON HAS ALREADY BEEN TOLD.
 *
 * THE RULE: a tip is never repeated, across sessions and across properties.
 * That means the set has to outlive the tab, follow the person between deals,
 * and survive signing out and back in.
 *
 * WHERE IT LIVES, and why both:
 *   - SIGNED IN  → D1, because it must follow them to another device.
 *   - SIGNED OUT → localStorage, because there is nowhere else and losing it
 *                  would mean repeating tips to someone who is simply not
 *                  signed in yet.
 *   - ON SIGN-IN → the two are MERGED, so nothing seen while signed out comes
 *                  back afterwards.
 *
 * HOW IT IS READ AND WRITTEN, which the brief was specific about: the set is
 * read ONCE per session and written ONCE in a batch at the end. A read per
 * photo, or a write per tip, would be a request every few seconds from every
 * user — the free tier would survive it and it would still be wrong.
 */
const KEY = 'gb.refurbcues.seen.v1';

/** Read the local half. Never throws: storage can be blocked or full. */
export function readLocal(): Set<string> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    const parsed = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeLocal(seen: ReadonlySet<string>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // A full or blocked store must never break the carousel.
  }
}

/**
 * The merge. Union, always — a tip seen on either side has been seen. Taking
 * only the server's set would repeat everything seen while signed out; taking
 * only the local set would forget what another device already showed.
 */
export function merge(a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> {
  return new Set([...a, ...b]);
}

/**
 * The whole session's seen-set, read ONCE. The caller holds it for the session
 * and adds to it in memory; nothing else reads storage again.
 */
export async function loadSeen(
  fetchServer: () => Promise<string[] | null>,
): Promise<{ seen: Set<string>; fromServer: boolean }> {
  const local = readLocal();
  let server: string[] | null = null;
  try {
    server = await fetchServer();
  } catch {
    server = null;
  }
  if (server === null) return { seen: local, fromServer: false };
  const merged = merge(local, new Set(server));
  // Signing in must not lose what was seen signed out, so the merged set is
  // written back locally too — the two halves stay in step from here.
  writeLocal(merged);
  return { seen: merged, fromServer: true };
}

/**
 * Persist what was added during this session, in ONE batch. Called on unload
 * and when the section closes — never per tip.
 */
export async function flushSeen(
  added: ReadonlySet<string>,
  all: ReadonlySet<string>,
  pushServer: ((keys: string[]) => Promise<void>) | null,
): Promise<void> {
  if (added.size === 0) return;
  writeLocal(all);
  if (pushServer === null) return;
  try {
    await pushServer([...added]);
  } catch {
    // The local half already has it; the server catches up next session.
  }
}
