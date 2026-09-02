/**
 * Side-panel UI (E6). Reads the listing the user opened, scores it honestly for
 * the chosen strategy, and hands off to the web analyser with every field.
 * Layout is verdict-first at ~380px: property line → strategy switch → score
 * chip + headline → what's holding it back → components → rent/assumptions →
 * Send to analyser. Nothing a triage decision needs sits below the fold.
 */
import {
  scoreListing,
  floorAreaFromSector,
  postcodeToSector,
  buildAnalyserUrl,
  getSector,
  strategyById,
  FALLBACK_CONFIG,
  type NormalisedListing,
  type ExtractResult,
  type ScoreListingResult,
  type StrategyId,
  type DealScore,
  type SectorFile,
} from '@gil-bricks/core';
import { EXTRACT_MESSAGE, refreshRemoteConfig } from '../../src/extractPage';
import * as store from '../../src/store';

const WEB_BASE = 'https://gil-bricks-app.gil-782.workers.dev';
const STRATEGIES: { id: StrategyId; label: string }[] = [
  { id: 'btl', label: 'BTL' },
  { id: 'flip', label: 'Flip' },
  { id: 'brrrr', label: 'BRRRR' },
  { id: 'hmo', label: 'HMO' },
];
const LIGHT: Record<DealScore['verdict'], string> = { good: 'ds-good', marginal: 'ds-marginal', 'walk away': 'ds-walk' };
const COMP_PILL: Record<string, string> = { green: 'st-green', amber: 'st-amber', red: 'st-red', unknown: 'st-unknown' };

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

// ---------------- pure render states ----------------

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

function priceVsSoldText(p: ScoreListingResult['priceVsSold']): { pill: string; label: string; text: string } {
  switch (p.status) {
    case 'green': return { pill: 'st-green', label: 'ok', text: `At or below the £${(p.typicalPrice ?? 0).toLocaleString('en-GB')} typical` };
    case 'amber': return { pill: 'st-amber', label: 'high', text: 'Toward the top of what’s sold nearby' };
    case 'red': return { pill: 'st-red', label: 'over', text: `Above the £${(p.p90Price ?? 0).toLocaleString('en-GB')} sold ceiling` };
    case 'not-enough-sales': return { pill: 'st-unknown', label: 'thin', text: 'Not enough nearby sales to judge' };
    default: return { pill: 'st-unknown', label: '—', text: 'Couldn’t load nearby sold prices' };
  }
}

export interface PanelView {
  listing: NormalisedListing;
  strategy: StrategyId;
  result: ScoreListingResult;
  rent: string;
  assumptions: Record<string, string>;
  floorAreaSqm: number | null;
  floorAreaSource: 'listing' | 'epc-sector' | 'manual' | 'none';
  sectorId: string | null;
  ewReject?: string | null;
  webBase?: string;
}
export interface PanelHandlers {
  onStrategy?: (s: StrategyId) => void;
  onRent?: (v: string) => void;
  onArea?: (v: string) => void;
  onAssumption?: (k: string, v: string) => void;
  onSend?: () => void;
}

