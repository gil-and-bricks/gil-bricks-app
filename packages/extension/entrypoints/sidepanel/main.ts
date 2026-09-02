/**
 * Side-panel UI (E7) — TRIAGE-first. Open a listing → verdict → answer at most
 * one or two unknowns → decide. Every other input lives on a separate Settings
 * screen (set once, applied to every listing), which also holds the user's own
 * "what does a good deal look like to you?" criteria. All four strategies score.
 * Layout (triage): property line → strategy switch → score + headline → what's
 * holding it back → components → the one/two unknowns → "Using your settings ⚙"
 * → Send to my analyser.
 */
import {
  scoreListing,
  smartDefaults,
  rentFitsProperty,
  isOutOfMarket,
  scoreCopy,
  floorAreaFromSector,
  postcodeToSector,
  buildAnalyserUrl,
  getSector,
  strategyById,
  criteriaFields,
  FALLBACK_CONFIG,
  type NormalisedListing,
  type ExtractResult,
  type ScoreListingResult,
  type DealScore,
  type StrategyId,
  type SectorFile,
  type Criteria,
} from '@gil-bricks/core';
import { EXTRACT_MESSAGE, refreshRemoteConfig } from '../../src/extractPage';
import * as store from '../../src/store';

const WEB_BASE = 'https://gil-bricks-app.gil-782.workers.dev';
const STRATEGIES: { id: StrategyId; label: string }[] = [
  { id: 'btl', label: 'BTL' }, { id: 'flip', label: 'Flip' }, { id: 'brrrr', label: 'BRRRR' }, { id: 'hmo', label: 'HMO' },
];
const LIGHT: Record<DealScore['verdict'], string> = { good: 'ds-good', marginal: 'ds-marginal', 'walk away': 'ds-walk' };
const COMP_PILL: Record<string, string> = { green: 'st-green', amber: 'st-amber', red: 'st-red', unknown: 'st-unknown' };

/** The one/two unknowns shown in triage per strategy (rest → Settings). */
const TRIAGE_FIELDS: Record<StrategyId, { key: string; label: string; unit: string }[]> = {
  btl: [{ key: 'rent', label: 'Monthly rent', unit: '£/mo' }],
  flip: [{ key: 'gdv', label: 'End value after works', unit: '£' }, { key: 'refurbCost', label: 'Refurb budget', unit: '£' }],
  brrrr: [{ key: 'arv', label: 'End value after works', unit: '£' }, { key: 'rent', label: 'Monthly rent', unit: '£/mo' }, { key: 'refurbCost', label: 'Refurb budget', unit: '£' }],
  hmo: [{ key: 'roomRent', label: 'Rent per room', unit: '£/mo' }, { key: 'rooms', label: 'Lettable rooms', unit: '' }],
};

