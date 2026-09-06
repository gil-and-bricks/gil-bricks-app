/**
 * The dev seed must not lie (D2). A card's score, figure and verdict have to be
 * what the analyser it links to produces — test data that disagrees costs hours
 * chasing a phantom bug.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scoreFromParams } from '../lib/deals/scoreFromParams';

const src = readFileSync(fileURLToPath(new URL('./lib/pipeline.ts', import.meta.url)), 'utf8');
const block = /const DEV_SEED_SPECS[\s\S]*?\n\];/.exec(src)?.[0] ?? '';
const specs = Array.from(block.matchAll(/strategy: '(\w+)'[\s\S]*?params: '([^']+)'/g)).map((m) => ({ strategy: m[1], params: m[2] }));

describe('the dev seed is scored by the engine', () => {
  it('has fifteen deals, each with real params — nine live, one bought, five killed', () => {
    expect(specs.length).toBe(15);
    for (const s of specs) expect(s.params).toContain('postcode=');
  });

  it('no score, figure or verdict is hand-written in the seed', () => {
    expect(block).not.toMatch(/score: \d/);
    expect(block).not.toMatch(/verdict: '/);
    expect(block).not.toMatch(/figure: '/);
  });

  it('every seeded deal scores, and its verdict is the engine’s own sentence', () => {
    for (const s of specs) {
      const out = scoreFromParams(s.strategy, s.params);
      expect(out.score, s.params).toBeGreaterThanOrEqual(0);
      expect(out.score, s.params).toBeLessThanOrEqual(10);
      expect(out.verdict.length, s.params).toBeGreaterThan(10);
      expect(out.figure.length, s.params).toBeGreaterThan(0);
    }
  });

  it('the board shows a real spread — greens, ambers and reds', () => {
    const scores = specs.map((s) => scoreFromParams(s.strategy, s.params).score);
    expect(scores.some((n) => n >= 8), 'at least one strong deal').toBe(true);
    expect(scores.some((n) => n >= 5 && n < 8), 'at least one marginal deal').toBe(true);
    expect(scores.some((n) => n < 5), 'at least one bad deal').toBe(true);
  });

  it('is reproducible: the same params always give the same answer', () => {
    for (const s of specs) {
      expect(scoreFromParams(s.strategy, s.params)).toEqual(scoreFromParams(s.strategy, s.params));
    }
  });
});
