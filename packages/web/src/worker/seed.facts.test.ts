import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seedDemoDeals } from './lib/pipeline';
import { applyFacts, type DealFact } from '../lib/deals/facts';
import { scoreFromParams } from '../lib/deals/scoreFromParams';
import { features } from '../config/features';

/**
 * The seed gains realistic facts (P5) — and a seeded card must say exactly what
 * its own analyser says WITH those facts applied. Test data that lies costs the
 * operator hours chasing a phantom bug, so this asserts the whole seed, not a
 * sample.
 */
const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = [
  '0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql',
  '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql',
  '0007_deal_is_auction.sql', '0008_deal_verdict_line.sql', '0012_deal_sold_evidence.sql',
];

function makeD1(sqlite: DatabaseSync): D1Database {
  const prepare = (sql: string) => {
    let bound: unknown[] = [];
    const api: Record<string, unknown> = {
      bind(...v: unknown[]) { bound = v; return api; },
      async first<T>() { return (sqlite.prepare(sql).get(...(bound as never[])) ?? null) as T | null; },
      async all<T>() { return { results: sqlite.prepare(sql).all(...(bound as never[])) as T[] }; },
      async run() { const i = sqlite.prepare(sql).run(...(bound as never[])); return { success: true, meta: { changes: Number(i.changes) } }; },
    };
    return api;
  };
  return { prepare, async batch(sts: { run: () => Promise<unknown> }[]) { return Promise.all(sts.map((s) => s.run())); } } as unknown as D1Database;
}

interface Row { id: string; strategy: string; current_score: number; headline_figure: string; verdict_line: string; url_params: string }

let sqlite: DatabaseSync;
const deals = (): Row[] => sqlite.prepare(
  'SELECT d.id, d.strategy, d.current_score, d.headline_figure, d.verdict_line, s.url_params FROM deals d JOIN saved_deals s ON s.id = d.id',
).all() as unknown as Row[];
const factsOf = (dealId: string): DealFact[] => (sqlite.prepare('SELECT * FROM deal_facts WHERE deal_id = ? ORDER BY entered_at').all(dealId) as { id: string; deal_id: string; fact_type: string; value_json: string; entered_at: string }[])
  .map((r) => ({ id: r.id, deal_id: r.deal_id, fact_type: r.fact_type, ...JSON.parse(r.value_json) as { value: number | null; note: string | null }, entered_at: r.entered_at }));

const fresh = (): D1Database => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run('u1', 'u1@t', 'T', '2026-01-01T00:00:00Z');
  return makeD1(sqlite);
};

afterEach(() => { features.dealFacts = true; });

beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run('u1', 'u1@t', 'T', '2026-01-01T00:00:00Z');
  await seedDemoDeals(makeD1(sqlite), 'u1');
});

describe('the seed carries facts, and its cards tell the truth about them', () => {
  it('some deals have facts and some have none — a real board, not a demo of one', () => {
    const withFacts = deals().filter((d) => factsOf(d.id).length > 0);
    expect(withFacts.length).toBeGreaterThanOrEqual(3);
    expect(withFacts.length).toBeLessThan(deals().length);
  });

  it('every seeded card shows the FACT-CORRECTED score, not the original guess', () => {
    for (const d of deals()) {
      const expected = scoreFromParams(d.strategy, applyFacts(d.strategy, d.url_params, factsOf(d.id)));
      expect(d.current_score, d.id).toBe(expected.score);
      expect(d.headline_figure, d.id).toBe(expected.figure);
      expect(d.verdict_line, d.id).toBe(expected.verdict);
    }
  });

  it('a deal with a fact really did move — otherwise the seed proves nothing', () => {
    const moved = deals().filter((d) => {
      const f = factsOf(d.id);
      return f.length > 0 && scoreFromParams(d.strategy, applyFacts(d.strategy, d.url_params, f)).score !== scoreFromParams(d.strategy, d.url_params).score;
    });
    expect(moved.length).toBeGreaterThanOrEqual(2);
  });

  it('every fact is a real fact type, dated inside the deal’s own life, and removable', () => {
    for (const d of deals()) {
      const created = Date.parse((sqlite.prepare('SELECT created_at c FROM deals WHERE id = ?').get(d.id) as { c: string }).c);
      for (const f of factsOf(d.id)) {
        expect(f.id, 'a seeded fact must be deletable through the route').toMatch(/^[0-9a-f-]{36}$/);
        expect(Date.parse(f.entered_at), f.fact_type).toBeGreaterThanOrEqual(created);
        expect(Date.parse(f.entered_at), f.fact_type).toBeLessThanOrEqual(Date.now() + 1000);
      }
    }
  });

  it('the verdict history is complete: one snapshot when it was born, one per fact', () => {
    for (const d of deals()) {
      const snaps = sqlite.prepare('SELECT score FROM deal_verdicts WHERE deal_id = ? ORDER BY at, rowid').all(d.id) as { score: number }[];
      expect(snaps.length, d.id).toBe(1 + factsOf(d.id).length);
      expect(snaps[0].score, d.id).toBe(scoreFromParams(d.strategy, d.url_params).score);
      expect(snaps[snaps.length - 1].score, d.id).toBe(d.current_score);
    }
  });

  it('with the flag off the seed carries no facts, and every card matches its own analyser', async () => {
    features.dealFacts = false;
    const db = fresh();
    await seedDemoDeals(db, 'u1');
    expect((sqlite.prepare('SELECT COUNT(*) n FROM deal_facts').get() as { n: number }).n).toBe(0);
    for (const d of deals()) expect(d.current_score, d.id).toBe(scoreFromParams(d.strategy, d.url_params).score);
  });

  it('no seeded deal is older than its own newest fact', () => {
    for (const d of deals()) {
      const f = factsOf(d.id);
      if (f.length === 0) continue;
      const updated = (sqlite.prepare('SELECT updated_at u FROM deals WHERE id = ?').get(d.id) as { u: string }).u;
      expect(Date.parse(updated), d.id).toBeGreaterThanOrEqual(Date.parse(f[f.length - 1].entered_at));
    }
  });

  it('the seed says honestly that it has no sold evidence, so no card carries the warning', () => {
    for (const d of deals()) {
      const ev = (sqlite.prepare('SELECT sold_evidence e FROM deals WHERE id = ?').get(d.id) as { e: string | null }).e;
      expect(ev, d.id).toBe('null'); // known to be none — never SQL NULL, which means "we don't know"
    }
  });

  it('the walkthrough deal is untouched: a BRRRR that still assumes £30,000', () => {
    const brrrr = deals().find((d) => d.strategy === 'brrrr' && d.url_params.includes('CF11'));
    expect(brrrr?.url_params).toContain('refurbCost=30000');
    expect(factsOf(brrrr?.id ?? '')).toEqual([]);
  });
});