export function renderScored(view: PanelView, handlers: PanelHandlers = {}): void {
  const app = root();
  const L = view.listing;
  const cfg = strategyById(view.strategy)!;
  const card = e('section', 'glass card');

  // 1) property line
  const addr = L.address.value;
  const addrLine = [addr?.paon, addr?.street, L.postcode.value].filter(Boolean).join(', ') || L.postcode.value || 'This property';
  card.append(e('p', 'prop-addr', addrLine));
  const facts = e('p', 'prop-facts');
  const bits = [
    L.askingPrice.value ? `£${L.askingPrice.value.toLocaleString('en-GB')}` : null,
    L.propertyType.value,
    L.bedrooms.value ? `${L.bedrooms.value} bed` : null,
    L.tenure.value ? L.tenure.value.toLowerCase() : null,
  ].filter(Boolean);
  facts.textContent = bits.join(' · ');
  card.append(facts);

  // 2) strategy switch
  const sw = e('div', 'strategy-switch');
  sw.setAttribute('role', 'group');
  sw.setAttribute('aria-label', 'Strategy');
  for (const s of STRATEGIES) {
    const b = e('button', `strat-btn${s.id === view.strategy ? ' active' : ''}`, s.label) as HTMLButtonElement;
    b.type = 'button';
    b.setAttribute('aria-pressed', String(s.id === view.strategy));
    if (handlers.onStrategy) b.addEventListener('click', () => handlers.onStrategy!(s.id));
    sw.append(b);
  }
  card.append(sw);

  // England & Wales gate short-circuits the score.
  if (view.ewReject) {
    card.append(e('p', 'read-fail', view.ewReject));
    app.append(card);
    return;
  }

  const deal = view.result.deal;

  // 3) score chip + headline
  if (deal) {
    const chip = e('div', `deal-score ${LIGHT[deal.verdict]}`);
    chip.setAttribute('role', 'img');
    chip.setAttribute('aria-label', `Deal score ${deal.score.toFixed(1)} out of 10 — ${deal.verdict}. ${deal.headline}`);
    const sc = e('span', 'ds-score');
    sc.append(e('strong', undefined, deal.score.toFixed(1)), e('span', 'ds-outof', '/10'));
    const dot = e('span', 'ds-light', '●');
    dot.setAttribute('aria-hidden', 'true');
    chip.append(sc, dot, e('span', 'ds-verdict', deal.verdict), e('span', 'ds-headline', deal.headline));
    card.append(chip);
    // 4) what's holding it back
    if (deal.bindingConstraint) {
      const bn = e('p', 'binding-note');
      bn.append(e('span', 'binding-label', 'What’s holding it back: '));
      bn.append(document.createTextNode(deal.bindingConstraint.plainExplanation));
      card.append(bn);
    }
  } else {
    const pending = e('div', 'deal-score ds-pending');
    pending.append(e('span', 'ds-verdict', 'Not scored yet'));
    const msg = view.result.note || `Add the monthly rent below to score this as ${cfg.name}.`;
    pending.append(e('span', 'ds-headline', msg));
    card.append(pending);
  }

  // 5) components
  const ul = e('ul', 'components');
  const pvs = priceVsSoldText(view.result.priceVsSold);
  if (deal) {
    for (const c of deal.components) {
      const li = e('li', 'component');
      li.append(e('span', 'c-name', c.name));
      const isEvidence = /sold/i.test(c.name);
      if (isEvidence && view.result.priceVsSold.status !== 'green' && view.result.priceVsSold.status !== 'amber' && view.result.priceVsSold.status !== 'red') {
        li.append(e('span', `c-status ${pvs.pill}`, view.result.priceVsSold.status === 'not-enough-sales' ? 'thin' : 'no data'));
      } else {
        li.append(e('span', `c-status ${COMP_PILL[c.status] ?? 'st-unknown'}`, c.status));
      }
      li.append(e('span', 'c-points', `${c.points.toFixed(2)} / ${c.max.toFixed(1)}`));
      ul.append(li);
    }
  } else {
    // pending: show the real price component + the rest as waiting-on-rent
    for (const comp of cfg.score) {
      const li = e('li', /sold/i.test(comp.name) ? 'component component-note' : 'component');
      li.append(e('span', 'c-name', comp.name));
      if (/sold/i.test(comp.name)) {
        li.append(e('span', `c-status ${pvs.pill}`, pvs.label));
        li.append(e('span', 'c-note', pvs.text)); // prose, left-aligned
      } else {
        li.append(e('span', 'c-status st-unknown', view.result.note ? 'needs analyser' : 'needs rent'));
        li.append(e('span', 'c-note', ''));
      }
      ul.append(li);
    }
  }
  card.append(ul);

  // 6) inputs — rent (prominent), floor area, assumptions
  if (view.strategy === 'btl') {
    const rentRow = e('div', 'input-row');
    const rl = e('label', 'input-label', 'Monthly rent (£)');
    rl.setAttribute('for', 'gb-rent');
    const ri = e('input', 'input-field') as HTMLInputElement;
    ri.id = 'gb-rent';
    ri.type = 'number';
    ri.inputMode = 'numeric';
    ri.placeholder = 'what it would let for';
    ri.value = view.rent;
    if (handlers.onRent) ri.addEventListener('input', () => handlers.onRent!(ri.value));
    rentRow.append(rl, ri);
    card.append(rentRow);
  }

  // floor area + source
  const fa = e('p', 'floor-area');
  if (view.floorAreaSqm && view.floorAreaSource !== 'none') {
    const src = { listing: 'from the listing', 'epc-sector': 'from EPC data', manual: 'you entered' }[view.floorAreaSource] ?? '';
    fa.textContent = `Floor area: ${view.floorAreaSqm} m² (${src})`;
    card.append(fa);
  } else {
    const faRow = e('div', 'input-row');
    const fl = e('label', 'input-label', 'Floor area (m²)');
    fl.setAttribute('for', 'gb-area');
    const fi = e('input', 'input-field') as HTMLInputElement;
    fi.id = 'gb-area';
    fi.type = 'number';
    fi.placeholder = 'not on the listing — optional';
    fi.value = '';
    if (handlers.onArea) fi.addEventListener('input', () => handlers.onArea!(fi.value));
    faRow.append(fl, fi);
    card.append(faRow);
  }

  // assumptions (collapsed)
  const details = e('details', 'assumptions') as HTMLDetailsElement;
  details.append(e('summary', 'assumptions-summary', 'Your assumptions'));
  for (const f of [...cfg.strategyInputs, ...cfg.assumptions].filter((x) => x.key !== 'rent' && x.key !== 'roomRent')) {
    const row = e('div', 'assume-row');
    const lab = e('label', 'assume-label', `${f.label}${f.unit ? ` (${f.unit})` : ''}`);
    lab.setAttribute('for', `gb-a-${f.key}`);
    const val = view.assumptions[f.key] ?? f.default;
    let input: HTMLElement;
    if (f.kind === 'select') {
      const sel = e('select', 'assume-field') as HTMLSelectElement;
      sel.id = `gb-a-${f.key}`;
      for (const o of f.options ?? []) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === val) opt.selected = true;
        sel.append(opt);
      }
      if (handlers.onAssumption) sel.addEventListener('change', () => handlers.onAssumption!(f.key, sel.value));
      input = sel;
    } else {
      const inp = e('input', 'assume-field') as HTMLInputElement;
      inp.id = `gb-a-${f.key}`;
      inp.type = 'number';
      inp.value = val;
      if (handlers.onAssumption) inp.addEventListener('input', () => handlers.onAssumption!(f.key, inp.value));
      input = inp;
    }
    row.append(lab, input);
    details.append(row);
  }
  card.append(details);

  // 7) Send to analyser
  const send = e('button', 'send-btn', 'Send to my analyser →') as HTMLButtonElement;
  send.type = 'button';
  if (handlers.onSend) send.addEventListener('click', () => handlers.onSend!());
  card.append(send);

  card.append(e('p', 'sample-note', `${L.portal} · read ${L.source === 'embedded' ? 'cleanly' : 'from fallback'} · ${L.extractorVersion}`));
  app.append(card);
}