function e(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function root(): HTMLElement {
  const a = document.getElementById('app')!;
  a.textContent = '';
  return a;
}

export function renderEmpty(): void {
  const card = e('section', 'glass card empty');
  card.append(e('p', 'eyebrow', 'Gil & Bricks'));
  card.append(e('p', 'empty-msg', 'Open a Rightmove or Zoopla listing to analyse.'));
  root().append(card);
}
export function renderFailure(message: string): void {
  const card = e('section', 'glass card');
  card.append(e('p', 'eyebrow', 'Gil & Bricks'));
  card.append(e('p', 'read-fail', message));
  root().append(card);
}

function soldText(p: ScoreListingResult['priceVsSold']): { pill: string; label: string; text: string } {
  switch (p.status) {
    case 'green': return { pill: 'st-green', label: 'ok', text: `At or below the £${(p.typicalPrice ?? 0).toLocaleString('en-GB')} typical` };
    case 'amber': return { pill: 'st-amber', label: 'high', text: 'Toward the top of what’s sold nearby' };
    case 'red': return { pill: 'st-red', label: 'over', text: `Above the £${(p.p90Price ?? 0).toLocaleString('en-GB')} sold ceiling` };
    case 'not-enough-sales': return { pill: 'st-unknown', label: 'thin', text: 'Not enough nearby sales to judge' };
    case 'outside-evidence': return { pill: 'st-unknown', label: 'n/a', text: 'No nearby sales at this level — we can’t judge the price from sold evidence' };
    default: return { pill: 'st-unknown', label: '—', text: 'Couldn’t load nearby sold prices' };
  }
}

export interface PanelView {
  screen: 'triage' | 'settings';
  listing: NormalisedListing;
  strategy: StrategyId;
  result: ScoreListingResult;
  unknowns: Record<string, string>;            // effective values shown in triage
  suggestions: Record<string, { value: string | null; label: string }>;
  settings: Record<string, string>;
  criteria: Criteria;
  floorAreaSqm: number | null;
  floorAreaSource: 'listing' | 'epc-sector' | 'manual' | 'none';
  floorAreaRange: { minSqm: number; maxSqm: number } | null;
  /** The user's raw manual floor-area entry (kept in the mounted input). */
  manualAreaInput: string;
  /** True when the score rests on a suggested (not user-entered) unknown. */
  usingSuggested: boolean;
  /** A remembered rent was dropped because it didn't fit this property (E7.1). */
  rentCleared?: boolean;
  /** Priced outside the local market AND no strategy works — the honest line (E7.1). */
  outOfMarket?: boolean;
  ewReject?: string | null;
}
export interface PanelHandlers {
  onStrategy?: (s: StrategyId) => void;
  onUnknown?: (key: string, v: string) => void;
  onArea?: (v: string) => void;
  onSetting?: (key: string, v: string) => void;
  onCriterion?: (key: keyof Criteria, v: string) => void;
  onOpenSettings?: () => void;
  onCloseSettings?: () => void;
  onSend?: () => void;
}

function chip(deal: DealScore | null, result: ScoreListingResult, strategy: StrategyId): HTMLElement {
  if (deal) {
    const c = e('div', `deal-score ${LIGHT[deal.verdict]}`);
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', `Deal score ${deal.score.toFixed(1)} out of 10 — ${deal.verdict}. ${deal.headline}`);
    const sc = e('span', 'ds-score');
    sc.append(e('strong', undefined, deal.score.toFixed(1)), e('span', 'ds-outof', '/10'));
    const dot = e('span', 'ds-light', '●');
    dot.setAttribute('aria-hidden', 'true');
    c.append(sc, dot, e('span', 'ds-verdict', deal.verdict), e('span', 'ds-headline', deal.headline));
    return c;
  }
  const pending = e('div', 'deal-score ds-pending');
  pending.append(e('span', 'ds-verdict', 'Not scored yet'));
  const need = result.waitingOn.length ? `Add ${result.waitingOn.join(' and ')} below to score this as ${strategyById(strategy)!.name}.` : `Add the details below to score this as ${strategyById(strategy)!.name}.`;
  pending.append(e('span', 'ds-headline', need));
  return pending;
}

function componentsList(view: PanelView): HTMLElement {
  const ul = e('ul', 'components');
  const sold = soldText(view.result.priceVsSold);
  const deal = view.result.deal;
  const rows = deal ? deal.components : strategyById(view.strategy)!.score.map((c) => ({ name: c.name, status: 'pending', points: 0, max: c.weight }));
  for (const c of rows) {
    const isSold = /sold/i.test(c.name);
    const isRoom = /room/i.test(c.name) && /size|legal|minimum/i.test(c.name);
    const li = e('li', isSold ? 'component component-note' : 'component');
    li.append(e('span', 'c-name', c.name));
    if (isSold) {
      li.append(e('span', `c-status ${sold.pill}`, sold.label));
      li.append(e('span', 'c-note', sold.text));
    } else if (isRoom && (c as { status: string }).status === 'unknown') {
      li.append(e('span', 'c-status st-unknown', 'check analyser'));
    } else if (!deal) {
      li.append(e('span', 'c-status st-unknown', 'pending'));
    } else {
      li.append(e('span', `c-status ${COMP_PILL[(c as { status: string }).status] ?? 'st-unknown'}`, (c as { status: string }).status));
      li.append(e('span', 'c-points', `${(c as { points: number }).points.toFixed(2)} / ${(c as { max: number }).max.toFixed(1)}`));
    }
    ul.append(li);
  }
  return ul;
}

function numberField(id: string, value: string, placeholder: string, on?: (v: string) => void): HTMLInputElement {
  const inp = e('input', 'input-field') as HTMLInputElement;
  inp.id = id;
  inp.type = 'number';
  inp.inputMode = 'numeric';
  inp.placeholder = placeholder;
  inp.value = value;
  if (on) inp.addEventListener('input', () => on(inp.value));
  return inp;
}

export function renderTriage(view: PanelView, h: PanelHandlers = {}): void {
  const app = root();
  const L = view.listing;
  const card = e('section', 'glass card');

  // 1) property line
  const addr = L.address.value;
  card.append(e('h1', 'prop-addr', [addr?.paon, addr?.street, L.postcode.value].filter(Boolean).join(', ') || L.postcode.value || 'This property'));
  const facts = [
    L.askingPrice.value ? `£${L.askingPrice.value.toLocaleString('en-GB')}` : null,
    L.propertyType.value, L.bedrooms.value ? `${L.bedrooms.value} bed` : null, L.tenure.value?.toLowerCase(),
  ].filter(Boolean);
  card.append(e('p', 'prop-facts', facts.join(' · ')));

  // 2) strategy switch
  const sw = e('div', 'strategy-switch');
  sw.setAttribute('role', 'group');
  sw.setAttribute('aria-label', 'Strategy');
  for (const s of STRATEGIES) {
    const b = e('button', `strat-btn${s.id === view.strategy ? ' active' : ''}`, s.label) as HTMLButtonElement;
    b.type = 'button';
    b.setAttribute('aria-pressed', String(s.id === view.strategy));
    if (h.onStrategy) b.addEventListener('click', () => h.onStrategy!(s.id));
    sw.append(b);
  }
  card.append(sw);

  if (view.ewReject) {
    card.append(e('p', 'read-fail', view.ewReject));
    app.append(card);
    return;
  }

  // 3) score + headline, 4) what's holding it back
  card.append(chip(view.result.deal, view.result, view.strategy));
  if (view.usingSuggested) card.append(e('p', 'suggest-note', 'Score uses a suggested end value — set your own to be sure.'));
  if (view.result.note) card.append(e('p', 'read-fail', view.result.note));
  // Honest out-of-market line — priced above local stock, works on no strategy (E7.1).
  if (view.outOfMarket) card.append(e('p', 'out-of-market', scoreCopy.listingNotes.outOfMarket));
  if (view.result.deal?.bindingConstraint) {
    const bn = e('p', 'binding-note');
    bn.append(e('span', 'binding-label', 'What’s holding it back: '));
    bn.append(document.createTextNode(view.result.deal.bindingConstraint.plainExplanation));
    card.append(bn);
  }

  // 5) components
  card.append(componentsList(view));

  // 6) the one/two unknowns
  for (const f of TRIAGE_FIELDS[view.strategy]) {
    const row = e('div', 'input-row');
    const lab = e('label', 'input-label', `${f.label}${f.unit ? ` (${f.unit})` : ''}`);
    lab.setAttribute('for', `gb-u-${f.key}`);
    const sug = view.suggestions[f.key];
    const placeholder = f.key === 'rent' ? 'what it would let for' : sug && sug.value ? sug.label : 'you decide';
    row.append(lab, numberField(`gb-u-${f.key}`, view.unknowns[f.key] ?? '', placeholder, h.onUnknown ? (v) => h.onUnknown!(f.key, v) : undefined));
    if (sug) row.append(e('span', 'suggest-note', sug.value ? sug.label : sug.label));
    card.append(row);
    // A remembered rent that didn't fit this property was cleared — say why (E7.1).
    if (f.key === 'rent' && view.rentCleared && !(view.unknowns.rent ?? '')) {
      card.append(e('p', 'suggest-note cleared-note', scoreCopy.listingNotes.rememberedRentUnfit));
    }
  }

  // floor area (with range honesty — bug 5a)
  if (view.floorAreaRange) {
    card.append(e('p', 'floor-area', `Floor area: ${view.floorAreaRange.minSqm}–${view.floorAreaRange.maxSqm} m² (a range on the listing; using the ${view.floorAreaSqm} m² midpoint)`));
  } else if (view.floorAreaSqm && (view.floorAreaSource === 'listing' || view.floorAreaSource === 'epc-sector')) {
    card.append(e('p', 'floor-area', `Floor area: ${view.floorAreaSqm} m² (${view.floorAreaSource === 'listing' ? 'from the listing' : 'from EPC data'})`));
  } else {
    // manual OR none — keep the input MOUNTED so multi-digit entry works
    const row = e('div', 'input-row');
    const lab = e('label', 'input-label', 'Floor area (m²)');
    lab.setAttribute('for', 'gb-area');
    row.append(lab, numberField('gb-area', view.manualAreaInput, 'not on the listing — optional', h.onArea));
    if (view.floorAreaSqm && view.floorAreaSource === 'manual') row.append(e('span', 'suggest-note', `using ${view.floorAreaSqm} m²`));
    card.append(row);
  }

  // 7) "Using your settings ⚙" + Send
  const settingsLink = e('button', 'settings-link', 'Using your settings ⚙') as HTMLButtonElement;
  settingsLink.type = 'button';
  if (h.onOpenSettings) settingsLink.addEventListener('click', () => h.onOpenSettings!());
  card.append(settingsLink);

  const send = e('button', 'send-btn', 'Send to my analyser →') as HTMLButtonElement;
  send.type = 'button';
  if (h.onSend) send.addEventListener('click', () => h.onSend!());
  card.append(send);

  card.append(e('p', 'sample-note', `${L.portal} · read ${L.source === 'embedded' ? 'cleanly' : 'from fallback'} · ${L.extractorVersion}`));
  app.append(card);
}

export function renderSettings(view: PanelView, h: PanelHandlers = {}): void {
  const app = root();
  const card = e('section', 'glass card');
  const back = e('button', 'settings-link', '← Back to the listing') as HTMLButtonElement;
  back.type = 'button';
  if (h.onCloseSettings) back.addEventListener('click', () => h.onCloseSettings!());
  card.append(back);

  card.append(e('h2', 'eyebrow', 'What does a good deal look like to you?'));
  for (const f of criteriaFields()) {
    const row = e('div', 'assume-row');
    const lab = e('label', 'assume-label', `${f.label} (${f.unit})`);
    lab.setAttribute('for', `gb-c-${f.key}`);
    const inp = e('input', 'assume-field') as HTMLInputElement;
    inp.id = `gb-c-${f.key}`;
    inp.type = 'number';
    inp.placeholder = String(f.default);
    inp.value = view.criteria[f.key] != null ? String(view.criteria[f.key]) : '';
    if (h.onCriterion) inp.addEventListener('input', () => h.onCriterion!(f.key, inp.value));
    row.append(lab, inp);
    card.append(row);
  }

  card.append(e('h2', 'eyebrow settings-sub', `${strategyById(view.strategy)!.name} settings`));
  const cfg = strategyById(view.strategy)!;
  const triageKeys = new Set(TRIAGE_FIELDS[view.strategy].map((f) => f.key));
  const skip = new Set([...triageKeys, 'deposit', 'rate']);
  for (const f of [...cfg.strategyInputs, ...cfg.assumptions].filter((x) => !skip.has(x.key))) {
    const row = e('div', 'assume-row');
    const lab = e('label', 'assume-label', `${f.label}${f.unit ? ` (${f.unit})` : ''}`);
    lab.setAttribute('for', `gb-s-${f.key}`);
    const val = view.settings[f.key] ?? f.default;
    let input: HTMLElement;
    if (f.kind === 'select') {
      const sel = e('select', 'assume-field') as HTMLSelectElement;
      sel.id = `gb-s-${f.key}`;
      for (const o of f.options ?? []) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === val) opt.selected = true;
        sel.append(opt);
      }
      if (h.onSetting) sel.addEventListener('change', () => h.onSetting!(f.key, sel.value));
      input = sel;
    } else {
      const inp = e('input', 'assume-field') as HTMLInputElement;
      inp.id = `gb-s-${f.key}`;
      inp.type = 'number';
      inp.value = val;
      if (h.onSetting) inp.addEventListener('input', () => h.onSetting!(f.key, inp.value));
      input = inp;
    }
    row.append(lab, input);
    card.append(row);
  }
  app.append(card);
}

