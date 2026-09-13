// @vitest-environment happy-dom
/**
 * R3 — A TIP IS NEVER REPEATED, and the seen-set survives signing in and out.
 *
 * The library ships empty (the research never arrived), so these drive the
 * machine with FIXTURE cues — clearly not shipped, and named so nobody mistakes
 * them for advice. What is being proved is the mechanism, which is what has to
 * be right before real cues go anywhere near it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefurbCue } from './types';

const FIXTURES: RefurbCue[] = Array.from({ length: 8 }, (_, i) => ({
  key: `fixture-${i}`,
  room: i < 4 ? 'kitchen' : 'any',
  confidence: i === 7 ? 'weak' : i < 2 ? 'conclusive' : 'indicative',
  costItem: 'kitchen',
  regulation: 'fixture-reg',
  basis: 'standard',
  look: `Look for fixture thing ${i}.`,
  means: 'It may mean work is needed; worth checking.',
  caveat: 'Only an inspection can say.',
}));

vi.mock('./library', () => ({
  CUES: FIXTURES,
  REGULATIONS: { 'fixture-reg': { name: 'Fixture', what: 'x', lastChecked: '2026-09-01' } },
  libraryReady: () => true,
}));

const { candidates, exhausted, nextCue } = await import('./select');
const { flushSeen, loadSeen, merge, readLocal, writeLocal } = await import('./seen');

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('which tip comes next', () => {
  it('a tagged room gets its own cues first, then the general ones', () => {
    const rooms = candidates('kitchen').map((c) => c.room);
    expect(rooms.slice(0, 1)).toEqual(['kitchen']);
    expect(rooms).toContain('any');
  });

  it('value order: conclusive first, weak last — weak is barely evidence', () => {
    const conf = candidates(null).map((c) => c.confidence);
    expect(conf[0]).toBe('conclusive');
    expect(conf.at(-1)).toBe('weak');
  });

  it('with no room tagged it still serves, in value order — nothing is detected', () => {
    expect(nextCue(null, new Set(), new Set())).not.toBeNull();
  });

  it('never shows one already seen', () => {
    const seen = new Set(['fixture-0', 'fixture-1']);
    const next = nextCue('kitchen', seen, new Set());
    expect(seen.has(next!.key)).toBe(false);
  });

  it('never shows one already on screen for another photo', () => {
    const first = nextCue('kitchen', new Set(), new Set())!;
    const second = nextCue('kitchen', new Set(), new Set([first.key]))!;
    expect(second.key).not.toBe(first.key);
  });

  it('BY THE TENTH DEAL the same five tips are not coming back', () => {
    const seen = new Set<string>();
    const everShown: string[] = [];
    for (let deal = 0; deal < 10; deal++) {
      const thisDeal = new Set<string>();
      for (let photo = 0; photo < 3; photo++) {
        const cue = nextCue('kitchen', seen, thisDeal);
        if (cue === null) continue;
        thisDeal.add(cue.key);
        seen.add(cue.key);
        everShown.push(cue.key);
      }
    }
    // every tip the person was ever shown was shown exactly once
    expect(new Set(everShown).size).toBe(everShown.length);
  });

  it('and when they run out it says so, rather than recycling silently', () => {
    const seen = new Set(FIXTURES.map((c) => c.key));
    expect(nextCue('kitchen', seen, new Set())).toBeNull();
    expect(exhausted('kitchen', seen)).toBe(true);
  });
});

describe('the seen-set survives signing out and in', () => {
  it('what was seen signed OUT is kept locally', () => {
    writeLocal(new Set(['a', 'b']));
    expect([...readLocal()].sort()).toEqual(['a', 'b']);
  });

  it('signing in MERGES both halves — neither is lost', async () => {
    writeLocal(new Set(['local-1', 'local-2']));
    const { seen, fromServer } = await loadSeen(async () => ['server-1', 'local-1']);
    expect(fromServer).toBe(true);
    expect([...seen].sort()).toEqual(['local-1', 'local-2', 'server-1']);
    // and the merged set is written back, so the halves stay in step
    expect([...readLocal()].sort()).toEqual(['local-1', 'local-2', 'server-1']);
  });

  it('signed out, or when the server is unreachable, the local half still works', async () => {
    writeLocal(new Set(['local-1']));
    const { seen, fromServer } = await loadSeen(async () => { throw new Error('offline'); });
    expect(fromServer).toBe(false);
    expect([...seen]).toEqual(['local-1']);
  });

  it('a tip seen on EITHER side is never shown again', () => {
    const merged = merge(new Set(['a']), new Set(['b']));
    expect(nextCue(null, new Set(['fixture-0']), new Set())!.key).not.toBe('fixture-0');
    expect([...merged].sort()).toEqual(['a', 'b']);
  });

  it('storage being blocked never breaks anything', () => {
    const boom = () => { throw new Error('blocked'); };
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get: boom });
    try {
      expect(readLocal().size).toBe(0);
      expect(() => writeLocal(new Set(['x']))).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});

describe('it is read once and written once', () => {
  it('the whole session is ONE server read', async () => {
    const reads = vi.fn(async () => ['a']);
    await loadSeen(reads);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('and ONE batched write, carrying only what was added', async () => {
    const sent: string[][] = [];
    const push = vi.fn(async (keys: string[]) => { sent.push([...keys]); });
    await flushSeen(new Set(['new-1', 'new-2']), new Set(['old', 'new-1', 'new-2']), push);
    expect(push).toHaveBeenCalledTimes(1);
    expect(sent[0].sort()).toEqual(['new-1', 'new-2']);
  });

  it('nothing new means no request at all', async () => {
    const push = vi.fn(async () => {});
    await flushSeen(new Set(), new Set(['old']), push);
    expect(push).not.toHaveBeenCalled();
  });

  it('a failed write still keeps the local half, so nothing repeats next session', async () => {
    await flushSeen(new Set(['x']), new Set(['x']), async () => { throw new Error('500'); });
    expect([...readLocal()]).toEqual(['x']);
  });
});