// ---------------- interactive controller (extension only) ----------------

interface Ctx {
  url: string;
  listing: NormalisedListing | null;
  failure: string | null;
  strategy: StrategyId;
  rent: string;
  assumptions: Record<string, string>;
  sector: SectorFile | null;
  sectorId: string | null;
  ewReject: string | null;
  manualArea: string;
}

function resolveFloorArea(ctx: Ctx): { sqm: number | null; source: PanelView['floorAreaSource'] } {
  const l = ctx.listing!;
  if (l.floorAreaSqm.status === 'found' && l.floorAreaSqm.value) return { sqm: l.floorAreaSqm.value, source: 'listing' };
  const epc = floorAreaFromSector(ctx.sector, l.address.value);
  if (epc) return { sqm: epc, source: 'epc-sector' };
  if (ctx.manualArea && Number(ctx.manualArea) > 0) return { sqm: Math.round(Number(ctx.manualArea)), source: 'manual' };
  return { sqm: null, source: 'none' };
}

function draw(ctx: Ctx): void {
  if (ctx.failure) return renderFailure(ctx.failure);
  if (!ctx.listing) return renderEmpty();
  const fa = resolveFloorArea(ctx);
  const result = scoreListing(ctx.listing, {
    strategy: ctx.strategy,
    rent: ctx.rent ? Number(ctx.rent) : null,
    assumptions: ctx.assumptions,
    sector: ctx.sector,
    floorAreaSqm: fa.sqm,
    minSectorSales: FALLBACK_CONFIG.thresholds.minSectorSales,
  });
  const view: PanelView = {
    listing: ctx.listing,
    strategy: ctx.strategy,
    result,
    rent: ctx.rent,
    assumptions: ctx.assumptions,
    floorAreaSqm: fa.sqm,
    floorAreaSource: fa.source,
    sectorId: ctx.sectorId,
    ewReject: ctx.ewReject,
    webBase: WEB_BASE,
  };
  renderScored(view, {
    onStrategy: (s) => { ctx.strategy = s; void store.setStrategy(s); redraw(ctx); },
    onRent: (v) => { ctx.rent = v; if (ctx.sectorId) void store.setRent(ctx.sectorId, v); redraw(ctx); },
    onArea: (v) => { ctx.manualArea = v; if (ctx.listing?.listingId.value) void store.setManualArea(ctx.listing.listingId.value, v); redraw(ctx); },
    onAssumption: (k, v) => { ctx.assumptions = { ...ctx.assumptions, [k]: v }; void store.setAssumptions(ctx.assumptions); redraw(ctx); },
    onSend: () => {
      const url = buildAnalyserUrl(WEB_BASE, ctx.listing!, { strategy: ctx.strategy, rent: ctx.rent, floorAreaSqm: fa.sqm, assumptions: ctx.assumptions });
      chrome.tabs.create({ url });
    },
  });
}