// ---------------- interactive controller ----------------

interface Ctx {
  url: string;
  listing: NormalisedListing | null;
  failure: string | null;
  screen: 'triage' | 'settings';
  strategy: StrategyId;
  rent: string;
  listingUnknowns: Record<string, string>;
  settings: Record<string, string>;
  criteria: Criteria;
  sector: SectorFile | null;
  sectorId: string | null;
  ewReject: string | null;
  manualArea: string;
  /** Unknown fields the user has explicitly emptied — don't re-inject a suggestion. */
  cleared: Set<string>;
  /** A remembered rent was dropped as not fitting this property (E7.1). */
  rentCleared: boolean;
}

function resolveFloorArea(ctx: Ctx): { sqm: number | null; source: PanelView['floorAreaSource']; range: PanelView['floorAreaRange'] } {
  const l = ctx.listing!;
  const range = l.floorAreaSqmRange.status === 'found' ? l.floorAreaSqmRange.value : null;
  if (l.floorAreaSqm.status === 'found' && l.floorAreaSqm.value) return { sqm: l.floorAreaSqm.value, source: 'listing', range };
  const epc = floorAreaFromSector(ctx.sector, l.address.value);
  if (epc) return { sqm: epc, source: 'epc-sector', range: null };
  if (ctx.manualArea && Number(ctx.manualArea) > 0) return { sqm: Math.round(Number(ctx.manualArea)), source: 'manual', range: null };
  return { sqm: null, source: 'none', range: null };
}

