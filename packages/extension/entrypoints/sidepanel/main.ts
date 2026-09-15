/**
 * X1 — THE TRIAGE PANEL. One job: help somebody decide in seconds whether a
 * listing is worth pursuing or worth killing.
 *
 * ── THE LAW THIS FILE LIVES UNDER ───────────────────────────────────────────
 * THE PANEL MAY WARN. IT MAY STATE FACTS. IT MAY NEVER BLESS.
 *
 * No score, no verdict, no "good deal", no "good area", nothing that reads as
 * an endorsement. The reason is hard and worth writing down: no free dataset
 * resolves below about 1,500 people, so this tool genuinely cannot see the
 * street, the neighbours, the condition or the layout — the very things that
 * most often kill a deal. Telling somebody a property looks good when it is
 * cheap for a reason they cannot see would be the most damaging thing this
 * product has ever done.
 *
 * `triageCopy.test.ts` sweeps this file's own string literals as well as
 * TRIAGE_COPY, and fails if the words good, great, bargain, safe, opportunity
 * or value appear as a judgement. That test is the enforcement; this is why.
 *
 * ── TWO ZONES, AND NOTHING ELSE ─────────────────────────────────────────────
 * ZONE ONE — THE NUMBERS. Always visible. Only figures derivable from the
 *   listing itself: asking price, £/m² against real sold evidence, the purchase
 *   tax, and the cash needed to buy. Nothing that needs the user to supply a
 *   rent or an end value, because a guessed figure set in the same typeface as
 *   a read one is indistinguishable from a fact.
 * ZONE TWO — THE FLAGS. Silent unless it has something evidenced to say, and
 *   never more than four. Silence is reported as silence, never as an all clear.
 *
 * Beneath them: what the listing says about the seller's possible flexibility
 * (signals, never proof), and the handoff — which carries EVERYTHING, including
 * the photographs and the floor plan. Nothing is withheld from the panel to
 * force the click.
 *
 * ── WHAT THIS PANEL NO LONGER DOES, AND WHERE IT WENT ───────────────────────
 * The deal score, the four strategies' inputs, the levers (deposit, rate,
 * buying as, management), the comparables table, the monthly rent, the
 * price-versus-nearby-sold line and the floor-plan measure tool have all gone.
 * Everything that needs real inputs happens in the web app, which can ask
 * properly and show its working. The floor plan and the photographs still
 * travel there automatically in the handoff: the TOOL was removed, not the data.
 */
import {
  isListingUrl,
  flexibilitySignals,
  postcodeToSector,
  buildAnalyserUrl,
  getSector,
  getSectorsIndex,
  strategyById,
  criteriaFields,
  coreConfig,
  floorAreaFromSector,
  FALLBACK_CONFIG,
  // X1 — the triage modules. Every figure and every word comes from core, so the
  // panel renders and never decides (charter rule 3).
  TRIAGE_COPY,
  triageNumbers,
  priceBand,
  detectFlags,
  nearestSectors,
  socialMark,
  SOCIAL_MARKS,
  type TriageNumbers,
  type BandOutcome,
  type BandSale,
  type TriageFlag,
  type FlagId,
  type NormalisedListing,
  type ExtractResult,
  type StrategyId,
  type SectorFile,
  type Criteria,
  type FlexibilitySignals,
  type SectorLoad,
  fmtMoneyInput,
  moneyCaret,
  parseMoneyInput,
} from '@gil-bricks/core';
import { EXTRACT_MESSAGE, refreshRemoteConfig } from '../../src/extractPage';
import { PANEL_OPEN_MESSAGE } from '../../src/opener';
import * as store from '../../src/store';
import { ATTENTION, ATTENTION_COPY } from '../../src/attention';
import { lookupEpcArea } from '../../src/epcLookup';

const WEB_BASE = coreConfig.appBaseUrl;
const C = TRIAGE_COPY;

/**
 * The strategy switch survives, but it is NOT a lever and it does not sit with
 * the numbers. It chooses WHICH ANALYSER the handoff opens, so it lives with the
 * handoff button at the bottom where that is what it plainly means.
 */
const STRATEGIES: { id: StrategyId; label: string }[] = [
  { id: 'btl', label: 'BTL' }, { id: 'flip', label: 'Flip' }, { id: 'brrrr', label: 'BRRRR' }, { id: 'hmo', label: 'HMO' },
];

/** The reader (content script) runs at document_idle, so on a slow listing the
 * panel can be up BEFORE it is. That is transient — keep asking, and heal the
 * moment it answers, instead of latching "refresh needed" forever (D3). */
const READER = { attempts: 8, waitMs: 1500 } as const;

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
const fmtGBP = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;
/** dd/mm/yyyy — the panel shows the actual date, never "recently". */
function ukDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * WHAT IS WAITING ON THE BOARD (P10). The badge is a number on an icon; this is
 * the same number in words, with the one click that takes you to it. It is shown
 * ONLY from a count measured today — a stale number is worse than none — and
 * never when nothing is waiting.
 */
export function attentionBar(count: number, onOpen?: () => void): HTMLElement | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const bar = e('div', 'gb-attention');
  bar.setAttribute('role', 'status');
  bar.append(e('span', 'gb-attention-n', ATTENTION_COPY.banner(count)));
  const open = e('button', 'gb-attention-open', ATTENTION_COPY.open) as HTMLButtonElement;
  open.type = 'button';
  if (onOpen) open.addEventListener('click', onOpen);
  bar.append(open);
  return bar;
}

export function renderEmpty(attention?: { count: number; onOpen?: () => void }): void {
  const app = root();
  const bar = attentionBar(attention?.count ?? 0, attention?.onOpen);
  const card = e('section', 'glass card empty');
  card.append(e('p', 'eyebrow', coreConfig.siteName));
  card.append(e('p', 'empty-msg', 'Open a Rightmove or Zoopla listing and I’ll read it.'));
  if (bar) app.append(bar);
  app.append(card);
}

/**
 * Every honest failure state (E10): ONE heading, ONE plain sentence, and ONE
 * next action where a next action helps.
 */
