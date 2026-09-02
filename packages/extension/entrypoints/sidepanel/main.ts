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
  readSellerSignals,
  bandLabel,
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
  type SellerSignals,
  type SectorLoad,
  type CashNeeded,
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
// refurbCost is a PER-DEAL unknown for EVERY strategy that uses it (it must never
// be a global Settings field — that was the E8.1 leak). It stays optional (not in
// REQUIRED_UNKNOWNS), defaulting to £0.
const TRIAGE_FIELDS: Record<StrategyId, { key: string; label: string; unit: string }[]> = {
  btl: [{ key: 'rent', label: 'Monthly rent', unit: '£/mo' }, { key: 'refurbCost', label: 'Refurb budget', unit: '£' }],
  flip: [{ key: 'gdv', label: 'End value after works', unit: '£' }, { key: 'refurbCost', label: 'Refurb budget', unit: '£' }],
  brrrr: [{ key: 'arv', label: 'End value after works', unit: '£' }, { key: 'rent', label: 'Monthly rent', unit: '£/mo' }, { key: 'refurbCost', label: 'Refurb budget', unit: '£' }],
  hmo: [{ key: 'roomRent', label: 'Rent per room', unit: '£/mo' }, { key: 'rooms', label: 'Lettable rooms', unit: '' }, { key: 'refurbCost', label: 'Conversion / refurb budget', unit: '£' }],
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
    // Distinct honest states (E8.1): a data GAP is not a load FAILURE.
    case 'no-area-data': return { pill: 'st-unknown', label: 'no data', text: 'We haven’t got sold-price data for this area yet' };
    case 'load-failed': return { pill: 'st-unknown', label: 'retry', text: 'Couldn’t load sold prices — check your connection and reopen the panel' };
    case 'loading': return { pill: 'st-unknown', label: '…', text: 'Loading nearby sold prices…' };
    default: return { pill: 'st-unknown', label: '—', text: 'Nearby sold prices aren’t available' };
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
  /** Negotiation context, SEPARATE from the score (E8). */
  signals?: SellerSignals;
  /** Whether the Seller Signals card is expanded (kept across redraws). */
  signalsOpen?: boolean;
  /** A brief plain line describing the last lever change (E8.1 #14). */
  lastChange?: string | null;
  /** Auction detected (flag OR wording) — one source of truth (E8.1). */
  isAuction?: boolean;
  ewReject?: string | null;
}
export interface PanelHandlers {
  onStrategy?: (s: StrategyId) => void;
  onUnknown?: (key: string, v: string) => void;
  onArea?: (v: string) => void;
  onSetting?: (key: string, v: string) => void;
  onCriterion?: (key: keyof Criteria, v: string) => void;
  onLever?: (lever: Lever, value: string) => void;
  onOpenSettings?: () => void;
  onCloseSettings?: () => void;
  onSend?: () => void;
  onToggleSignals?: (open: boolean) => void;
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
  // Cashflow is triaged on BEFORE-TAX (the real triage number); after-tax is
  // shown beneath as secondary context (E8.1 #4). Tax maths in core is unchanged.
  const an = deal?.analysis as { cashflowBeforeTax?: { value: number }; cashflowAfterTax?: { value: number } } | undefined;
  for (const c of rows) {
    const isSold = /sold/i.test(c.name);
    const isRoom = /room/i.test(c.name) && /size|legal|minimum/i.test(c.name);
    const isCashflow = /cashflow/i.test(c.name);
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
      if (isCashflow && an?.cashflowBeforeTax) {
        li.append(e('span', 'c-cashflow-lead', `${fmtGBP(an.cashflowBeforeTax.value)}/mo before tax`));
        if (an.cashflowAfterTax) li.append(e('span', 'c-cashflow-sub', `≈ ${fmtGBP(an.cashflowAfterTax.value)}/mo after tax — tax depends on your structure & circumstances`));
      }
    }
    ul.append(li);
  }
  return ul;
}

// Flexibility is an opportunity (accent); impairment is a WARNING (red/amber) —
// they must NOT share a colour scale, or a strong warning would read as positive.
const FLEX_PILL: Record<string, string> = { strong: 'ss-strong', some: 'ss-some', 'none-seen': 'ss-none' };
const IMP_PILL: Record<string, string> = { strong: 'ss-warn', some: 'ss-caution', 'none-seen': 'ss-none' };

/**
 * Seller Signals card (E8) — negotiation CONTEXT, visually separate and BELOW
 * the verdict. Collapsed to its two band lines; evidence expands. Two reads are
 * never merged; chain-free sits under "worth knowing", never in flexibility.
 */
