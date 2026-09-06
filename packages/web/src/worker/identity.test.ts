import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from './index';
import { SESSION_COOKIE } from './lib/cookies';
import { signSession } from './lib/jwt';
import { features } from '../config/features';

/**
 * STABLE DEAL IDENTITY (P5.1).
 *
 * A deal used to be identified by (user, strategy, url_params), so re-saving a
 * deal whose numbers had changed created a SECOND card — and after a fact the
 * numbers ALWAYS differ. The board's card link now carries the deal's own id and
 * the analyser sends it back, so a re-save updates the deal it came from and
 * keeps its stage and its whole history.
 */
const MIG = (n: string) => readFileSync(fileURLToPath(new URL(`../../migrations/${n}`, import.meta.url)), 'utf8');
const MIGRATIONS = [
  '0001_init.sql', '0002_outbox_action.sql', '0003_deals_idempotent_outbox_backoff.sql',
  '0004_deals_key_includes_strategy.sql', '0005_deal_pipeline.sql', '0006_deal_headline_figure.sql',
  '0007_deal_is_auction.sql', '0008_deal_verdict_line.sql', '0012_deal_sold_evidence.sql', '0013_deal_changes.sql', '0014_folded_facts_and_room_sizes.sql', '0015_deal_dates_and_staleness.sql',
];

function makeD1(sqlite: DatabaseSync): Env['DB'] {
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
  return { prepare, async batch(sts: { run: () => Promise<unknown> }[]) { return Promise.all(sts.map((s) => s.run())); } } as unknown as Env['DB'];
}

let sqlite: DatabaseSync;
const env = (): Env => ({ ASSETS: { fetch: async () => new Response('a') }, DB: makeD1(sqlite), JWT_SECRET: 'test-secret', GOOGLE_CLIENT_SECRET: 'x', TURNSTILE_SECRET: 'x', KIT_API_KEY: 'k' }) as Env;
const authed = async (user = 'u1') => ({ Cookie: `${SESSION_COOKIE}=${await signSession({ sub: user, email: `${user}@t.test`, name: 'T', avatar: '' }, 'test-secret')}` });

const BASE = {
  strategy: 'btl', title: 'Terraced · CF37 1HR · £150,000',
  url_params: 'postcode=CF37+1HR&paon=12&price=150000&type=T&rent=1200&refurbCost=30000',
  key_figure: 'ROI 8%', headline_figure: '£250/mo', verdict_line: 'Cashflows £250 a month after tax.',
  score: 7.2, criteria_json: '{"minRoi":8}', evidence_json: '{}', postcode_sector: 'CF37 1', source: 'analyser',
  sold_evidence: '{"estimate":157500,"high":172500}',
};
const save = async (headers: Record<string, string>, over: Record<string, unknown> = {}) =>
  worker.fetch(new Request('https://s.test/api/deals', {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ ...BASE, ...over }),
  }), env());
const count = (t: string, where = '') => (sqlite.prepare(`SELECT COUNT(*) n FROM ${t} ${where}`).get() as { n: number }).n;
const deal = () => sqlite.prepare('SELECT * FROM deals').get() as Record<string, unknown>;

/** The same deal after a builder's quote: the analyser's params, one number changed. */
const CORRECTED = BASE.url_params.replace('refurbCost=30000', 'refurbCost=48000');

beforeEach(() => {
  features.dealPipeline = true;
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) sqlite.exec(MIG(m));
  for (const u of ['u1', 'u2']) {
    sqlite.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').run(u, `${u}@t`, u, '2026-01-01T00:00:00Z');
  }
});
afterEach(() => { features.dealPipeline = true; });