export interface FailureState { heading: string; body: string; action?: string }

export function renderFailure(state: FailureState | string, attention?: { count: number; onOpen?: () => void }): void {
  const s: FailureState = typeof state === 'string' ? { heading: 'We couldn’t read this page', body: state } : state;
  const app = root();
  const bar = attentionBar(attention?.count ?? 0, attention?.onOpen);
  const card = e('section', 'glass card fail-card');
  card.setAttribute('role', 'alert');
  card.append(e('p', 'eyebrow', coreConfig.siteName));
  card.append(e('h1', 'fail-head', s.heading));
  card.append(e('p', 'fail-body', s.body));
  if (s.action) card.append(e('p', 'fail-action', s.action));
  if (bar) app.append(bar);
  app.append(card);
}

/**
 * Honest, structured copy for each extract failure, keyed on the reason the core
 * reader returned — a "this isn't a listing" reads DIFFERENTLY from "the portal
 * changed" from "something unexpected" (E10).
 */
export function failureFor(reason: string, message?: string): FailureState {
  switch (reason) {
    case 'not-a-listing':
      return {
        heading: 'This isn’t a listing page',
        body: message ?? 'This page isn’t a Rightmove or Zoopla property listing.',
        action: 'Open a specific property listing, then reopen this panel.',
      };
    case 'shape-changed':
    case 'no-blob':
      return {
        heading: 'The page format changed',
        body: message ?? 'We couldn’t read this page — the portal may have changed its layout.',
        action: 'Refresh the page. If it keeps happening, the reader needs an update — we’ll fix it.',
      };
    case 'no-content-script':
      return {
        heading: 'Just a moment — refresh needed',
        body: 'This panel reads the page you have open, and the reader hasn’t loaded on it yet.',
        action: 'Refresh the listing page, then reopen this panel.',
      };
    case 'unreadable':
    default:
      return {
        heading: 'Something got in the way',
        body: message ?? 'We couldn’t read this page — something unexpected got in the way.',
        action: 'Refresh the page and reopen the panel.',
      };
  }
}

/**
 * X1 item 7 — THE OFFICIAL MARKS, from the ONE shared source in core.
 *
 * These used to be a monochrome path drawn from memory in this file, while the
 * web app carried Instagram's real gradient and YouTube's real red. Two
 * drawings of the same two marks is one drawing too many, and the panel's was
 * the wrong one: neither company permits recolouring their mark.
 *
 * `socialMark` hands back the geometry; this turns it into SVG. The gradient ids
 * are namespaced per surface because two identical ids in one document make the
 * second mark reference the first one's gradient.
 */