function sellerSignalsCard(view: PanelView, h: PanelHandlers): HTMLElement | null {
  const s = view.signals;
  if (!s) return null;
  const box = e('details', 'seller-signals') as HTMLDetailsElement;
  if (view.signalsOpen) box.open = true;

  // COLLAPSED = exactly two short band lines + the time-on-market line, nothing
  // else (E8.2 #7). Everything else (evidence, portal caveats, the score note)
  // lives in the expanded detail.
  const sum = e('summary', 'ss-summary');
  sum.append(e('span', `ss-band ${FLEX_PILL[s.flexibility.band]}`, bandLabel('flexibility', s.flexibility.band)));
  sum.append(e('span', `ss-band ${IMP_PILL[s.impairment.band]}`, bandLabel('impairment', s.impairment.band)));
  sum.append(e('span', 'ss-time', s.timeOnMarket));
  const toggle = e('span', 'ss-expander', view.signalsOpen ? 'Hide detail ▲' : 'More detail ▼');
  toggle.setAttribute('aria-hidden', 'true');
  sum.append(toggle);
  box.append(sum);
  // Keep the pill label in sync with the native <details> without a full rebuild,
  // so it never reads "More detail" while already open (E8.2 review).
  box.addEventListener('toggle', () => {
    toggle.textContent = box.open ? 'Hide detail ▲' : 'More detail ▼';
    if (h.onToggleSignals) h.onToggleSignals(box.open);
  });

  const body = e('div', 'ss-body');
  const read = (heading: string, r: SellerSignals['flexibility']): HTMLElement => {
    const sec = e('div', 'ss-read');
    sec.append(e('h2', 'ss-read-head', heading));
    // The band line already says "none seen" — don't repeat it; just show evidence
    // (when any) and the honest caveats.
    if (r.evidence.length) {
      const ul = e('ul', 'ss-evidence');
      for (const ev of r.evidence) {
        const li = e('li', 'ss-ev');
        li.append(e('span', 'ss-ev-label', ev.label));
        if (ev.phrase) li.append(e('span', 'ss-ev-phrase', ev.phrase));
        li.append(e('span', 'ss-ev-src', `— ${ev.source === 'listing' ? 'from the description' : `on ${ev.source}`}`));
        ul.append(li);
      }
      sec.append(ul);
    }
    for (const n of r.notes) sec.append(e('p', 'ss-note', n));
    // Never leave a bare heading with no body (E8.2 review).
    if (!r.evidence.length && !r.notes.length) sec.append(e('p', 'ss-empty', 'Nothing flagged.'));
    return sec;
  };
  body.append(read('Seller flexibility', s.flexibility));
  body.append(read('Impairment (a warning)', s.impairment));

  for (const w of s.worthKnowing) body.append(e('p', 'ss-worth', w));
  body.append(e('p', 'ss-foot', 'Context for negotiation — never moves the Deal Score.'));
  box.append(body);
  return box;
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

const fmtThousands = (digits: string): string => (digits ? Number(digits).toLocaleString('en-GB') : '');
const fmtGBP = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

/**
 * A MONEY input that shows "£137,152" with thousands separators as the user
 * types, while handing back a clean digit string for storage/scoring (E8.1 #10).
 * Caret is preserved by counting digits, not characters.
 */
function moneyField(id: string, raw: string, placeholder: string, onRaw?: (digits: string) => void): HTMLElement {
  const wrap = e('div', 'money-wrap');
  wrap.append(e('span', 'money-prefix', '£'));
  const inp = e('input', 'input-field money-input') as HTMLInputElement;
  inp.id = id;
  inp.type = 'text';
  inp.inputMode = 'numeric';
  inp.autocomplete = 'off';
  inp.placeholder = placeholder;
  inp.value = fmtThousands((raw || '').replace(/[^\d]/g, ''));
  if (onRaw) {
    inp.addEventListener('input', () => {
      const caret = inp.selectionStart ?? inp.value.length;
      const digitsBefore = (inp.value.slice(0, caret).match(/\d/g) || []).length;
      const digits = inp.value.replace(/[^\d]/g, '');
      inp.value = fmtThousands(digits);
      let pos = 0;
      let seen = 0;
      while (pos < inp.value.length && seen < digitsBefore) {
        if (/\d/.test(inp.value[pos])) seen++;
        pos++;
      }
      try { inp.setSelectionRange(pos, pos); } catch { /* non-text inputs */ }
      onRaw(digits);
    });
  }
  wrap.append(inp);
  return wrap;
}

const MONEY_KEYS = new Set(['rent', 'gdv', 'arv', 'refurbCost', 'roomRent']);

/**
 * The FIVE front-of-panel levers that change the answer (E8.1 #13), per strategy.
 * deposit%/rate% are personal CRITERIA; funding/buyingAs/management are settings.
 * Management applies to EVERY rental strategy (BTL/BRRRR/HMO), never Flip.
 */
type LeverKind = 'pct' | 'select';
interface Lever {
  key: string;
  label: string;
  kind: LeverKind;
  store: 'criteria' | 'settings';
  criterionKey?: keyof Criteria;
  options?: { value: string; label: string }[];
}
const FUNDING_CASH_BRIDGE = [{ value: 'bridging', label: 'Bridging' }, { value: 'cash', label: 'Cash' }];
const BUYING_AS = [{ value: 'basic', label: 'Personally (basic)' }, { value: 'higher', label: 'Personally (higher)' }, { value: 'ltd', label: 'Through a company' }];
const FLIP_AS = [{ value: 'personal', label: 'Personally' }, { value: 'ltd', label: 'Through a company' }];
const MGMT = [{ value: 'agent', label: 'Letting agent' }, { value: 'self', label: 'Self-managed' }];
// Every lever below must map to a key the strategy's score ACTUALLY reads, so it
// truly changes the answer (E8.1 review): BRRRR has no deposit% (funding sets its
// cash), and Flip taxes on flipAs, not buyingAs.
const LEVERS: Record<StrategyId, Lever[]> = {
  btl: [
    { key: 'deposit', label: 'Deposit %', kind: 'pct', store: 'criteria', criterionKey: 'depositPct' },
    { key: 'rate', label: 'Mortgage rate %', kind: 'pct', store: 'criteria', criterionKey: 'ratePct' },
    { key: 'buyingAs', label: 'Buying as', kind: 'select', store: 'settings', options: BUYING_AS },
    { key: 'mgmt', label: 'Management', kind: 'select', store: 'settings', options: MGMT },
  ],
  hmo: [
    { key: 'deposit', label: 'Deposit %', kind: 'pct', store: 'criteria', criterionKey: 'depositPct' },
    { key: 'rate', label: 'Mortgage rate %', kind: 'pct', store: 'criteria', criterionKey: 'ratePct' },
    { key: 'buyingAs', label: 'Buying as', kind: 'select', store: 'settings', options: BUYING_AS },
    { key: 'mgmt', label: 'Management', kind: 'select', store: 'settings', options: MGMT },
  ],
  brrrr: [
    { key: 'rate', label: 'Refinance rate %', kind: 'pct', store: 'criteria', criterionKey: 'ratePct' },
    { key: 'funding', label: 'Funding', kind: 'select', store: 'settings', options: FUNDING_CASH_BRIDGE },
    { key: 'buyingAs', label: 'Buying as', kind: 'select', store: 'settings', options: BUYING_AS },
    { key: 'mgmt', label: 'Management', kind: 'select', store: 'settings', options: MGMT },
  ],
  flip: [
    { key: 'funding', label: 'Funding', kind: 'select', store: 'settings', options: FUNDING_CASH_BRIDGE },
    { key: 'flipAs', label: 'Buying as', kind: 'select', store: 'settings', options: FLIP_AS },
  ],
};

/** Current effective value of a lever (criteria/settings → config default). */
function leverValue(view: PanelView, lever: Lever): string {
  if (lever.store === 'criteria' && lever.criterionKey) {
    const v = view.criteria[lever.criterionKey];
    if (v != null) return String(v);
    // deposit/rate can live in strategyInputs OR assumptions — search both, so a
    // lever never renders blank when a config default exists (E8.1 review #5).
    const cfgField = [...strategyById(view.strategy)!.strategyInputs, ...strategyById(view.strategy)!.assumptions].find((f) => f.key === lever.key);
    return cfgField?.default ?? '';
  }
  const s = view.settings[lever.key];
  if (s != null && s !== '') return s;
  const cfgField = [...strategyById(view.strategy)!.strategyInputs, ...strategyById(view.strategy)!.assumptions].find((f) => f.key === lever.key);
  return cfgField?.default ?? (lever.options?.[0].value ?? '');
}

/** The five levers, compact, directly under the unknowns (E8.1 #13). */
function leverControls(view: PanelView, h: PanelHandlers): HTMLElement {
  const box = e('div', 'levers');
  box.append(e('h2', 'levers-head', 'What changes the answer'));
  const grid = e('div', 'levers-grid');
  for (const lever of LEVERS[view.strategy]) {
    const row = e('div', 'lever');
    const lab = e('label', 'lever-label', lever.label);
    lab.setAttribute('for', `gb-l-${lever.key}`);
    let input: HTMLElement;
    if (lever.kind === 'select') {
      const selEl = e('select', 'input-field lever-field') as HTMLSelectElement;
      selEl.id = `gb-l-${lever.key}`;
      const cur = leverValue(view, lever);
      for (const o of lever.options ?? []) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === cur) opt.selected = true;
        selEl.append(opt);
      }
      if (h.onLever) selEl.addEventListener('change', () => h.onLever!(lever, selEl.value));
      input = selEl;
    } else {
      const inp = e('input', 'input-field lever-field') as HTMLInputElement;
      inp.id = `gb-l-${lever.key}`;
      inp.type = 'number';
      inp.inputMode = 'decimal';
      inp.value = leverValue(view, lever);
      if (h.onLever) inp.addEventListener('input', () => h.onLever!(lever, inp.value));
      input = inp;
    }
    row.append(lab, input);
    grid.append(row);
  }
  box.append(grid);
  if (view.lastChange) box.append(e('p', 'change-signal', view.lastChange));
  return box;
}