describe('re-saving a deal opened from its own card', () => {
  it('updates the one deal — new figures, original stage and history intact', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string };
    // it has moved on since: two stages and a history to lose
    await worker.fetch(new Request(`https://s.test/api/deals/${first.id}/stage`, {
      method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ stage: 'offer-in' }),
    }), env());
    expect(count('deal_stage_history')).toBe(2);

    const second = await (await save(h, {
      deal_id: first.id, url_params: CORRECTED, headline_figure: '£180/mo',
      verdict_line: 'Cashflows £180 a month after tax.', score: 6.4, key_figure: 'ROI 6%',
    })).json() as { id: string; updated: boolean };

    expect(second.id).toBe(first.id);
    expect(second.updated).toBe(true);
    expect(count('deals'), 'exactly one card').toBe(1);
    expect(count('saved_deals')).toBe(1);
    const d = deal();
    expect(d.stage, 'the stage it had reached').toBe('offer-in');
    expect(d.current_score).toBe(6.4);
    expect(d.headline_figure).toBe('£180/mo');
    expect(d.verdict_line).toBe('Cashflows £180 a month after tax.');
    // the analyser's new numbers are what re-opening it now shows
    expect((sqlite.prepare('SELECT url_params u FROM saved_deals').get() as { u: string }).u).toBe(CORRECTED);
    // history kept, and the re-save added its own verdict snapshot
    expect(count('deal_stage_history')).toBe(2);
    expect(count('deal_verdicts')).toBe(2);
    expect((sqlite.prepare('SELECT created_at c FROM deals').get() as { c: string }).c).toBeTruthy();
  });

  it('WITHOUT the id it still forks — so the id is what fixes it', async () => {
    const h = await authed();
    await save(h);
    await save(h, { url_params: CORRECTED });
    expect(count('deals')).toBe(2);
  });

  it('ignores an id that is not yours, and never touches that deal', async () => {
    const mine = await (await save(await authed())).json() as { id: string };
    const theirs = await (await save(await authed('u2'), { url_params: 'postcode=SA1+6HW&price=99000&type=T&rent=800' })).json() as { id: string };
    // u1 claims u2's deal
    const res = await (await save(await authed(), { deal_id: theirs.id, url_params: CORRECTED })).json() as { id: string };
    expect(res.id).not.toBe(theirs.id);
    expect(res.id).not.toBe(mine.id); // params differ and the id was refused: a new deal
    expect((sqlite.prepare('SELECT user_id FROM deals WHERE id = ?').get(theirs.id) as { user_id: string }).user_id).toBe('u2');
    expect((sqlite.prepare('SELECT url_params u FROM saved_deals WHERE id = ?').get(theirs.id) as { u: string }).u).toBe('postcode=SA1+6HW&price=99000&type=T&rent=800');
  });

  it('will not overwrite the deal when the analyser is pointed at a DIFFERENT property', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string };
    await worker.fetch(new Request(`https://s.test/api/deals/${first.id}/stage`, {
      method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ stage: 'offer-in' }),
    }), env());
    // same page, same tab, a completely different address typed in
    const other = await (await save(h, {
      deal_id: first.id, title: 'Semi · SA1 6HW · £320,000',
      url_params: 'postcode=SA1+6HW&price=320000&type=S&rent=1800&refurbCost=0', postcode_sector: 'SA1 6',
    })).json() as { id: string };
    expect(other.id).not.toBe(first.id);
    expect(count('deals'), 'the deal they came from survives').toBe(2);
    const kept = sqlite.prepare('SELECT title, stage FROM deals WHERE id = ?').get(first.id) as { title: string; stage: string };
    expect(kept.title).toBe(BASE.title);
    expect(kept.stage).toBe('offer-in');
    expect((sqlite.prepare('SELECT url_params u FROM saved_deals WHERE id = ?').get(first.id) as { u: string }).u).toBe(BASE.url_params);
  });

  it('a NAMED flat still updates in place — the P5.1 promise holds for flats', async () => {
    const h = await authed();
    const flat = 'postcode=CF10+1AA&paon=12&saon=Flat+2&price=135000&type=F&rent=1100&refurbCost=30000';
    const first = await (await save(h, { url_params: flat })).json() as { id: string };
    const again = await (await save(h, {
      deal_id: first.id, url_params: flat.replace('refurbCost=30000', 'refurbCost=48000'), score: 6.1,
    })).json() as { id: string; updated: boolean };
    expect(again.id).toBe(first.id);
    expect(again.updated).toBe(true);
    expect(count('deals')).toBe(1);
  });

  it('a flat whose number the FORM dropped still updates in place', async () => {
    // There is no flat-number input on the analyser: the only way to arrive
    // without one is our own form having cleared it. The building and the id
    // still name the property, so refusing would fork a deal we can identify.
    const h = await authed();
    const flat = 'postcode=CF10+1AA&paon=12&saon=Flat+2&price=135000&type=F&rent=1100';
    const first = await (await save(h, { url_params: flat })).json() as { id: string };
    const res = await (await save(h, { deal_id: first.id, url_params: 'postcode=CF10+1AA&paon=12&price=150000&type=F&rent=1200' })).json() as { id: string; updated: boolean };
    expect(res.id).toBe(first.id);
    expect(res.updated).toBe(true);
    expect(count('deals')).toBe(1);
  });

  it('but a DIFFERENT flat named at the same building is a different deal', async () => {
    const h = await authed();
    const flat = 'postcode=CF10+1AA&paon=12&saon=Flat+2&price=135000&type=F&rent=1100';
    const first = await (await save(h, { url_params: flat })).json() as { id: string };
    const res = await (await save(h, { deal_id: first.id, url_params: flat.replace('Flat+2', 'Flat+5') })).json() as { id: string };
    expect(res.id).not.toBe(first.id);
    expect(count('deals')).toBe(2);
  });

  it('a different flat at the SAME postcode is a different deal', async () => {
    const h = await authed();
    const flat2 = await (await save(h, { url_params: 'postcode=CF10+1AA&paon=12&saon=Flat+2&price=135000&type=F&rent=1100' })).json() as { id: string };
    const res = await (await save(h, {
      deal_id: flat2.id, title: 'Flat · CF10 1AA · £150,000',
      url_params: 'postcode=CF10+1AA&paon=12&saon=Flat+5&price=150000&type=F&rent=1200',
    })).json() as { id: string };
    expect(res.id).not.toBe(flat2.id);
    expect(count('deals')).toBe(2);
    expect((sqlite.prepare('SELECT url_params u FROM saved_deals WHERE id = ?').get(flat2.id) as { u: string }).u).toContain('Flat+2');
  });

  it('REFUSES to match when neither side names the property (P7)', async () => {
    const h = await authed();
    const noNumber = 'postcode=CF37+1HR&price=150000&type=T&rent=1200&refurbCost=30000';
    const first = await (await save(h, { url_params: noNumber })).json() as { id: string };
    // the same postcode, no house number anywhere: two properties are
    // indistinguishable, so the save makes a NEW deal rather than guessing
    const res = await (await save(h, { deal_id: first.id, url_params: noNumber.replace('price=150000', 'price=185000') })).json() as { id: string; updated: boolean };
    expect(res.id).not.toBe(first.id);
    expect(res.updated).toBe(false);
    expect(count('deals')).toBe(2);
    expect((sqlite.prepare('SELECT url_params u FROM saved_deals WHERE id = ?').get(first.id) as { u: string }).u).toBe(noNumber);
  });

  it('adding a house number to a deal that never had one is a NEW deal, not an overwrite', async () => {
    const h = await authed();
    const noNumber = 'postcode=CF37+1HR&price=150000&type=T&rent=1200';
    const first = await (await save(h, { url_params: noNumber })).json() as { id: string };
    const again = await (await save(h, { deal_id: first.id, url_params: `${noNumber}&paon=31` })).json() as { id: string };
    expect(again.id).not.toBe(first.id);
    expect(count('deals')).toBe(2);
  });

  it('a named property still updates in place, however much the numbers move', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string };
    const again = await (await save(h, { deal_id: first.id, url_params: CORRECTED, score: 6.4 })).json() as { id: string; updated: boolean };
    expect(again.id).toBe(first.id);
    expect(again.updated).toBe(true);
    expect(count('deals')).toBe(1);
  });

  it('the same postcode written differently is still the same property', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string };
    const again = await (await save(h, { deal_id: first.id, url_params: 'postcode=cf37+1hr&paon=12&price=150000&type=T&rent=1200&refurbCost=48000' })).json() as { id: string };
    expect(again.id).toBe(first.id);
    expect(count('deals')).toBe(1);
  });

  it('ignores an id belonging to the same property under a DIFFERENT strategy', async () => {
    const h = await authed();
    const btl = await (await save(h)).json() as { id: string };
    const flip = await (await save(h, { strategy: 'flip', url_params: 'postcode=CF37+1HR&price=150000&type=T&gdv=230000' })).json() as { id: string };
    expect(flip.id).not.toBe(btl.id);
    // saving the flip while claiming the BTL's id must not merge them
    const again = await (await save(h, { strategy: 'flip', deal_id: btl.id, url_params: 'postcode=CF37+1HR&price=150000&type=T&gdv=240000' })).json() as { id: string };
    expect(again.id).not.toBe(btl.id);
    expect((sqlite.prepare('SELECT strategy FROM deals WHERE id = ?').get(btl.id) as { strategy: string }).strategy).toBe('btl');
  });

  it('merges onto the row that already holds those exact numbers, never breaking the unique key', async () => {
    const h = await authed();
    const a = await (await save(h)).json() as { id: string };
    const b = await (await save(h, { url_params: CORRECTED })).json() as { id: string }; // the accidental twin
    expect(count('deals')).toBe(2);
    // now re-save deal A with B's exact params, carrying A's id
    const res = await (await save(h, { deal_id: a.id, url_params: CORRECTED })).json() as { id: string };
    expect(res.id).toBe(b.id); // the row that already holds these numbers wins
    expect(count('deals')).toBe(2); // and nothing new was created
  });

  it('a deal still cannot be born from anything but an analyser payload', async () => {
    const h = await authed();
    // a body with an id but no analyser payload is refused outright
    const res = await worker.fetch(new Request('https://s.test/api/deals', {
      method: 'POST', headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({ deal_id: '11111111-1111-4111-8111-111111111111', strategy: 'btl', title: 'Typed in by hand' }),
    }), env());
    expect(res.status).toBe(400);
    expect(count('deals')).toBe(0);
  });
});