function effectiveUnknowns(ctx: Ctx, strategy: StrategyId, suggestions: Record<string, { value: string | null; label: string }>): { unknowns: Record<string, string>; suggestedKeys: Set<string> } {
  const u: Record<string, string> = { rent: ctx.rent, ...ctx.listingUnknowns };
  const suggestedKeys = new Set<string>();
  for (const f of TRIAGE_FIELDS[strategy]) {
    // inject a suggestion only when the field is empty AND the user hasn't
    // explicitly cleared it (so a suggested value can be blanked and stay blank)
    if ((u[f.key] ?? '') === '' && !ctx.cleared.has(f.key) && suggestions[f.key]?.value) {
      u[f.key] = suggestions[f.key]!.value!;
      suggestedKeys.add(f.key);
    }
  }
  return { unknowns: u, suggestedKeys };
}

const SANITY_OPTS = {
  minSectorSales: FALLBACK_CONFIG.thresholds.minSectorSales,
  evidenceOutsideFactor: FALLBACK_CONFIG.thresholds.evidenceOutsideFactor,
};

/** Score one strategy end-to-end (used for the current tab and the all-four check). */
function scoreStrategy(ctx: Ctx, strategy: StrategyId, faSqm: number | null): { result: ScoreListingResult; unknowns: Record<string, string>; suggestedKeys: Set<string>; suggestions: Record<string, { value: string | null; label: string }> } {
  const suggestions = smartDefaults(strategy, ctx.listing!, ctx.sector, faSqm, SANITY_OPTS);
  const { unknowns, suggestedKeys } = effectiveUnknowns(ctx, strategy, suggestions);
  const result = scoreListing(ctx.listing!, {
    strategy, unknowns, settings: ctx.settings, criteria: ctx.criteria,
    sector: ctx.sector, floorAreaSqm: faSqm, ...SANITY_OPTS,
  });
  return { result, unknowns, suggestedKeys, suggestions };
}