/** "What you need to put in" — the up-front cash breakdown (E8.1 #15). */
function costsCard(view: PanelView): HTMLElement | null {
  const cn = view.result.cashNeeded;
  if (!cn) return null;
  const box = e('section', 'costs-card');
  box.append(e('h2', 'costs-head', scoreCopy.cashNeeded.heading));
  box.append(e('p', 'costs-intro', scoreCopy.cashNeeded.intro));
  const ul = e('ul', 'costs-list');
  for (const line of cn.lines) {
    const li = e('li', 'costs-line');
    li.append(e('span', 'costs-label', line.label + (line.estimate ? ' *' : '')));
    li.append(e('span', 'costs-amount', line.amount == null ? 'check particulars' : fmtGBP(line.amount)));
    ul.append(li);
  }
  box.append(ul);
  const total = e('p', 'costs-total');
  total.append(e('span', 'costs-total-label', 'Total cash needed'));
  total.append(e('span', 'costs-total-amount', fmtGBP(cn.total)));
  box.append(total);
  if (cn.bridging) {
    box.append(e('p', 'costs-split', scoreCopy.cashNeeded.bridgingSplit.replace('{borrowed}', fmtGBP(cn.bridging.borrowed)).replace('{cash}', fmtGBP(cn.bridging.cash))));
  }
  if (cn.hasAuctionEstimate) box.append(e('p', 'costs-note', `* Auction fees — ${scoreCopy.cashNeeded.auctionFeesNote}. They add to the cash above.`));
  return box;
}