function socialIcon(kind: 'instagram' | 'youtube'): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const mark = socialMark(kind, 'panel');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', mark.viewBox);
  svg.setAttribute('class', `gb-social-icon gb-mark-${kind === 'instagram' ? 'ig' : 'yt'}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (mark.gradients.length > 0) {
    const defs = document.createElementNS(NS, 'defs');
    for (const g of mark.gradients) {
      const rg = document.createElementNS(NS, 'radialGradient');
      rg.setAttribute('id', g.id);
      rg.setAttribute('cx', g.cx);
      rg.setAttribute('cy', g.cy);
      rg.setAttribute('r', g.r);
      for (const s of g.stops) {
        const stop = document.createElementNS(NS, 'stop');
        stop.setAttribute('offset', s.offset);
        stop.setAttribute('stop-color', s.color);
        if (s.opacity !== undefined) stop.setAttribute('stop-opacity', s.opacity);
        rg.appendChild(stop);
      }
      defs.appendChild(rg);
    }
    svg.appendChild(defs);
  }
  for (const shape of mark.shapes) {
    const node = document.createElementNS(NS, shape.tag);
    for (const [k, v] of Object.entries(shape.attrs)) node.setAttribute(k, v);
    svg.appendChild(node);
  }
  return svg;
}

/**
 * Persistent brand header — the logo, the quiet maker credit and the socials.
 * Rendered ONCE into #gb-header (outside #app), so it stays put across every
 * screen and every redraw. Name-agnostic: the logo is a file the operator swaps;
 * the social URLs read from coreConfig (one source).
 */
export function renderHeader(container: HTMLElement): void {
  container.textContent = '';
  // PropLaunch is the product mark; "by Gil & Bricks" is the quiet maker credit.
  // They sit on ONE baseline: the credit used to hang off the bottom of a
  // 31px-tall wordmark with no shared alignment, so at any width the two read as
  // two unrelated things rather than one signature.
  const brand = e('div', 'gb-brand');
  const logo = e('img', 'gb-logo') as HTMLImageElement;
  logo.src = '/brand/proplaunch-wordmark.png';
  logo.alt = coreConfig.siteName; // name-agnostic — one source (golden rule 4)
  // THE CROPPED ARTWORK, 603x225 -> 603x75, the same file the web app uses.
  // The panel carried the UNCROPPED 900x225 original, whose alpha box starts at
  // x=46, y=72: about 6px of transparent padding down the left and 9px across
  // the top at render size. That padding was the misalignment — the credit
  // below started at x=0 while the visible "P" started 6px in, so the two read
  // as unrelated objects at every width. No CSS nudge fixes that; the file has
  // to be the mark. 201x25 preserves 603/75 exactly (8.04), which is what keeps
  // the rendered width stable.
  logo.width = 201;
  logo.height = 25;
  logo.decoding = 'async';
  brand.append(logo);
  brand.append(e('span', 'gb-maker', `by ${coreConfig.makerName}`));
  container.append(brand);
  const socials = e('div', 'gb-socials');
  const link = (href: string, label: string, kind: 'instagram' | 'youtube'): HTMLAnchorElement => {
    const a = e('a', 'gb-social') as HTMLAnchorElement;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', label);
    a.title = label;
    a.append(socialIcon(kind));
    return a;
  };
  // The social accounts belong to the MAKER (@gil_and_bricks), so label them with
  // the maker name — never imply the product owns its own accounts (E11.1 review).
  socials.append(
    link(coreConfig.socials.instagram, `${coreConfig.makerName} on Instagram (opens a new tab)`, 'instagram'),
    link(coreConfig.socials.youtube, `${coreConfig.makerName} on YouTube (opens a new tab)`, 'youtube'),
  );
  container.append(socials);
}

/**
 * First-run hint (E10) — one quiet, dismissible line, shown the first time only.
 * `storageOk=false` means we can't remember the dismissal, so we also say
 * settings won't persist — honestly, and without blocking anything.
 */
export function renderFirstRun(container: HTMLElement, storageOk: boolean, onDismiss: () => void): void {
  container.textContent = '';
  const box = e('div', 'gb-firstrun');
  box.setAttribute('role', 'note');
  const msg = storageOk
    ? 'Open a Rightmove or Zoopla listing and I’ll read what it says. The full numbers happen in the analyser.'
    : 'Open a Rightmove or Zoopla listing and I’ll read what it says. Note: your browser isn’t letting this panel save settings, so they won’t be remembered after you close it.';
  box.append(e('p', 'gb-firstrun-msg', msg));
  const x = e('button', 'gb-firstrun-x', '✕') as HTMLButtonElement;
  x.type = 'button';
  x.setAttribute('aria-label', 'Dismiss this tip');
  x.addEventListener('click', () => { container.textContent = ''; onDismiss(); });
  box.append(x);
  container.append(box);
}

export interface PanelView {
  screen: 'triage' | 'settings';
  listing: NormalisedListing;
  strategy: StrategyId;
  /** ZONE ONE, computed in core. */
  numbers: TriageNumbers;
  /** The price comparison, or its honest refusal. */
  band: BandOutcome;
  /** ZONE TWO — never more than four, and empty is a real state. */
  flags: TriageFlag[];
  settings: Record<string, string>;
  criteria: Criteria;
  floorAreaSqm: number | null;
  floorAreaSource: 'listing' | 'epc-register' | 'epc-sector' | 'manual' | 'none';
  floorAreaRange: { minSqm: number; maxSqm: number } | null;
  /** The user's raw manual floor-area entry (kept in the mounted input). */
  manualAreaInput: string;
  /** What the listing itself shows about the seller's position (X1 item 6). */
  flex?: FlexibilitySignals;
  /** Is the in-page "Analyse this deal" button switched off? (D1) */
  openerHidden?: boolean;
  /** P10 — the daily reminders switch, and today's attention count. */
  reminders?: boolean;
  attention?: number;
  ewReject?: string | null;
  ewRejectReason?: 'outside-england-wales' | 'not-a-postcode' | null;
}

export interface PanelHandlers {
  onStrategy?: (s: StrategyId) => void;
  onArea?: (v: string) => void;
  onSetting?: (key: string, v: string) => void;
  onCriterion?: (key: keyof Criteria, v: string) => void;
  onOpenerVisible?: (show: boolean) => void;
  onReminders?: (on: boolean) => void;
  onOpenBoard?: () => void;
  onOpenSettings?: () => void;
  onCloseSettings?: () => void;
  onSend?: () => void;
}

// ───────────────────────── ZONE ONE — THE NUMBERS ─────────────────────────

/** One label-and-figure row. A figure the panel does not have is simply absent. */
function figureRow(label: string, value: string, basis?: string): HTMLElement {
  const row = e('div', 'num-row');
  row.append(e('span', 'num-label', label));
  row.append(e('span', 'num-value', value));
  if (basis) {
    const b = e('p', 'num-basis', basis);
    row.append(b);
  }
  return row;
}

/**
 * The price comparison, word for word.
 *
 * It says a POSITION — within, above or below — and never an adjective. "Below
 * the range" is a fact about arithmetic; "a bargain" is a claim about a property
 * nobody has seen, on a street this tool cannot resolve. The caveat below it is
 * permanent and is not a disclaimer bolted on: cheap for the size really does
 * very often mean cheap for a reason.
 */
function bandBlock(view: PanelView): HTMLElement {
  const box = e('section', 'band');
  box.append(e('h2', 'zone-head', C.band.heading));

  if (view.band.kind === 'none' && view.band.reason === 'no-area') {
    // The floor-area input is directly above this whenever there is no area, so
    // saying "no floor area in this listing" here as well is the panel telling
    // the reader the same thing twice on one screen.
    box.append(e('p', 'band-none', C.band.needsArea));
    return box;
  }
  if (view.band.kind === 'none') {
    // Below five comparables it shows NOTHING rather than a range drawn from an
    // accident of which four houses happened to sell.
    box.append(e('p', 'band-none', C.band.tooFew(view.band.countFound)));
    return box;
  }
  if (view.band.kind === 'spread') {
    // An area holding two markets: say so rather than average them.
    box.append(e('p', 'band-none', C.band.spread));
    box.append(e('p', 'band-range', C.band.range(fmtGBP(view.band.low), fmtGBP(view.band.high))));
    box.append(e('p', 'band-basis', C.band.basis(view.band.count)));
    if (view.band.widened) box.append(e('p', 'band-widened', C.band.widened));
    box.append(e('p', 'band-caveat', C.band.caveat));
    return box;
  }

  const position = e('p', `band-position band-${view.band.position}`, C.band[view.band.position]);
  box.append(position);
  box.append(e('p', 'band-range', C.band.range(fmtGBP(view.band.low), fmtGBP(view.band.high))));
  box.append(e('p', 'band-basis', C.band.basis(view.band.count)));
  if (view.band.widened) box.append(e('p', 'band-widened', C.band.widened));
  box.append(e('p', 'band-caveat', C.band.caveat));
  return box;
}

function numbersZone(view: PanelView, h: PanelHandlers): HTMLElement {
  const box = e('section', 'numbers');
  box.append(e('h2', 'zone-head', C.numbers.heading));
  const n = view.numbers;

  if (n.askingPrice === null) {
    box.append(e('p', 'band-none', C.numbers.noPrice));
  } else {
    box.append(figureRow(C.numbers.asking, fmtGBP(n.askingPrice)));
    if (n.ppsqm !== null) {
      // Where the listing gave a SPAN rather than a size, the £/m² rests on its
      // midpoint and has to say so — otherwise a derived figure reads as a read one.
      const basis = view.floorAreaRange
        ? C.numbers.areaFromRange(view.floorAreaRange.minSqm, view.floorAreaRange.maxSqm)
        : undefined;
      box.append(figureRow(C.numbers.perSqm, fmtGBP(n.ppsqm), basis));
    }
    if (n.purchaseTax !== null) {
      box.append(figureRow(n.isWales ? C.numbers.stampDutyWales : C.numbers.stampDuty, fmtGBP(n.purchaseTax), C.numbers.stampDutyBasis));
    }
    if (n.cashNeeded !== null) {
      box.append(figureRow(C.numbers.cashNeeded, fmtGBP(n.cashNeeded), C.numbers.cashNeededBasis(n.depositPct)));
    }
  }

  // The ONE input that survives, and only when the listing and the EPC register
  // both came up empty. It is not a lever: it is the number that unlocks £/m²
  // and the price comparison, and it is the one thing a person can read off a
  // plan in five seconds. It also keeps `area` travelling in the handoff.
  if (view.floorAreaSqm === null || view.floorAreaSource === 'manual') {
    const row = e('div', 'area-row');
    const lab = e('label', 'num-label', C.numbers.areaLabel);
    lab.setAttribute('for', 'gb-area');
    const inp = e('input', 'area-field') as HTMLInputElement;
    inp.id = 'gb-area';
    inp.type = 'number';
    inp.inputMode = 'numeric';
    inp.value = view.manualAreaInput;
    if (h.onArea) inp.addEventListener('input', () => h.onArea!(inp.value));
    row.append(lab, inp);
    box.append(row);
  }
  return box;
}

// ───────────────────────── ZONE TWO — THE FLAGS ───────────────────────────

const FLAG_COPY: Record<FlagId, string> = {
  leasehold: C.flags.leasehold,
  auction: C.flags.auction,
  tenantInSitu: C.flags.tenantInSitu,
  cashBuyers: C.flags.cashBuyers,
  nonStandardConstruction: C.flags.nonStandardConstruction,
  commercialBelow: C.flags.commercialBelow,
};

/**
 * ZONE TWO. Silent unless it has something evidenced to say — and when it is
 * silent, it SAYS SO, because a quiet panel is the most dangerous state this
 * thing has. Quiet reads as permission.
 *
 * Every line here is about what the LISTING SAYS, never about what is true, and
 * never about what is absent: no negative flag exists in this product and there
 * cannot be one. The absence of the word "leasehold" does not make a property
 * freehold; it makes the listing silent.
 */
function flagsZone(view: PanelView): HTMLElement {
  const box = e('section', 'flags');
  box.append(e('h2', 'zone-head', C.flags.heading));
  if (view.flags.length === 0) {
    box.append(e('p', 'flags-none', C.flags.nothing));
    box.append(e('p', 'flags-none-why', C.flags.nothingWhy));
    return box;
  }
  const ul = e('ul', 'flag-list');
  for (const f of view.flags) {
    const li = e('li', 'flag');
    li.append(e('span', 'flag-text', FLAG_COPY[f.id]));
    li.append(e('span', 'flag-found', C.flags.found(f.matched)));
    ul.append(li);
  }
  box.append(ul);
  // ONCE, under the list, rather than repeated under every flag. It applies to
  // all of them equally, and four copies of the same sentence is four lines of
  // a panel that has to fit on one screen.
  box.append(e('p', 'flag-verify', C.flags.verify));
  return box;
}

/**
 * X1 item 6 — POSSIBLE FLEXIBILITY, honestly.
 *
 * What the listing itself shows about how long it has been on the market and
 * whether the price has moved. Signals, never proof: only the agent knows why
 * somebody is selling, and a listing that has sat for six months may have sat
 * because of something this tool cannot see.
 *
 * Silent when the listing shows neither, rather than printing a heading over an
 * absence — "nothing found" here would invite the reader to conclude the seller
 * is firm, which is a claim about a person nobody has spoken to.
 */
function flexibilityBlock(view: PanelView): HTMLElement | null {
  const s = view.flex;
  if (!s) return null;
  const lines: string[] = [];
  // Only a real figure, never a sentence about not having one: "the date isn't
  // shown on this listing" under a heading called Possible flexibility reads as
  // a finding, and it is the absence of one.
  if (s.daysListed !== null) lines.push(C.flexibility.listedFor(s.daysListed));
  if (s.reducedOn !== null) lines.push(C.flexibility.reducedOn(ukDate(s.reducedOn)));
  for (const p of s.phrases) if (!lines.includes(p)) lines.push(p);
  if (lines.length === 0) return null;
  const box = e('section', 'flexibility');
  box.append(e('h2', 'zone-head', C.flexibility.heading));
  const ul = e('ul', 'flex-list');
  for (const line of lines.slice(0, 3)) ul.append(e('li', 'flex-line', line));
  box.append(ul);
  box.append(e('p', 'flex-caveat', C.flexibility.caveat));
  return box;
}

// ───────────────────────── THE HANDOFF ────────────────────────────────────

/**
 * X1 item 9 — THE HANDOFF, at the bottom, after everything.
 *
 * It carries the price, the size, the type, the address, the photographs and the
 * floor plan into the analyser. NOTHING IS WITHHELD FROM THE PANEL TO FORCE THIS
 * CLICK: everything above is there because it is honest to show, and this button
 * exists because the analyser can ask questions the panel cannot.
 *
 * The strategy buttons sit HERE, with the button, because choosing a strategy is
 * choosing which analyser opens — it is part of the handoff, not a lever on the
 * numbers above.
 */
function handoffBlock(view: PanelView, h: PanelHandlers): HTMLElement {
  const box = e('section', 'handoff');
  const sw = e('div', 'strategy-switch');
  sw.setAttribute('role', 'group');
  sw.setAttribute('aria-label', 'Which analyser to open');
  for (const s of STRATEGIES) {
    const b = e('button', `strat-btn${s.id === view.strategy ? ' active' : ''}`, s.label) as HTMLButtonElement;
    b.type = 'button';
    b.setAttribute('aria-pressed', String(s.id === view.strategy));
    if (h.onStrategy) b.addEventListener('click', () => h.onStrategy!(s.id));
    sw.append(b);
  }
  box.append(sw);
  const send = e('button', 'send-btn send-btn-action', `${C.handoff.action} →`) as HTMLButtonElement;
  send.type = 'button';
  if (h.onSend) send.addEventListener('click', () => h.onSend!());
  box.append(send);
  box.append(e('p', 'handoff-why', C.handoff.why));
  return box;
}

export function renderTriage(view: PanelView, h: PanelHandlers = {}): void {
  const app = root();
  const bar = attentionBar(view.attention ?? 0, h.onOpenBoard);
  if (bar) app.append(bar);
  const L = view.listing;
  const card = e('section', 'glass card');

  // The property line — "Flat 2, 8 Earl Street, SA1 2HG" (saon + number kept).
  const addr = L.address.value;
  const streetLine = [addr?.paon, addr?.street].filter(Boolean).join(' ');
  const h1 = [addr?.saon, streetLine, L.postcode.value].filter(Boolean).join(', ') || L.postcode.value || 'This property';
  card.append(e('h1', 'prop-addr', h1));
  const facts = [
    // Zoopla hands its type over as "semi_detached". That underscore is a data
    // artefact, not the portal's wording, and it reads as a leak. Formatting a
    // value for display is the panel's job; the value itself is untouched and
    // the handoff still carries the original (charter rule 3).
    L.propertyType.value?.replace(/[_-]+/g, ' '),
    L.bedrooms.value ? `${L.bedrooms.value} bed` : null,
    L.tenure.value?.toLowerCase(),
  ].filter(Boolean);
  if (facts.length) card.append(e('p', 'prop-facts', facts.join(' · ')));

  if (view.ewReject) {
    const box = e('div', 'ew-reject');
    box.setAttribute('role', 'note');
    if (view.ewRejectReason === 'not-a-postcode') {
      box.append(e('h2', 'fail-head', 'We couldn’t read the postcode'));
      box.append(e('p', 'fail-body', 'This listing didn’t give a full postcode we could read, so we can’t pull the sold-price data for it.'));
      box.append(e('p', 'fail-action', 'Open the full listing page (not a search result), then reopen this panel.'));
    } else {
      box.append(e('h2', 'fail-head', 'England & Wales only'));
      box.append(e('p', 'fail-body', 'This tool covers England & Wales only — the sold-price data it reads doesn’t include Scotland or Northern Ireland.'));
      box.append(e('p', 'fail-action', 'Try a listing in England or Wales.'));
    }
    card.append(box);
    app.append(card);
    return;
  }

  // ZONE ONE, then the comparison it feeds.
  card.append(numbersZone(view, h));
  // The comparison carries the caveat for both the size match AND the coarseness
  // of the area data — see `band.caveat`, which is one paragraph on purpose.
  card.append(bandBlock(view));

  // ZONE TWO.
  card.append(flagsZone(view));

  const flex = flexibilityBlock(view);
  if (flex) card.append(flex);

  card.append(handoffBlock(view, h));

  const settingsLink = e('button', 'settings-link', C.settings.link) as HTMLButtonElement;
  settingsLink.type = 'button';
  if (h.onOpenSettings) settingsLink.addEventListener('click', () => h.onOpenSettings!());
  card.append(settingsLink);
  app.append(card);
}

/** Formatting and caret maths come from @gil-bricks/core (F1) so the panel and
 * the web app can never drift; the £ prefix here is the panel's own chrome. */
const fmtThousands = (digits: string): string => fmtMoneyInput(digits).replace('£', '');

/**
 * A MONEY input that shows "£137,152" with thousands separators as the user
 * types, while handing back a clean digit string for storage. Caret is preserved
 * by counting digits, not characters.
 */
function moneyField(id: string, raw: string, placeholder: string, onRaw?: (digits: string) => void): HTMLElement {
  const wrap = e('div', 'money-wrap');
  wrap.append(e('span', 'money-prefix', '£'));
  const inp = e('input', 'assume-field money-input') as HTMLInputElement;
  inp.id = id;
  inp.type = 'text';
  inp.inputMode = 'numeric';
  inp.autocomplete = 'off';
  inp.placeholder = placeholder;
  inp.value = fmtThousands((raw || '').replace(/[^\d]/g, ''));
  if (onRaw) {
    inp.addEventListener('input', () => {
      const caret = inp.selectionStart ?? inp.value.length;
      const typed = inp.value;
      const digits = parseMoneyInput(typed);
      inp.value = fmtThousands(digits);
      const pos = moneyCaret(typed, caret, inp.value);
      try { inp.setSelectionRange(pos, pos); } catch { /* non-text inputs */ }
      onRaw(digits);
    });
  }
  wrap.append(inp);
  return wrap;
}

/**
 * SETTINGS — the two switches, and the minimums the person sets for themselves.
 *
 * The criteria stay because they TRAVEL: the analyser judges the deal by the
 * same bar the person set, and without them one click would quietly change the
 * standard. They are not panel inputs — nothing on the triage screen reads them.
 */
export function renderSettings(view: PanelView, h: PanelHandlers = {}): void {
  const app = root();
  const card = e('section', 'glass card');
  const back = e('button', 'settings-link', C.settings.back) as HTMLButtonElement;
  back.type = 'button';
  if (h.onCloseSettings) back.addEventListener('click', () => h.onCloseSettings!());
  card.append(back);

  if (!storageAvailableFlag) {
    const note = e('p', 'fail-action', 'Your browser isn’t letting this panel save settings, so any changes here apply now but won’t be remembered after you close it.');
    note.setAttribute('role', 'note');
    card.append(note);
  }

  // The in-page button's on/off switch. It lives here because "Hide" on the
  // button is remembered, and this is the only way back (D1 review).
  if (h.onOpenerVisible) {
    const row = e('div', 'assume-row');
    const lab = e('label', 'assume-label', 'Show the button on listings');
    lab.setAttribute('for', 'gb-opener-visible');
    const box = e('input', 'assume-field') as HTMLInputElement;
    box.id = 'gb-opener-visible';
    box.type = 'checkbox';
    box.checked = view.openerHidden !== true;
    box.addEventListener('change', () => h.onOpenerVisible!(box.checked));
    row.append(lab, box);
    card.append(row);
  }

  // P10 — the daily badge's own switch. OFF means silent: no fetch, no badge,
  // no notification.
  if (h.onReminders) {
    const row = e('div', 'assume-row');
    const lab = e('label', 'assume-label', ATTENTION_COPY.settings);
    lab.setAttribute('for', 'gb-reminders');
    const box = e('input', 'assume-field') as HTMLInputElement;
    box.id = 'gb-reminders';
    box.type = 'checkbox';
    box.checked = view.reminders !== false;
    box.addEventListener('change', () => h.onReminders!(box.checked));
    row.append(lab, box);
    card.append(row);
    const reach = e('p', 'settings-note', ATTENTION_COPY.reach);
    reach.id = 'gb-reminders-note';
    box.setAttribute('aria-describedby', reach.id);
    card.append(reach);
  }

  card.append(e('h2', 'settings-title', 'What are you looking for?'));
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
  app.append(card);
}

// ---------------- interactive controller ----------------

interface Ctx {
  url: string;
  listing: NormalisedListing | null;
  failure: FailureState | null;
  screen: 'triage' | 'settings';
  strategy: StrategyId;
  settings: Record<string, string>;
  criteria: Criteria;
  sector: SectorFile | null;
  sectorId: string | null;
  /** Sales from neighbouring sectors, fetched ONLY when the subject's own
   *  sector cannot reach five comparables (X1). */
  widerSales: BandSale[] | null;
  ewReject: string | null;
  ewRejectReason: 'outside-england-wales' | 'not-a-postcode' | null;
  manualArea: string;
  registerArea: { sqm: number } | null;
  openerHidden: boolean;
  reminders: boolean;
  attention: number;
  sectorLoad: SectorLoad;
}

async function attentionBoard(): Promise<{ count: number; onOpen: () => void }> {
  return {
    count: await todaysAttention(),
    onOpen: () => { void chrome.tabs.create({ url: `${WEB_BASE}${ATTENTION.board}` }); },
  };
}

async function todaysAttention(): Promise<number> {
  const snap = await store.getAttention();
  const age = Date.now() - (snap.at ?? 0);
  return snap.at > 0 && age <= ATTENTION.freshHours * 3_600_000 ? snap.count : 0;
}

/** The ctx for the currently-loaded listing — a stale fetch only acts on this one. */
let activeCtx: Ctx | null = null;

function resolveFloorArea(ctx: Ctx): { sqm: number | null; source: PanelView['floorAreaSource']; range: PanelView['floorAreaRange'] } {
  const l = ctx.listing!;
  const range = l.floorAreaSqmRange.status === 'found' ? l.floorAreaSqmRange.value : null;
  if (l.floorAreaSqm.status === 'found' && l.floorAreaSqm.value) return { sqm: l.floorAreaSqm.value, source: 'listing', range };
  // The REGISTER first: it is the real certificate, and it answers for houses
  // that have not sold in twenty years — which our sold-data join never could.
  if (ctx.registerArea) return { sqm: ctx.registerArea.sqm, source: 'epc-register', range: null };
  const epc = floorAreaFromSector(ctx.sector, l.address.value, l.postcode.value);
  if (epc) return { sqm: epc, source: 'epc-sector', range: null };
  if (ctx.manualArea && Number(ctx.manualArea) > 0) return { sqm: Math.round(Number(ctx.manualArea)), source: 'manual', range: null };
  return { sqm: null, source: 'none', range: null };
}

/** The sector's sales in the shape `priceBand` reads. */
function salesOf(sector: SectorFile | null): BandSale[] {
  if (!sector || !Array.isArray(sector.sales)) return [];
  return sector.sales.map((s) => ({
    date: String(s.date ?? ''), price: Number(s.price ?? 0), type: String(s.type ?? ''),
    floorAreaSqm: typeof s.floorAreaSqm === 'number' ? s.floorAreaSqm : null,
    ppsqm: typeof s.ppsqm === 'number' ? s.ppsqm : null,
  }));
}

/** The subject's own type letter, as the sector files use it (D/S/T/F/O). */
function typeLetter(listing: NormalisedListing): string {
  const t = (listing.propertyType.value ?? '').toLowerCase();
  if (/semi/.test(t)) return 'S';
  if (/detached/.test(t)) return 'D';
  if (/terrac|town\s?house|end[- ]?of[- ]?terrace/.test(t)) return 'T';
  if (/flat|apartment|maisonette/.test(t)) return 'F';
  return 'O';
}

/** Strategy config supplies the deposit and legals; nothing is typed in here. */
function assumptionsFor(strategy: StrategyId): { depositPct: number; legals: number } {
  const cfg = strategyById(strategy);
  const all = [...(cfg?.strategyInputs ?? []), ...(cfg?.assumptions ?? [])];
  const num = (key: string, fallback: number): number => {
    const f = all.find((x) => x.key === key);
    const v = Number(f?.default ?? NaN);
    return Number.isFinite(v) ? v : fallback;
  };
  return { depositPct: num('deposit', 25), legals: num('legals', 1500) };
}

function draw(ctx: Ctx): void {
  const board = { count: ctx.attention, onOpen: () => { void chrome.tabs.create({ url: `${WEB_BASE}${ATTENTION.board}` }); } };
  if (ctx.failure) return renderFailure(ctx.failure, board);
  if (!ctx.listing) return renderEmpty(board);

  const fa = resolveFloorArea(ctx);
  const country = ctx.sector?.country === 'W92000004' ? 'W92000004' : 'E92000001';
  const { depositPct, legals } = assumptionsFor(ctx.strategy);
  const numbers = triageNumbers({
    askingPrice: ctx.listing.askingPrice.value ?? null,
    floorAreaSqm: fa.sqm,
    country, depositPct, legals,
  });

  const band = priceBand({
    type: typeLetter(ctx.listing),
    floorAreaSqm: fa.sqm ?? 0,
    askingPrice: ctx.listing.askingPrice.value ?? 0,
    sales: salesOf(ctx.sector),
    widerSales: ctx.widerSales ?? undefined,
    now: new Date(),
  });

  const flags = detectFlags({
    text: `${ctx.listing.description.value ?? ''}`,
    tenure: ctx.listing.tenure.value ?? null,
    isAuction: ctx.listing.isAuction.value ?? null,
  });

  // Read from what the page already gave us — never fetched, never scored.
  const flex = ctx.screen === 'triage' && !ctx.ewReject
    ? flexibilitySignals(ctx.listing, FALLBACK_CONFIG.signals, new Date())
    : undefined;

  const view: PanelView = {
    screen: ctx.screen, listing: ctx.listing, strategy: ctx.strategy,
    numbers, band, flags,
    settings: ctx.settings, criteria: ctx.criteria,
    floorAreaSqm: fa.sqm, floorAreaSource: fa.source, floorAreaRange: fa.range,
    manualAreaInput: ctx.manualArea,
    flex,
    ewReject: ctx.ewReject, ewRejectReason: ctx.ewRejectReason,
    openerHidden: ctx.openerHidden, reminders: ctx.reminders, attention: ctx.attention,
  };

  const handlers: PanelHandlers = {
    onStrategy: (s) => { ctx.strategy = s; void store.setStrategy(s); redraw(ctx); },
    onArea: (v) => { ctx.manualArea = v; if (ctx.listing?.listingId.value) void store.setManualArea(ctx.listing.listingId.value, v); redraw(ctx); },
    onSetting: (k, v) => { ctx.settings = { ...ctx.settings, [k]: v }; void store.setSettings(ctx.settings); redraw(ctx); },
    onCriterion: (k, v) => { const c = { ...ctx.criteria }; if (v.trim() === '') delete c[k]; else c[k] = Number(v); ctx.criteria = c; void store.setCriteria(c); redraw(ctx); },
    onOpenerVisible: (show) => { ctx.openerHidden = !show; void store.setOpenerHidden(!show); redraw(ctx); },
    onReminders: (on) => { ctx.reminders = on; void store.setReminders(on); if (!on) ctx.attention = 0; redraw(ctx); },
    onOpenBoard: () => { void chrome.tabs.create({ url: `${WEB_BASE}${ATTENTION.board}` }); },
    onOpenSettings: () => { ctx.screen = 'settings'; draw(ctx); },
    onCloseSettings: () => { ctx.screen = 'triage'; draw(ctx); },
    /**
     * THE HANDOFF. Unchanged by X1 on purpose, and asserted parameter by
     * parameter in `handoffCarries.test.ts`: the photographs, the floor plan,
     * the house number, the auction flag and the person's own minimums all
     * travel exactly as they did before the panel was rewritten. The measure
     * TOOL was removed; none of the data beside it was.
     */
    onSend: () => {
      const url = buildAnalyserUrl(WEB_BASE, ctx.listing!, {
        strategy: ctx.strategy, floorAreaSqm: fa.sqm,
        fields: { ...ctx.settings },
        criteria: ctx.criteria,
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
  const scroller = (document.scrollingElement || document.documentElement) as HTMLElement | null;
  const scrollTop = scroller?.scrollTop ?? 0;
  const oldTop = focusId ? (active?.offsetTop ?? null) : null;
  draw(ctx);
  let el: HTMLInputElement | null = null;
  if (focusId) {
    el = document.getElementById(focusId) as HTMLInputElement | null;
    if (el) { el.focus({ preventScroll: true }); if (caret != null) { try { el.setSelectionRange(caret, caret); } catch { /* number inputs */ } } }
  }
  if (scroller) scroller.scrollTop = el && oldTop != null ? scrollTop + (el.offsetTop - oldTop) : scrollTop;
}

let lastUrl = '';
let storageAvailableFlag = true;

/**
 * WIDEN THE COMPARISON, ONCE, AND ONLY WHEN IT IS NEEDED.
 *
 * Each neighbouring sector is a network fetch, so this runs only after the
 * subject's own sector has already failed to reach five comparables, and only
 * after the first paint. The panel is never blocked on it: it answers with what
 * it has, and the widened range replaces the "not enough" line if one arrives.
 */
async function widenIfNeeded(ctx: Ctx, faSqm: number | null): Promise<void> {
  if (!ctx.sectorId || !ctx.listing || ctx.widerSales !== null) return;
  if (!faSqm || faSqm <= 0) return;
  const first = priceBand({
    type: typeLetter(ctx.listing), floorAreaSqm: faSqm,
    askingPrice: ctx.listing.askingPrice.value ?? 0,
    sales: salesOf(ctx.sector), now: new Date(),
  });
  if (first.kind !== 'none' || first.reason !== 'too-few') return;
  try {
    const index = await getSectorsIndex();
    if (activeCtx !== ctx) return;
    const ids = nearestSectors(index, ctx.sectorId);
    const files = await Promise.all(ids.map((id) => getSector(id).catch(() => null)));
    if (activeCtx !== ctx) return;
    const wider: BandSale[] = [];
    for (const f of files) if (f) wider.push(...salesOf(f));
    ctx.widerSales = wider;
    draw(ctx);
  } catch {
    // A widening that fails leaves the honest "not enough similar sales" line
    // already on screen. That is a useful answer, not a failure to report.
    ctx.widerSales = [];
  }
}

async function loadFor(tabId: number, url: string): Promise<void> {
  const ctx: Ctx = {
    url, listing: null, failure: null, screen: 'triage',
    strategy: (await store.getStrategy()) as StrategyId,
    settings: await store.getSettings(), criteria: await store.getCriteria(),
    sector: null, sectorId: null, widerSales: null, ewReject: null, ewRejectReason: null,
    manualArea: '', registerArea: null,
    openerHidden: await store.getOpenerHidden(),
    reminders: await store.getReminders(),
    attention: await todaysAttention(),
    sectorLoad: 'ok',
  };
  activeCtx = ctx;
  void chrome.tabs.sendMessage(tabId, { type: PANEL_OPEN_MESSAGE }).catch(() => undefined);
  let result: ExtractResult | null = null;
  for (let attempt = 0; attempt < READER.attempts; attempt += 1) {
    try {
      result = (await chrome.tabs.sendMessage(tabId, { type: EXTRACT_MESSAGE })) as ExtractResult;
      break;
    } catch {
      if (attempt === 0) { ctx.failure = failureFor('no-content-script'); draw(ctx); }
      if (attempt === READER.attempts - 1) return;
      await new Promise((r) => setTimeout(r, READER.waitMs));
      if (activeCtx !== ctx) return;
    }
  }
  if (!result) return;
  ctx.failure = null;
  if (!result.ok) { ctx.failure = failureFor(result.reason, result.message); return draw(ctx); }
  ctx.listing = result.listing;

  if (ctx.listing.postcode.value) {
    const pc = postcodeToSector(ctx.listing.postcode.value);
    if (!pc.inEnglandWales) { ctx.ewReject = pc.message; ctx.ewRejectReason = pc.reason; }
    else ctx.sectorId = pc.sector;
  }
  if (ctx.listing.listingId.value) ctx.manualArea = await store.getManualArea(ctx.listing.listingId.value);
  if (ctx.sectorId && !ctx.ewReject) ctx.sectorLoad = 'loading';
  draw(ctx);

  if (ctx.sectorId && !ctx.ewReject) {
    try {
      ctx.sector = await getSector(ctx.sectorId);
      ctx.sectorLoad = 'ok';
    } catch (err) {
      ctx.sector = null;
      const kind = (err as { kind?: string })?.kind;
      ctx.sectorLoad = kind === 'NotFound' ? 'not-found' : 'load-failed';
    }
    if (activeCtx !== ctx) return;
    draw(ctx);
  }

  // The EPC register, through OUR Worker (E1). After the first paint on purpose:
  // a floor area is worth waiting for, the rest of the panel is not.
  if (!ctx.ewReject && ctx.listing?.postcode.value && ctx.listing.address.value?.paon) {
    const got = await lookupEpcArea(
      ctx.listing.postcode.value,
      ctx.listing.address.value.paon,
      ctx.listing.address.value.saon ?? '',
    );
    if (activeCtx !== ctx) return;
    if (got.ok && got.source === 'register') {
      ctx.registerArea = { sqm: got.sqm };
      draw(ctx);
    }
  }

  // Last, and only if the comparison came up short.
  if (activeCtx === ctx) await widenIfNeeded(ctx, resolveFloorArea(ctx).sqm);
}

async function tick(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? '';
    if (!tab?.id) return;
    const isPortal = url ? /(^|\.)(rightmove|zoopla)\.co\.uk$/.test(new URL(url).hostname) : false;
    // A portal SEARCH page is not a listing. Reading it fails, and the failure
    // screen then blamed the portal for changing its format — a plain untruth on
    // the page a person spends most of their time on (D3).
    if (!isPortal || !isListingUrl(url)) {
      if (lastUrl !== '') {
        lastUrl = '';
        activeCtx = null;
        renderEmpty(await attentionBoard());
      }
      return;
    }
    if (url !== lastUrl) { lastUrl = url; await loadFor(tab.id, url); }
  } catch {
    /* transient */
  }
}

function init(): void {
  document.title = `${coreConfig.siteName} Deal Analyser`;
  const header = document.getElementById('gb-header');
  if (header) renderHeader(header);
  const firstRun = document.getElementById('gb-firstrun');
  if (firstRun) {
    void (async () => {
      const [dismissed, storageOk] = await Promise.all([store.getFirstRunDismissed(), store.storageAvailable()]);
      storageAvailableFlag = storageOk;
      if (!dismissed) {
        renderFirstRun(firstRun, storageOk, () => { firstRun.textContent = ''; });
        void store.setFirstRunDismissed();
      }
    })();
  }
  void refreshRemoteConfig();
  void tick();
  setInterval(() => void tick(), 1500);
}

const runtime = globalThis as unknown as { chrome?: { tabs?: { query?: unknown } } };
if (runtime.chrome?.tabs?.query) init();

/**
 * Test-only seam: mount the REAL controller over a given listing so a test can
 * dispatch actual DOM events and read what is DISPLAYED — and, crucially, click
 * the real handoff button and read the URL it writes.
 */
export function __mountForTest(
  listing: NormalisedListing,
  opts: {
    sector?: SectorFile | null; strategy?: StrategyId; settings?: Record<string, string>;
    criteria?: Criteria; sectorLoad?: SectorLoad; manualArea?: string; widerSales?: BandSale[] | null;
  } = {},
): void {
  const ctx: Ctx = {
    url: 'test', listing, failure: null, screen: 'triage', strategy: opts.strategy ?? 'btl',
    settings: opts.settings ?? {}, criteria: opts.criteria ?? {},
    sector: opts.sector ?? null, sectorId: opts.sector ? 'X' : null,
    widerSales: opts.widerSales ?? null,
    ewReject: null, ewRejectReason: null,
    manualArea: opts.manualArea ?? '', registerArea: null,
    openerHidden: false, reminders: true, attention: 0,
    sectorLoad: opts.sectorLoad ?? 'ok',
  };
  // The same England-and-Wales gate `loadFor` applies. Without it this seam
  // would render a Scottish listing as though it were in scope, and the reject
  // screen could only ever be tested by hand-building a view.
  if (listing.postcode.value) {
    const pc = postcodeToSector(listing.postcode.value);
    if (!pc.inEnglandWales) { ctx.ewReject = pc.message; ctx.ewRejectReason = pc.reason; }
    else ctx.sectorId = pc.sector;
  }
  activeCtx = ctx;
  draw(ctx);
}
