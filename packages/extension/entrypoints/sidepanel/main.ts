/**
 * Side-panel UI (E5). On a portal tab it asks the content script to read the
 * open listing and renders the normalised object (every field marked
 * found/missing/n-a) plus the England-&-Wales gate. Off a portal — or if reading
 * fails — it falls back to the E4 shared Deal Score sample, so the panel is
 * never empty and never shows a wrong value.
 */
import {
  scoreDeal,
  postcodeToSector,
  type DealScore,
  type ExtractResult,
  type Field,
  type NormalisedListing,
} from '@gil-bricks/core';
import { SAMPLE_STRATEGY, SAMPLE_INPUTS, SAMPLE_LABEL } from '../../src/sample';
import { EXTRACT_MESSAGE, refreshRemoteConfig } from '../../src/extractPage';

const LIGHT: Record<DealScore['verdict'], string> = { good: 'ds-good', marginal: 'ds-marginal', 'walk away': 'ds-walk' };
const PILL: Record<string, string> = { found: 'st-green', missing: 'st-amber', 'unavailable-on-this-portal': 'st-unknown' };
const COMP_PILL: Record<string, string> = { green: 'st-green', amber: 'st-amber', red: 'st-red', unknown: 'st-unknown' };

function e(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function app(): HTMLElement {
  const a = document.getElementById('app')!;
  a.textContent = '';
  return a;
}

// ---------- E4 sample Deal Score (fallback state) ----------
function renderSample(note?: string): void {
  const deal = scoreDeal(SAMPLE_STRATEGY, SAMPLE_INPUTS);
  const root = app();
  const card = e('section', 'glass card');
  card.append(e('p', 'eyebrow', 'Deal Score'));
  const chip = e('div', `deal-score ${LIGHT[deal.verdict]}`);
  chip.setAttribute('role', 'img');
  chip.setAttribute('aria-label', `Deal score ${deal.score.toFixed(1)} out of 10 — ${deal.verdict}. ${deal.headline}`);
  const score = e('span', 'ds-score');
  score.append(e('strong', undefined, deal.score.toFixed(1)), e('span', 'ds-outof', '/10'));
  const dot = e('span', 'ds-light', '●');
  dot.setAttribute('aria-hidden', 'true');
  chip.append(score, dot, e('span', 'ds-verdict', deal.verdict), e('span', 'ds-headline', deal.headline));
  card.append(chip);

  if (deal.bindingConstraint) {
    const bn = e('p', 'binding-note');
    bn.append(e('span', 'binding-label', 'What’s holding it back: '));
    bn.append(document.createTextNode(deal.bindingConstraint.plainExplanation));
    card.append(bn);
  }
  const ul = e('ul', 'components');
  for (const c of deal.components) {
    const li = e('li', 'component');
    li.append(e('span', 'c-name', c.name));
    li.append(e('span', `c-status ${COMP_PILL[c.status] ?? 'st-unknown'}`, c.status));
    li.append(e('span', 'c-points', `${c.points.toFixed(2)} / ${c.max.toFixed(1)}`));
    ul.append(li);
  }
  card.append(ul);

  card.append(e('p', 'sample-note', note ?? `${SAMPLE_LABEL} — a built-in example. Open a Rightmove or Zoopla listing to read a real one.`));
  root.append(card);
}

// ---------- E5 read-listing view ----------
const fmt = {
  askingPrice: (v: number) => '£' + v.toLocaleString('en-GB'),
  floorAreaSqm: (v: number) => `${v} m²`,
  newBuild: (v: boolean) => (v ? 'Yes' : 'No'),
  isAuction: (v: boolean) => (v ? 'Yes' : 'No'),
  address: (v: { paon?: string; street?: string; town?: string }) => [v.paon, v.street, v.town].filter(Boolean).join(', '),
  listingUpdate: (v: { reason: string; date: string }) => `${v.reason} on ${v.date}`,
  floorPlanImageUrls: (v: string[]) => `${v.length} image${v.length === 1 ? '' : 's'}`,
  description: (v: string) => `${v.length} characters`,
};
function fieldText<T>(key: string, f: Field<T>): string {
  if (f.status !== 'found' || f.value == null) return f.status === 'unavailable-on-this-portal' ? 'not shown here' : 'missing';
  const fn = (fmt as Record<string, (x: any) => string>)[key];
  return fn ? fn(f.value) : String(f.value);
}

const ROWS: { key: keyof NormalisedListing; label: string }[] = [
  { key: 'askingPrice', label: 'Asking price' },
  { key: 'propertyType', label: 'Type' },
  { key: 'tenure', label: 'Tenure' },
  { key: 'bedrooms', label: 'Bedrooms' },
  { key: 'bathrooms', label: 'Bathrooms' },
  { key: 'floorAreaSqm', label: 'Floor area' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'address', label: 'Address' },
  { key: 'newBuild', label: 'New build' },
  { key: 'isAuction', label: 'Auction' },
  { key: 'floorPlanImageUrls', label: 'Floor plan' },
  { key: 'listingUpdate', label: 'Listing update' },
  { key: 'firstVisibleDate', label: 'First listed' },
  { key: 'description', label: 'Description' },
];

export function renderListing(result: ExtractResult): void {
  const root = app();
  const card = e('section', 'glass card');
  card.append(e('p', 'eyebrow', 'Read from this page'));

  if (!result.ok) {
    const fail = e('p', 'read-fail');
    fail.textContent = result.message;
    card.append(fail);
    root.append(card);
    return;
  }

  const L = result.listing;
  const head = e('div', 'read-head');
  head.append(e('span', 'read-portal', L.portal));
  head.append(e('span', `read-source ${L.source === 'embedded' ? 'st-green' : 'st-amber'}`, L.source === 'embedded' ? 'read cleanly' : 'read from fallback'));
  card.append(head);

  // England & Wales gate — the same honest message the web app uses.
  if (L.postcode.status === 'found' && L.postcode.value) {
    const ew = postcodeToSector(L.postcode.value);
    if (!ew.inEnglandWales) card.append(e('p', 'read-fail', ew.message));
  }

  const ul = e('ul', 'fields');
  for (const { key, label } of ROWS) {
    const f = L[key] as Field<unknown>;
    const li = e('li', 'field-row');
    li.append(e('span', 'f-label', label));
    li.append(e('span', `f-status ${PILL[f.status] ?? 'st-unknown'}`, f.status === 'found' ? '' : (f.status === 'unavailable-on-this-portal' ? 'n/a' : 'missing')));
    li.append(e('span', 'f-value', fieldText(String(key), f)));
    ul.append(li);
  }
  card.append(ul);
  card.append(e('p', 'sample-note', `${L.portal} · extractor ${L.extractorVersion} · config ${L.configVersion}`));
  root.append(card);
}

// ---------- init ----------
async function init(): Promise<void> {
  // best-effort: refresh the cached extractor config from R2 (never blocks)
  void refreshRemoteConfig();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // tab.url is populated only for the portal tabs we hold host access to
    if (tab?.id != null && tab.url && /(^|\.)(rightmove|zoopla)\.co\.uk$/.test(new URL(tab.url).hostname)) {
      const result = (await chrome.tabs.sendMessage(tab.id, { type: EXTRACT_MESSAGE })) as ExtractResult;
      renderListing(result);
      return;
    }
  } catch {
    /* not a portal tab, or the content script isn't there — show the sample */
  }
  renderSample();
}

// In the extension the chrome APIs exist; in tests (happy-dom) they don't. We
// probe via globalThis so @types/chrome's always-defined typing doesn't hide the
// real runtime absence.
const runtime = globalThis as unknown as { chrome?: { tabs?: { query?: unknown } } };
if (runtime.chrome?.tabs?.query) {
  void init();
} else {
  renderSample();
}