function areaSourceLabel(source: PanelView['floorAreaSource']): string {
  return source === 'listing' ? 'from the listing' : source === 'epc-sector' ? 'from our EPC data' : source === 'manual' ? 'you typed it' : 'unknown';
}

/**
 * Floor-area block — always LABELS the source (listing / EPC / you typed it),
 * shows a range honestly, and when unknown presents a prominent input. `prompt`
 * makes the empty-state hint say it must be filled first for a credible end value.
 */
function floorAreaBlock(view: PanelView, h: PanelHandlers, prompt: boolean): HTMLElement {
  const wrap = e('div', 'floor-area-block');
  if (view.floorAreaRange) {
    wrap.append(e('p', 'floor-area', `Floor area: ${view.floorAreaRange.minSqm}–${view.floorAreaRange.maxSqm} m² (a range on the listing; using the ${view.floorAreaSqm} m² midpoint)`));
  } else if (view.floorAreaSqm && (view.floorAreaSource === 'listing' || view.floorAreaSource === 'epc-sector')) {
    wrap.append(e('p', 'floor-area', `Floor area: ${view.floorAreaSqm} m² (${areaSourceLabel(view.floorAreaSource)})`));
  } else {
    const row = e('div', 'input-row');
    const lab = e('label', 'input-label', 'Floor area (m²)');
    lab.setAttribute('for', 'gb-area');
    row.append(lab, numberField('gb-area', view.manualAreaInput, prompt ? 'add this first — needed for a credible end value' : 'not on the listing — you type it', h.onArea));
    if (view.floorAreaSqm && view.floorAreaSource === 'manual') row.append(e('span', 'suggest-note', `using ${view.floorAreaSqm} m² (you typed it)`));
    wrap.append(row);
  }
  return wrap;
}

/** Prominent auction warning ABOVE the components (E8.1 #7). */
function auctionCard(view: PanelView): HTMLElement | null {
  if (!view.isAuction) return null;
  const box = e('section', 'auction-card');
  box.setAttribute('role', 'note');
  box.append(e('h2', 'auction-head', `⚠ ${scoreCopy.auction.heading}`));
  const ul = e('ul', 'auction-list');
  for (const point of [scoreCopy.auction.guide, scoreCopy.auction.fees, scoreCopy.auction.legal]) ul.append(e('li', 'auction-point', point));
  box.append(ul);
  return box;
}