function draw(ctx: Ctx): void {
  if (ctx.failure) return renderFailure(ctx.failure);
  if (!ctx.listing) return renderEmpty();
  const fa = resolveFloorArea(ctx);
  const { result, unknowns, suggestedKeys, suggestions } = scoreStrategy(ctx, ctx.strategy, fa.sqm);
  // Out-of-market only when the price is outside the local sold evidence AND no
  // strategy can be made to work — so score all four to be sure (E7.1). Only the
  // triage screen shows this line, so skip the extra three scores on Settings.
  let outOfMarket = false;
  if (ctx.screen === 'triage') {
    const verdicts = STRATEGIES.map((s) => (s.id === ctx.strategy ? result : scoreStrategy(ctx, s.id, fa.sqm).result).deal?.verdict ?? null);
    outOfMarket = isOutOfMarket(result.priceVsSold.status, verdicts);
  }
  const view: PanelView = {
    screen: ctx.screen, listing: ctx.listing, strategy: ctx.strategy, result, unknowns, suggestions,
    settings: ctx.settings, criteria: ctx.criteria, floorAreaSqm: fa.sqm, floorAreaSource: fa.source, floorAreaRange: fa.range,
    manualAreaInput: ctx.manualArea, usingSuggested: suggestedKeys.size > 0 && !!result.deal,
    rentCleared: ctx.rentCleared, outOfMarket, ewReject: ctx.ewReject,
  };
  const setUnknown = (key: string, v: string): void => {
    if (v.trim() === '') ctx.cleared.add(key);
    else ctx.cleared.delete(key);
    if (key === 'rent') { ctx.rent = v; if (v.trim() !== '') ctx.rentCleared = false; if (ctx.sectorId) void store.setRent(ctx.sectorId, v); }
    else { ctx.listingUnknowns = { ...ctx.listingUnknowns, [key]: v }; if (ctx.listing?.listingId.value) void store.setUnknowns(ctx.listing.listingId.value, ctx.listingUnknowns); }
    redraw(ctx);
  };
  const handlers: PanelHandlers = {
    onStrategy: (s) => { ctx.strategy = s; void store.setStrategy(s); redraw(ctx); },
    onUnknown: setUnknown,
    onArea: (v) => { ctx.manualArea = v; if (ctx.listing?.listingId.value) void store.setManualArea(ctx.listing.listingId.value, v); redraw(ctx); },
    onSetting: (k, v) => { ctx.settings = { ...ctx.settings, [k]: v }; void store.setSettings(ctx.settings); redraw(ctx); },
    onCriterion: (k, v) => { const c = { ...ctx.criteria }; if (v.trim() === '') delete c[k]; else c[k] = Number(v); ctx.criteria = c; void store.setCriteria(c); redraw(ctx); },
    onOpenSettings: () => { ctx.screen = 'settings'; draw(ctx); },
    onCloseSettings: () => { ctx.screen = 'triage'; draw(ctx); },
    onSend: () => {
      const url = buildAnalyserUrl(WEB_BASE, ctx.listing!, {
        strategy: ctx.strategy, floorAreaSqm: fa.sqm,
        fields: { ...unknowns, ...ctx.settings, deposit: String(ctx.criteria.depositPct ?? ''), rate: String(ctx.criteria.ratePct ?? '') },
      });
      chrome.tabs.create({ url });
    },
  };
  if (ctx.screen === 'settings') renderSettings(view, handlers);
  else renderTriage(view, handlers);
}