describe('with the pipeline flag OFF nothing about identity changes', () => {
  beforeEach(() => { features.dealPipeline = false; });
  afterEach(() => { features.dealPipeline = true; });

  it('the flat list still keys on the params, and an id cannot fake an update', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string; updated?: boolean };
    // same params: an update, as always
    expect((await (await save(h)).json() as { updated: boolean }).updated).toBe(true);
    expect(count('saved_deals')).toBe(1);
    // different params + the id: the flat list has no board, so it is a NEW row,
    // and the original row's numbers are left exactly as they were
    const second = await (await save(h, { deal_id: first.id, url_params: CORRECTED })).json() as { id: string };
    expect(second.id).not.toBe(first.id);
    expect(count('saved_deals')).toBe(2);
    expect((sqlite.prepare('SELECT url_params u FROM saved_deals WHERE id = ?').get(first.id) as { u: string }).u).toBe(BASE.url_params);
  });
});

describe('a re-save folds the corrections into the numbers', () => {
  const addFact = async (h: Record<string, string>, id: string, factType: string, value: number | null) =>
    worker.fetch(new Request(`https://s.test/api/deals/${id}/facts`, {
      method: 'POST', headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({ fact_type: factType, value }),
    }), env());

  beforeEach(() => { features.dealFacts = true; });

  it('a fact that moved the numbers is MARKED folded — kept, but no longer applied', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string };
    await addFact(h, first.id, 'survey-finding', 6000); // an ADD: double counting would show here
    expect(count('deal_facts')).toBe(1);
    // the analyser is opened on the corrected numbers and saved
    const res = await (await save(h, { deal_id: first.id, url_params: BASE.url_params.replace('refurbCost=30000', 'refurbCost=36000') })).json() as { foldedFacts: number };
    expect(res.foldedFacts).toBe(1);
    // NOTHING is destroyed: the fact and the note the person typed are still there
    expect(count('deal_facts')).toBe(1);
    expect((sqlite.prepare('SELECT folded_at f FROM deal_facts').get() as { f: string | null }).f).toBeTruthy();
    expect(count('deals')).toBe(1);
    expect(count('deal_verdicts')).toBeGreaterThanOrEqual(2);
  });

  it('a fact that changed no number is not folded — it was never in them', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string };
    await addFact(h, first.id, 'covenant', null);
    await addFact(h, first.id, 'builder-quote', 48000);
    expect(count('deal_facts')).toBe(2);
    await save(h, { deal_id: first.id, url_params: CORRECTED });
    const left = sqlite.prepare('SELECT fact_type, folded_at FROM deal_facts ORDER BY fact_type').all() as { fact_type: string; folded_at: string | null }[];
    expect(left.find((f) => f.fact_type === 'covenant')?.folded_at).toBeNull();
    expect(left.find((f) => f.fact_type === 'builder-quote')?.folded_at).toBeTruthy();
  });

  it('a fact entered AFTER the page was opened is not folded — it was never in those numbers', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string };
    await addFact(h, first.id, 'builder-quote', 48000);
    const openedAt = (sqlite.prepare('SELECT entered_at e FROM deal_facts').get() as { e: string }).e;
    // a second fact lands in another tab, after the analyser page was opened
    sqlite.prepare("INSERT INTO deal_facts (id, deal_id, fact_type, value_json, entered_at) VALUES (?, ?, 'survey-finding', '{\"value\":900}', ?)")
      .run('44444444-4444-4444-8444-444444444444', first.id, '2099-01-01T00:00:00.000Z');
    const res = await (await save(h, { deal_id: first.id, url_params: CORRECTED, facts_as_of: openedAt })).json() as { foldedFacts: number };
    expect(res.foldedFacts).toBe(1);
    const later = sqlite.prepare("SELECT folded_at f FROM deal_facts WHERE fact_type = 'survey-finding'").get() as { f: string | null };
    expect(later.f, 'the later fact still applies').toBeNull();
  });

  it('an empty facts window means NO window, not a window that folds nothing', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string };
    await addFact(h, first.id, 'builder-quote', 48000);
    const res = await (await save(h, { deal_id: first.id, url_params: CORRECTED, facts_as_of: '' })).json() as { foldedFacts: number };
    expect(res.foldedFacts).toBe(1);
  });

  it('a save with nothing computed never blanks the score, the band or the facts', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string };
    await addFact(h, first.id, 'builder-quote', 48000);
    // the analyser with no verdict yet: no score, no evidence
    const res = await (await save(h, { deal_id: first.id, url_params: CORRECTED, score: null, sold_evidence: 'null', headline_figure: '', verdict_line: '' })).json() as { foldedFacts: number };
    expect(res.foldedFacts).toBe(0);
    const d = deal();
    expect(d.current_score).toBe(7.2);
    expect(d.verdict_line).toBe(BASE.verdict_line);
    expect(d.sold_evidence).toBe('{"estimate":157500,"high":172500}');
    expect((sqlite.prepare('SELECT folded_at f FROM deal_facts').get() as { f: string | null }).f).toBeNull();
    // and it does not redefine the deal's numbers either — the facts on top
    // still apply to the old ones (P7 review)
    expect((sqlite.prepare('SELECT url_params u FROM saved_deals WHERE id = ?').get(first.id) as { u: string }).u).toBe(BASE.url_params);
  });

  it('a PARKED deal is never rewritten by a re-save from its own page', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string };
    await worker.fetch(new Request(`https://s.test/api/deals/${first.id}/dead`, {
      method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Numbers don’t work' }),
    }), env());
    expect((sqlite.prepare('SELECT status FROM deals WHERE id = ?').get(first.id) as { status: string }).status, 'the park must have worked').toBe('dead');
    const res = await (await save(h, { deal_id: first.id, url_params: CORRECTED, score: 3.1 })).json() as { id: string };
    expect(res.id).not.toBe(first.id);
    const parked = sqlite.prepare('SELECT status, current_score FROM deals WHERE id = ?').get(first.id) as { status: string; current_score: number };
    expect(parked.status).toBe('dead');
    expect(parked.current_score, 'the parked deal keeps the numbers it died on').toBe(7.2);
  });

  it('a save that lands on another row folds nothing — those facts were never in it', async () => {
    const h = await authed();
    const a = await (await save(h)).json() as { id: string };
    await addFact(h, a.id, 'builder-quote', 48000);
    await save(h, { url_params: CORRECTED }); // the accidental twin already holds these numbers
    const res = await (await save(h, { deal_id: a.id, url_params: CORRECTED })).json() as { foldedFacts: number };
    expect(res.foldedFacts).toBe(0);
    expect(count('deal_facts', `WHERE deal_id = '${a.id}'`)).toBe(1); // A keeps its fact
  });

  it('saving the SAME numbers folds nothing — the facts were not in them', async () => {
    const h = await authed();
    const first = await (await save(h)).json() as { id: string };
    await addFact(h, first.id, 'builder-quote', 48000);
    const res = await (await save(h, { deal_id: first.id })).json() as { foldedFacts: number };
    expect(res.foldedFacts).toBe(0);
    expect(count('deal_facts')).toBe(1);
  });
});