export function renderTriage(view: PanelView, h: PanelHandlers = {}): void {
  const app = root();
  const L = view.listing;
  const card = e('section', 'glass card');

  // 1) property line — "Flat 2, 8 Earl Street, SA1 2HG" (saon + number kept, E8.1).
  const addr = L.address.value;
  const streetLine = [addr?.paon, addr?.street].filter(Boolean).join(' ');
  const h1 = [addr?.saon, streetLine, L.postcode.value].filter(Boolean).join(', ') || L.postcode.value || 'This property';
  card.append(e('h1', 'prop-addr', h1));
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

  // 3) verdict + headline
  card.append(chip(view.result.deal, view.result, view.strategy));
  if (view.usingSuggested) card.append(e('p', 'suggest-note', 'Score uses a suggested end value — set your own to be sure.'));
  if (view.result.note) card.append(e('p', 'read-fail', view.result.note));
  // Honest out-of-market line — priced above local stock, works on no strategy (E7.1).
  if (view.outOfMarket) card.append(e('p', 'out-of-market', scoreCopy.listingNotes.outOfMarket));
  // 4) what's holding it back
  if (view.result.deal?.bindingConstraint) {
    const bn = e('p', 'binding-note');
    bn.append(e('span', 'binding-label', 'What’s holding it back: '));
    bn.append(document.createTextNode(view.result.deal.bindingConstraint.plainExplanation));
    card.append(bn);
  }

  // 4b) AUCTION warning — prominent, ABOVE the components (E8.1 #7).
  const auction = auctionCard(view);
  if (auction) card.append(auction);

  // 5) components
  card.append(componentsList(view));

  // 6) "What you need to put in" — costs breakdown (E8.1 #15).
  const costs = costsCard(view);
  if (costs) card.append(costs);

  // 7) the unknowns. For value-add strategies the FLOOR AREA sits ABOVE the end
  // value — it must be filled first for a credible end value (E8.2 #6).
  const needsEndValue = view.strategy === 'flip' || view.strategy === 'brrrr';
  if (needsEndValue) card.append(floorAreaBlock(view, h, true));

  for (const f of TRIAGE_FIELDS[view.strategy]) {
    const row = e('div', 'input-row');
    const lab = e('label', 'input-label', `${f.label}${f.unit ? ` (${f.unit})` : ''}`);
    lab.setAttribute('for', `gb-u-${f.key}`);
    const sug = view.suggestions[f.key];
    const placeholder = f.key === 'rent' ? 'what it would let for' : sug && sug.value ? sug.label : 'you decide';
    const onRaw = h.onUnknown ? (v: string) => h.onUnknown!(f.key, v) : undefined;
    const field = MONEY_KEYS.has(f.key)
      ? moneyField(`gb-u-${f.key}`, view.unknowns[f.key] ?? '', placeholder, onRaw)
      : numberField(`gb-u-${f.key}`, view.unknowns[f.key] ?? '', placeholder, onRaw);
    row.append(lab, field);
    if (sug) {
      // An end-value suggestion derived from £/sqm MUST name the source of the area
      // (never present it as if we had a floor area we don't) — E8.2 #5.
      let label = sug.label;
      if ((f.key === 'gdv' || f.key === 'arv') && sug.value && view.floorAreaSqm && /\/m²/.test(label)) {
        label += ` · area ${areaSourceLabel(view.floorAreaSource)}`;
      }
      row.append(e('span', 'suggest-note', label));
    }
    card.append(row);
    if (f.key === 'rent' && view.rentCleared && !(view.unknowns.rent ?? '')) {
      card.append(e('p', 'suggest-note cleared-note', scoreCopy.listingNotes.rememberedRentUnfit));
    }
  }

  // 7b) the FIVE front levers + the change signal (E8.1 #13/#14).
  card.append(leverControls(view, h));

  // For BTL/HMO (no end value) the floor area is secondary — show it after the levers.
  if (!needsEndValue) card.append(floorAreaBlock(view, h, false));

  // 8) Seller Signals — negotiation context, separate, below the inputs (E8.1 #8/#16).
  const signals = sellerSignalsCard(view, h);
  if (signals) card.append(signals);

  // 9) "Using your settings ⚙" + Send
  const settingsLink = e('button', 'settings-link', 'More in settings ⚙') as HTMLButtonElement;
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

  // Heading is WHITE and spaced from the lime back link (E8.1 #9).
  card.append(e('h2', 'settings-title', 'What does a good deal look like to you?'));
  // deposit % and rate % are now front-of-panel LEVERS, so they leave this list.
  for (const f of criteriaFields().filter((f) => f.key !== 'depositPct' && f.key !== 'ratePct')) {
    const row = e('div', 'assume-row');
    const lab = e('label', 'assume-label', `${f.label} (${f.unit})`);
    lab.setAttribute('for', `gb-c-${f.key}`);
    const isMoney = f.unit.includes('£');
    if (isMoney) {
      row.append(lab, moneyField(`gb-c-${f.key}`, view.criteria[f.key] != null ? String(view.criteria[f.key]) : '', String(f.default), h.onCriterion ? (raw) => h.onCriterion!(f.key, raw) : undefined));
      card.append(row);
      continue;
    }
    const inp = e('input', 'assume-field') as HTMLInputElement;
    inp.id = `gb-c-${f.key}`;
    inp.type = 'number';
    inp.placeholder = String(f.default);
    inp.value = view.criteria[f.key] != null ? String(view.criteria[f.key]) : '';
    if (h.onCriterion) inp.addEventListener('input', () => h.onCriterion!(f.key, inp.value));
    row.append(lab, inp);
    card.append(row);
  }

  card.append(e('h2', 'settings-title settings-sub', `${strategyById(view.strategy)!.name} settings`));
  const cfg = strategyById(view.strategy)!;
  // Skip everything that now lives on the LISTING view: EVERY strategy's triage
  // unknowns (so a per-deal figure like refurbCost is never a global setting —
  // E8.1 #1 leak fix) and the five front levers (deposit/rate/buyingAs/funding/mgmt).
  const allTriageKeys = Object.values(TRIAGE_FIELDS).flat().map((f) => f.key);
  const skip = new Set([...allTriageKeys, 'deposit', 'rate', 'buyingAs', 'flipAs', 'funding', 'mgmt']);
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
    } else if (f.unit === '£') {
      // Money fields format with £ + thousands as the user types (E8.1 #10).
      input = moneyField(`gb-s-${f.key}`, val, String(f.default), h.onSetting ? (raw) => h.onSetting!(f.key, raw) : undefined);
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
  /** Whether the Seller Signals card is expanded — kept across redraws (E8). */
  signalsOpen: boolean;
  /** How the sector fetch resolved, for honest sold-price messaging (E8.1). */
  sectorLoad: SectorLoad;
  /** The last front-lever change, shown briefly as a plain effect line (E8.1). */
  lastChange: { text: string; token: number } | null;
}

