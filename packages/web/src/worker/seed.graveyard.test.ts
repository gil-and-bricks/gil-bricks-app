/**
 * THE SEEDED GRAVEYARD (P9). The seed has to show the operator what the feature
 * really looks like: real deaths with frozen cards, and — because five kills do
 * not yet share a reason — the honest "not enough to see a pattern" line rather
 * than a pattern invented to fill the space.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seedDemoDeals } from './lib/pipeline';
import { GRAVEYARD, GRAVEYARD_COPY, PROGRESS_STAGES, parkReason } from '../config/pipeline';
import { headstones, noPatternYet, patternIn, toDeath, type DeathRowJson } from '../lib/deals/graveyard';
import type { BoardDeal } from '../lib/deals/board';

const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = [
  '0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql',
  '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql',
  '0007_deal_is_auction.sql', '0008_deal_verdict_line.sql', '0012_deal_sold_evidence.sql',
  '0013_deal_changes.sql', '0014_folded_facts_and_room_sizes.sql', '0015_deal_dates_and_staleness.sql',
  '0016_deal_deaths.sql',
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

let sqlite: DatabaseSync;
const boardDeals = (): BoardDeal[] => sqlite.prepare(
  `SELECT d.id, d.strategy, d.title, d.stage, d.current_score, d.status, d.headline_figure, d.verdict_line,
          d.updated_at, s.url_params, s.key_figure,
          COALESCE((SELECT MAX(h.at) FROM deal_stage_history h WHERE h.deal_id = d.id), d.created_at) AS stage_since
     FROM deals d JOIN saved_deals s ON s.id = d.id WHERE d.user_id = 'u1'`,
).all() as unknown as BoardDeal[];
const deaths = () => (sqlite.prepare('SELECT * FROM deal_deaths').all() as unknown as DeathRowJson[]).map(toDeath);

beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run('u1', 'u1@t', 'T', '2026-01-01T00:00:00Z');
  await seedDemoDeals(makeD1(sqlite), 'u1');
});

describe('the graveyard as the seeded board shows it', () => {
  it('every dead deal has a real death: a known reason, a note where one was typed, and a frozen card', () => {
    const stones = headstones(boardDeals(), deaths());
    expect(stones.length).toBeGreaterThanOrEqual(5);
    for (const s of stones) {
      expect(parkReason(s.death?.reason_key ?? ''), s.deal.title).toBeTruthy();
      expect(s.reason).not.toBe('');
      expect(s.snapshot, s.deal.title).not.toBeNull();
      expect(s.snapshot?.score).toBe(s.deal.current_score);
      expect(s.snapshot?.verdictLine).toBe(s.deal.verdict_line);
    }
    expect(stones.some((s) => s.note !== ''), 'at least one carries the line somebody typed').toBe(true);
  });

  it('a killed deal died SOMEWHERE — never after walking the whole board', () => {
    const live = PROGRESS_STAGES.map((s) => s.key);
    for (const s of headstones(boardDeals(), deaths())) {
      expect(live, `${s.deal.title} reached a real stage`).toContain(s.snapshot?.stage);
      expect(s.snapshot?.stage, 'nothing dies at bought-it').not.toBe('bought-it');
    }
  });

  it('says there is not enough to see yet, and states the sample — no invented pattern', () => {
    const stones = headstones(boardDeals(), deaths());
    expect(patternIn(stones), 'no reason has five yet').toBeNull();
    expect(noPatternYet(stones)).toBe(GRAVEYARD_COPY.noPattern(stones.length));
  });

  it('and two more kills on the same reason is all it takes to see one', () => {
    const stones = headstones(boardDeals(), deaths());
    const key = 'refurb-too-high';
    const already = stones.filter((s) => s.death?.reason_key === key).length;
    expect(already).toBe(GRAVEYARD.patternMin - 2);
    // the same shape the board builds, with two live deals killed on that reason
    const more = stones.slice(0, 2).map((s, i) => ({
      ...s,
      at: `2026-12-0${i + 1}T09:00:00Z`,
      death: { ...s.death!, id: `extra-${i}`, reason_key: key, at: `2026-12-0${i + 1}T09:00:00Z` },
    }));
    const p = patternIn([...more, ...stones]);
    expect(p?.reasonKey).toBe(key);
    expect(p?.count).toBe(GRAVEYARD.patternMin);
    expect(p?.line).toContain(parkReason(key)!.pattern);
  });

  it('dead deals never count against the live cap — the memory is free', () => {
    const rows = boardDeals();
    const live = rows.filter((d) => d.status === 'live').length;
    const dead = rows.filter((d) => d.status === 'dead').length;
    expect(dead).toBeGreaterThan(0);
    expect((sqlite.prepare("SELECT COUNT(*) n FROM deals WHERE user_id = 'u1' AND status = 'live'").get() as { n: number }).n).toBe(live);
  });
});