describe('the sold-evidence band travels with the deal', () => {
  it('is stored on save and handed back to the board', async () => {
    const h = await authed();
    await save(h);
    expect((deal() as { sold_evidence: string }).sold_evidence).toBe('{"estimate":157500,"high":172500}');
    const list = await (await worker.fetch(new Request('https://s.test/api/deals', { headers: h }), env())).json() as { deals: { sold_evidence: string }[] };
    expect(list.deals[0].sold_evidence).toBe('{"estimate":157500,"high":172500}');
  });

  it('an analyser with no valuation says so, and is not confused with an old deal', async () => {
    const h = await authed();
    await save(h, { sold_evidence: 'null' });
    expect((deal() as { sold_evidence: string }).sold_evidence).toBe('null');
    // an old deal has SQL NULL — the board tells the truth about that one
    sqlite.prepare('UPDATE deals SET sold_evidence = NULL').run();
    const list = await (await worker.fetch(new Request('https://s.test/api/deals', { headers: h }), env())).json() as { deals: { sold_evidence: string | null }[] };
    expect(list.deals[0].sold_evidence).toBeNull();
  });

  it('a nonsense band is stored as no evidence, never trusted', async () => {
    const h = await authed();
    await save(h, { sold_evidence: '{"estimate":"lots","high":true}' });
    expect((deal() as { sold_evidence: string }).sold_evidence).toBe('null');
  });

  it('the analyser scoring an unscored deal records the band too', async () => {
    const h = await authed();
    const first = await (await save(h, { sold_evidence: 'null' })).json() as { id: string };
    const res = await worker.fetch(new Request(`https://s.test/api/deals/${first.id}/score`, {
      method: 'POST', headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({ score: 8.1, verdict_line: 'x', headline_figure: 'y', criteria_json: '{}', sold_evidence: '{"estimate":161000,"high":177000}' }),
    }), env());
    expect(res.status).toBe(200);
    expect((deal() as { sold_evidence: string }).sold_evidence).toBe('{"estimate":161000,"high":177000}');
  });

  it('a re-save refreshes the band, so an old deal heals the moment it is saved again', async () => {
    const h = await authed();
    const first = await (await save(h, { sold_evidence: 'null' })).json() as { id: string };
    await save(h, { deal_id: first.id, url_params: CORRECTED, sold_evidence: '{"estimate":160000,"high":175000}' });
    expect((deal() as { sold_evidence: string }).sold_evidence).toBe('{"estimate":160000,"high":175000}');
    expect(count('deals')).toBe(1);
  });
});