/** Change-signal token so a stale timer never clears a newer message. */
let changeToken = 0;
/** The ctx for the currently-loaded listing — a stale timer only acts on this one. */
let activeCtx: Ctx | null = null;

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
  sanityRefurbMaxFactor: FALLBACK_CONFIG.thresholds.sanityRefurbMaxFactor,
  sanityEndValueMaxFactor: FALLBACK_CONFIG.thresholds.sanityEndValueMaxFactor,
  sanityCashMaxFactor: FALLBACK_CONFIG.thresholds.sanityCashMaxFactor,
};

/** Score one strategy end-to-end (used for the current tab and the all-four check). */
function scoreStrategy(ctx: Ctx, strategy: StrategyId, faSqm: number | null, isAuction: boolean): { result: ScoreListingResult; unknowns: Record<string, string>; suggestedKeys: Set<string>; suggestions: Record<string, { value: string | null; label: string }> } {
  const suggestions = smartDefaults(strategy, ctx.listing!, ctx.sector, faSqm, SANITY_OPTS);
  const { unknowns, suggestedKeys } = effectiveUnknowns(ctx, strategy, suggestions);
  const result = scoreListing(ctx.listing!, {
    strategy, unknowns, settings: ctx.settings, criteria: ctx.criteria,
    sector: ctx.sector, floorAreaSqm: faSqm, sectorLoad: ctx.sectorLoad, isAuction, ...SANITY_OPTS,
  });
  return { result, unknowns, suggestedKeys, suggestions };
}

/** One source of truth for "is this an auction" — Zoopla's flag OR wording (E8.1). */
function detectAuction(listing: NormalisedListing, signals: SellerSignals | undefined): boolean {
  return listing.isAuction.value === true || (signals?.impairment.evidence.some((ev) => /auction/i.test(ev.label)) ?? false);
}