function redraw(ctx: Ctx): void {
  const active = document.activeElement as (HTMLInputElement & HTMLSelectElement) | null;
  const focusId = active?.id || '';
  let caret: number | null = null;
  try { caret = active?.selectionStart ?? null; } catch { caret = null; }
  draw(ctx);
  if (focusId) {
    const el = document.getElementById(focusId) as HTMLInputElement | null;
    if (el) { el.focus(); if (caret != null) { try { el.setSelectionRange(caret, caret); } catch { /* number inputs */ } } }
  }
}

let lastUrl = '';

async function loadFor(tabId: number, url: string): Promise<void> {
  const ctx: Ctx = {
    url, listing: null, failure: null, screen: 'triage',
    strategy: (await store.getStrategy()) as StrategyId,
    rent: '', listingUnknowns: {}, settings: await store.getSettings(), criteria: await store.getCriteria(),
    sector: null, sectorId: null, ewReject: null, manualArea: '', cleared: new Set(), rentCleared: false,
  };
  let result: ExtractResult;
  try {
    result = (await chrome.tabs.sendMessage(tabId, { type: EXTRACT_MESSAGE })) as ExtractResult;
  } catch {
    ctx.failure = 'Open a Rightmove or Zoopla listing, then reopen this panel.';
    return draw(ctx);
  }
  if (!result.ok) { ctx.failure = result.message; return draw(ctx); }
  ctx.listing = result.listing;
  if (ctx.listing.listingId.value) ctx.listingUnknowns = await store.getUnknowns(ctx.listing.listingId.value);
  if (ctx.listing.postcode.value) {
    const pc = postcodeToSector(ctx.listing.postcode.value);
    if (!pc.inEnglandWales) ctx.ewReject = pc.message;
    else {
      ctx.sectorId = pc.sector;
      const remembered = await store.getRent(pc.sector);
      // Sanity-check a remembered (per-sector) rent before applying it: if it
      // implies an absurd gross yield for THIS property it belongs to a
      // different (cheaper/dearer) home — clear it and say why (E7.1).
      const price = ctx.listing.askingPrice.value ?? 0;
      const th = FALLBACK_CONFIG.thresholds;
      // Only judge a remembered rent when there's a real price to judge against —
      // a POA / "offers over" listing has no price, so the honest chip already
      // says "add a price"; don't also claim the rent "doesn't fit" (E7.1 review).
      if (price > 0 && remembered && !rentFitsProperty(Number(remembered), price, th.rentSanityYieldMin, th.rentSanityYieldMax)) {
        ctx.rent = '';
        ctx.rentCleared = true;
      } else {
        ctx.rent = remembered;
      }
    }
  }
  if (ctx.listing.listingId.value) ctx.manualArea = await store.getManualArea(ctx.listing.listingId.value);
  draw(ctx);
  if (ctx.sectorId && !ctx.ewReject) {
    try { ctx.sector = await getSector(ctx.sectorId); } catch { ctx.sector = null; }
    draw(ctx);
  }
}

async function tick(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? '';
    if (!tab?.id) return;
    const isPortal = url ? /(^|\.)(rightmove|zoopla)\.co\.uk$/.test(new URL(url).hostname) : false;
    if (!isPortal) { if (lastUrl !== '') { lastUrl = ''; renderEmpty(); } return; }
    if (url !== lastUrl) { lastUrl = url; await loadFor(tab.id, url); }
  } catch {
    /* transient */
  }
}

function init(): void {
  void refreshRemoteConfig();
  void tick();
  setInterval(() => void tick(), 1500);
}

const runtime = globalThis as unknown as { chrome?: { tabs?: { query?: unknown } } };
if (runtime.chrome?.tabs?.query) init();