/** Re-render while preserving input focus, caret and the assumptions accordion —
 * so typing a rent/assumption doesn't drop focus after one character. */
function redraw(ctx: Ctx): void {
  const active = document.activeElement as (HTMLInputElement & HTMLSelectElement) | null;
  const focusId = active?.id || '';
  let caret: number | null = null;
  try { caret = active?.selectionStart ?? null; } catch { caret = null; }
  const detailsOpen = (document.querySelector('.assumptions') as HTMLDetailsElement | null)?.open ?? false;
  draw(ctx);
  const det = document.querySelector('.assumptions') as HTMLDetailsElement | null;
  if (det && detailsOpen) det.open = true;
  if (focusId) {
    const el = document.getElementById(focusId) as HTMLInputElement | null;
    if (el) {
      el.focus();
      if (caret != null) { try { el.setSelectionRange(caret, caret); } catch { /* number inputs reject it */ } }
    }
  }
}

let lastUrl = '';

async function loadFor(tabId: number, url: string): Promise<void> {
  const ctx: Ctx = {
    url, listing: null, failure: null,
    strategy: (await store.getStrategy()) as StrategyId,
    rent: '', assumptions: await store.getAssumptions(),
    sector: null, sectorId: null, ewReject: null, manualArea: '',
  };
  let result: ExtractResult;
  try {
    result = (await chrome.tabs.sendMessage(tabId, { type: EXTRACT_MESSAGE })) as ExtractResult;
  } catch {
    ctx.failure = 'Open a Rightmove or Zoopla listing, then reopen this panel.';
    draw(ctx);
    return;
  }
  if (!result.ok) { ctx.failure = result.message; draw(ctx); return; }
  ctx.listing = result.listing;

  // sector + rent + EW gate (from the postcode)
  if (ctx.listing.postcode.value) {
    const pc = postcodeToSector(ctx.listing.postcode.value);
    if (!pc.inEnglandWales) ctx.ewReject = pc.message;
    else {
      ctx.sectorId = pc.sector;
      ctx.rent = await store.getRent(pc.sector);
    }
  }
  if (ctx.listing.listingId.value) ctx.manualArea = await store.getManualArea(ctx.listing.listingId.value);
  draw(ctx); // first paint immediately (no sector yet)

  // enrich with our sector data (best-effort; never blocks first paint)
  if (ctx.sectorId && !ctx.ewReject) {
    try {
      ctx.sector = await getSector(ctx.sectorId);
    } catch {
      ctx.sector = null;
    }
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
  void refreshRemoteConfig(); // best-effort remote config pull
  void tick();
  // Re-extract on SPA navigation / tab switches (both portals are client-routed):
  // the active tab's URL updates on pushState, so poll it while the panel is open.
  setInterval(() => void tick(), 1500);
}

// Auto-start only in the extension (chrome present). Tests import the render
// functions and drive them directly, so we don't render at import time there.
const runtime = globalThis as unknown as { chrome?: { tabs?: { query?: unknown } } };
if (runtime.chrome?.tabs?.query) init();