function draw(ctx: Ctx): void {
  if (ctx.failure) return renderFailure(ctx.failure);
  if (!ctx.listing) return renderEmpty();
  const fa = resolveFloorArea(ctx);
  // Seller Signals — read from what the page already gave us, computed here and
  // NEVER fed into scoreListing/scoreDeal, so it can't move the score (E8).
  const signals = ctx.screen === 'triage' && !ctx.ewReject ? readSellerSignals(ctx.listing, FALLBACK_CONFIG.signals, new Date()) : undefined;
  const isAuction = detectAuction(ctx.listing, signals);
  const { result, unknowns, suggestedKeys, suggestions } = scoreStrategy(ctx, ctx.strategy, fa.sqm, isAuction);
  // Out-of-market only when the price is outside the local sold evidence AND no
  // strategy can be made to work — so score all four to be sure (E7.1). Only the
  // triage screen shows this line, so skip the extra three scores on Settings.
  let outOfMarket = false;
  if (ctx.screen === 'triage') {
    const verdicts = STRATEGIES.map((s) => (s.id === ctx.strategy ? result : scoreStrategy(ctx, s.id, fa.sqm, isAuction).result).deal?.verdict ?? null);
    outOfMarket = isOutOfMarket(result.priceVsSold.status, verdicts);
  }
  const view: PanelView = {
    screen: ctx.screen, listing: ctx.listing, strategy: ctx.strategy, result, unknowns, suggestions,
    settings: ctx.settings, criteria: ctx.criteria, floorAreaSqm: fa.sqm, floorAreaSource: fa.source, floorAreaRange: fa.range,
    manualAreaInput: ctx.manualArea, usingSuggested: suggestedKeys.size > 0 && !!result.deal,
    rentCleared: ctx.rentCleared, outOfMarket, signals, signalsOpen: ctx.signalsOpen, isAuction,
    lastChange: ctx.lastChange?.text ?? null, ewReject: ctx.ewReject,
  };
  const metricsOf = (r: ScoreListingResult): { score: number | null; cashflow: number | null; cashflowAfter: number | null; profit: number | null; moneyLeftIn: number | null } => {
    const a = r.deal?.analysis as { cashflowBeforeTax?: { value: number }; cashflowAfterTax?: { value: number }; profitAfterTax?: { value: number }; moneyLeftIn?: number } | undefined;
    return {
      score: r.deal?.score ?? null,
      cashflow: a?.cashflowBeforeTax?.value ?? null,
      cashflowAfter: a?.cashflowAfterTax?.value ?? null,
      // Flip has no cashflow — its after-tax PROFIT moves for both flip levers.
      profit: a?.profitAfterTax?.value ?? null,
      // BRRRR funding (cash↔bridging) moves ONLY money-left-in, not cashflow.
      moneyLeftIn: typeof a?.moneyLeftIn === 'number' ? a.moneyLeftIn : null,
    };
  };
  const onLever = (lever: Lever, value: string): void => {
    const before = metricsOf(result);
    const oldRaw = leverValue(view, lever);
    if (lever.store === 'criteria' && lever.criterionKey) {
      const c = { ...ctx.criteria };
      if (value.trim() === '') delete c[lever.criterionKey];
      else c[lever.criterionKey] = Number(value);
      ctx.criteria = c;
      void store.setCriteria(c);
    } else {
      ctx.settings = { ...ctx.settings, [lever.key]: value };
      void store.setSettings(ctx.settings);
    }
    const after = metricsOf(scoreStrategy(ctx, ctx.strategy, fa.sqm, isAuction).result);
    // Plain "what it did" line — direction + size, near the control (E8.1 #14). ALWAYS
    // shows a real effect (the £ figure) even when the banded score holds, and says
    // "same verdict band" rather than "7.5 → 7.5" so no lever ever looks inert (E8.2 #1).
    const disp = (raw: string): string => (lever.kind === 'select' ? (lever.options?.find((o) => o.value === raw)?.label ?? raw) : `${raw}%`);
    const money = (a: number | null, b: number | null): string | null => {
      if (a == null || b == null) return null;
      const d = Math.round(b - a);
      return d === 0 ? null : `${d >= 0 ? '+' : '−'}${fmtGBP(Math.abs(d))}`;
    };
    const effects: string[] = [];
    // Prefer the before-tax move; if a tax lever (buying as) left it unchanged, show
    // the after-tax move so a tax lever is never silent; else profit (flip); else
    // money-left-in (BRRRR funding moves only that). No lever ever looks inert.
    const cf = money(before.cashflow, after.cashflow) ?? money(before.cashflowAfter, after.cashflowAfter);
    const pf = money(before.profit, after.profit);
    const ml = money(before.moneyLeftIn, after.moneyLeftIn);
    if (cf) effects.push(`cashflow ${cf}/mo`);
    else if (pf) effects.push(`profit ${pf}`);
    else if (ml) effects.push(`money left in ${ml}`);
    if (before.score != null && after.score != null) {
      effects.push(after.score !== before.score ? `score ${before.score.toFixed(1)} → ${after.score.toFixed(1)}` : 'same verdict band');
    }
    const parts = [`${lever.label.replace(/ %$/, '')} ${disp(oldRaw)} → ${disp(value)}: ${effects.join(', ') || 'updated'}`];
    const token = ++changeToken;
    ctx.lastChange = { text: parts.join(' '), token };
    const live = document.getElementById('gb-live'); if (live) live.textContent = ctx.lastChange.text;
    setTimeout(() => { if (activeCtx === ctx && ctx.lastChange?.token === token) { ctx.lastChange = null; redraw(ctx); } }, 6000);
    redraw(ctx);
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
    onLever,
    onOpenSettings: () => { ctx.screen = 'settings'; draw(ctx); },
    onCloseSettings: () => { ctx.screen = 'triage'; draw(ctx); },
    onToggleSignals: (open) => { ctx.signalsOpen = open; },
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
  // The panel scrolls on the document, and draw() wipes + rebuilds #app. Capture
  // the scroll position and restore it AFTER the rebuild, and refocus WITHOUT
  // scrolling the field into view — otherwise typing jumps the view (E8.2 #3).
  const scroller = (document.scrollingElement || document.documentElement) as HTMLElement | null;
  const scrollTop = scroller?.scrollTop ?? 0;
  const oldTop = focusId ? (active?.offsetTop ?? null) : null;
  draw(ctx);
  let el: HTMLInputElement | null = null;
  if (focusId) {
    el = document.getElementById(focusId) as HTMLInputElement | null;
    if (el) { el.focus({ preventScroll: true }); if (caret != null) { try { el.setSelectionRange(caret, caret); } catch { /* number inputs */ } } }
  }
  // Restore the scroll so the FIELD stays put — anchored to its own shift, so a
  // re-score that changes the height of content above it doesn't move it either.
  if (scroller) scroller.scrollTop = el && oldTop != null ? scrollTop + (el.offsetTop - oldTop) : scrollTop;
}

let lastUrl = '';

async function loadFor(tabId: number, url: string): Promise<void> {
  const ctx: Ctx = {
    url, listing: null, failure: null, screen: 'triage',
    strategy: (await store.getStrategy()) as StrategyId,
    rent: '', listingUnknowns: {}, settings: await store.getSettings(), criteria: await store.getCriteria(),
    sector: null, sectorId: null, ewReject: null, manualArea: '', cleared: new Set(), rentCleared: false, signalsOpen: false,
    sectorLoad: 'ok', lastChange: null,
  };
  activeCtx = ctx; // a stale change-signal timer must never redraw a since-navigated listing
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
  // Set 'loading' BEFORE the first paint when a fetch will actually run, so the
  // sold-price line reads "Loading…" and never flashes a false "no data" (E8.1 review).
  if (ctx.sectorId && !ctx.ewReject) ctx.sectorLoad = 'loading';
  draw(ctx);
  if (ctx.sectorId && !ctx.ewReject) {
    try {
      ctx.sector = await getSector(ctx.sectorId);
      ctx.sectorLoad = 'ok';
    } catch (err) {
      // Keep WHY it failed so the panel can say "no data for this area yet"
      // (a genuine gap) rather than "couldn't load" (transient) — E8.1.
      ctx.sector = null;
      const kind = (err as { kind?: string })?.kind;
      ctx.sectorLoad = kind === 'NotFound' ? 'not-found' : 'load-failed';
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
  void refreshRemoteConfig();
  void tick();
  setInterval(() => void tick(), 1500);
}

const runtime = globalThis as unknown as { chrome?: { tabs?: { query?: unknown } } };
if (runtime.chrome?.tabs?.query) init();

/**
 * Test-only seam (E8.2): mount the REAL controller (draw/redraw/onLever) over a
 * given listing so a test can dispatch actual DOM events on the levers and read
 * the DISPLAYED score — exercising the live path, not just the scoring function.
 */
export function __mountForTest(
  listing: NormalisedListing,
  opts: { sector?: SectorFile | null; strategy?: StrategyId; rent?: string; listingUnknowns?: Record<string, string>; settings?: Record<string, string>; criteria?: Criteria; sectorLoad?: SectorLoad } = {},
): void {
  const ctx: Ctx = {
    url: 'test', listing, failure: null, screen: 'triage', strategy: opts.strategy ?? 'btl',
    rent: opts.rent ?? '', listingUnknowns: opts.listingUnknowns ?? {}, settings: opts.settings ?? {}, criteria: opts.criteria ?? {},
    sector: opts.sector ?? null, sectorId: opts.sector ? 'X' : null, ewReject: null, manualArea: '',
    cleared: new Set(), rentCleared: false, signalsOpen: false, sectorLoad: opts.sectorLoad ?? 'ok', lastChange: null,
  };
  activeCtx = ctx;
  draw(ctx);
}
