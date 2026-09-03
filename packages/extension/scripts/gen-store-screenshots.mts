/**
 * Generates Chrome Web Store screenshot HTML (1280x800) from the REAL panel
 * render code + REAL fixture listings (no portal is fetched — fixtures are read
 * from disk and parsed with JavaScript execution DISABLED). Each page frames the
 * real rendered panel on a branded stage with a caption. A separate step
 * screenshots these with headless Chrome. These are honest renders of the real
 * UI with fixture data; the operator must RETAKE them from a real live listing
 * before submitting (a store screenshot should be the actual running product).
 */
import { Window } from 'happy-dom';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, '..');
const REPO = resolve(EXT, '..', '..');
const CORPUS = join(REPO, 'packages/core/fixtures/listings');
const OUT = join(EXT, 'store/screenshots');
mkdirSync(join(OUT, 'html'), { recursive: true });

// --- real panel CSS, with font URLs pointed at the on-disk woff2 files ---
const FONTS_ABS = 'file://' + join(EXT, 'public/fonts');
const panelCss = readFileSync(join(EXT, 'entrypoints/sidepanel/style.css'), 'utf8')
  .replace(/url\('\/fonts\//g, `url('${FONTS_ABS}/`);

// --- happy-dom parse of a fixture into an extracted listing (JS disabled) ---
async function main() {
  const core = await import('@gil-bricks/core');
  const { extractListing, scoreListing, smartDefaults, readSellerSignals, FALLBACK_CONFIG } = core as any;

  const parse = (portal: 'rightmove' | 'zoopla', file: string, url: string) => {
    const w = new Window({ url, settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
    w.document.write(readFileSync(join(CORPUS, portal, file), 'utf8'));
    const res = extractListing(portal, w.document as unknown as Document, FALLBACK_CONFIG, url);
    if (!res.ok) throw new Error(`extract failed for ${file}: ${res.message}`);
    return res.listing;
  };

  // Sample sector bracketing the listing price, so the price-vs-sold component is
  // realistic (not flagged "over") for these demo shots.
  const sector = (country: string, price: number) => ({
    schemaVersion: 1, sector: 'X', country, updatedAt: '2026-08-31T00:00:00Z', sales: [],
    stats: {
      count: 42,
      typicalPrice: Math.round(price * 1.03),
      typicalPpsqm: 2600,
      p10Price: Math.round(price * 0.8),
      p90Price: Math.round(price * 1.28),
    },
  });

  // --- render window becomes the global document the panel code draws into ---
  const rw = new Window({ url: 'https://localhost/' });
  for (const k of ['document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLButtonElement',
    'HTMLAnchorElement', 'HTMLImageElement', 'HTMLCanvasElement', 'Image', 'Event', 'CustomEvent', 'Node',
    'SVGElement']) {
    try { (globalThis as any)[k] = (rw as any)[k]; } catch { /* read-only global — skip */ }
  }
  (globalThis as any).window = rw;

  const panel = await import('../entrypoints/sidepanel/main.ts');
  const doc = rw.document as unknown as Document;
  const resetApp = () => { doc.body.innerHTML = '<main id="app" class="panel"></main><div id="gb-live"></div>'; };

  const mkView = (over: Record<string, unknown>) => {
    const listing = over.listing as any;
    const strategy = (over.strategy as string) ?? 'btl';
    const unknowns = (over.unknowns as Record<string, string>) ?? {};
    const pc = (listing.postcode?.value ?? '');
    const country = pc.startsWith('SA') || pc.startsWith('CF') || pc.startsWith('LL') || pc.startsWith('NP') ? 'W92000004' : 'E92000001';
    const sec = sector(country, Number(listing.askingPrice?.value) || 200000);
    const result = scoreListing(listing, { strategy, unknowns, sector: sec, ...(over.scoreOpts as object ?? {}) });
    return {
      screen: 'triage', listing, strategy, result, unknowns,
      suggestions: smartDefaults(strategy, listing, sec, (over.floorAreaSqm as number) ?? null),
      settings: {}, criteria: {}, floorAreaSqm: (over.floorAreaSqm as number) ?? null,
      floorAreaSource: (over.floorAreaSource as string) ?? 'none', floorAreaRange: null,
      manualAreaInput: '', usingSuggested: false,
      ...over,
    };
  };

  // pull selected nodes (by class), in the given order, into a fresh card
  const featured = (keepClasses: string[]): string => {
    const card = doc.querySelector('#app > section.card');
    if (!card) return doc.getElementById('app')!.innerHTML;
    const out = doc.createElement('section');
    out.className = 'glass card';
    for (const cls of keepClasses) {
      const el = card.querySelector('.' + cls);
      if (el) out.appendChild(el.cloneNode(true));
    }
    return out.outerHTML;
  };

  const page = (heading: string, sub: string, innerHtml: string, tall = false) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>${panelCss}</style>
<style>
  html,body{margin:0;padding:0}
  .stage{width:1280px;height:800px;overflow:hidden;display:flex;align-items:center;gap:56px;
    padding:0 64px;box-sizing:border-box;
    background:linear-gradient(180deg,#070014 0%,#1d022f 45%,#230138 75%,#050008 100%);}
  .cap{flex:1 1 auto;max-width:560px;color:#fff}
  .cap .mark{font-family:var(--font-display);font-weight:800;color:var(--accent);font-size:1.1rem;letter-spacing:.02em}
  .cap .maker{color:var(--text-dim);font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;margin:2px 0 26px}
  .cap h2{font-family:var(--font-display);font-weight:800;font-size:2.6rem;line-height:1.08;margin:0 0 16px}
  .cap p{color:var(--text-dim);font-size:1.15rem;line-height:1.5;margin:0}
  .device{flex:0 0 420px;height:${tall ? 760 : 720}px;overflow:hidden;border:1px solid rgba(220,255,0,.5);
    border-radius:20px;background:linear-gradient(180deg,#070014,#1d022f);box-shadow:0 24px 60px rgba(0,0,0,.5)}
  .device .panel{max-width:420px;padding:16px}
</style></head>
<body><div class="stage">
  <div class="cap"><div class="mark">PropLaunch</div><div class="maker">by Gil &amp; Bricks</div>
    <h2>${heading}</h2><p>${sub}</p></div>
  <div class="device"><main id="app" class="panel">${innerHtml}</main></div>
</div></body></html>`;

  const scenes: { name: string; heading: string; sub: string; html: () => string; tall?: boolean }[] = [];

  // 1) VERDICT + headline + components
  {
    const listing = parse('rightmove', 'rightmove-leasehold-flat-added.html', 'https://www.rightmove.co.uk/properties/1');
    const v = mkView({ listing, strategy: 'btl', unknowns: { rent: '1150' } });
    resetApp(); panel.renderTriage(v as any, {});
    const html = featured(['prop-addr', 'prop-facts', 'strategy-switch', 'deal-score', 'binding-note', 'components']);
    scenes.push({ name: '1-verdict', heading: 'One clear score for every listing', sub: 'A 0–10 Deal Score, the plain-English headline, and the single thing holding it back — for BTL, Flip, BRRRR and HMO.', html: () => page('One clear score for every listing', 'A 0–10 Deal Score, the plain-English headline, and the one thing holding it back — for BTL, Flip, BRRRR and HMO.', html) });
  }
  // 2) LEVERS + costs + change signal
  {
    const listing = parse('rightmove', 'rightmove-leasehold-flat-added.html', 'https://www.rightmove.co.uk/properties/1');
    const v = mkView({ listing, strategy: 'btl', unknowns: { rent: '1150' }, lastChange: 'Mortgage rate 5% → 6%: cashflow −£96/mo, score 7.1 → 6.3' });
    resetApp(); panel.renderTriage(v as any, {});
    const html = featured(['prop-addr', 'deal-score', 'levers', 'costs-card']);
    scenes.push({ name: '2-levers', heading: 'See what changes the answer', sub: 'Change the deposit, rate, how you buy or who manages it — the score and the cash you need update instantly, with a plain note of the effect.', html: () => page('See what changes the answer', 'Change the deposit, rate, how you buy or who manages it — the score and the cash you need update instantly, with a plain note of the effect.', html) });
  }
  // 3) SELLER SIGNALS (expanded)
  {
    const listing = parse('rightmove', 'rightmove-reduced-terrace-leasehold.html', 'https://www.rightmove.co.uk/properties/2');
    const signals = readSellerSignals(listing, FALLBACK_CONFIG.signals, new Date('2026-08-31'));
    const v = mkView({ listing, strategy: 'btl', unknowns: { rent: '1100' }, signals, signalsOpen: true });
    resetApp(); panel.renderTriage(v as any, {});
    const html = featured(['prop-addr', 'deal-score', 'seller-signals']);
    scenes.push({ name: '3-signals', heading: 'Negotiation signals, never mixed into the score', sub: 'Price cuts, time on the market and other seller cues are read from the listing and shown separately — context for your offer, kept out of the maths.', html: () => page('Negotiation signals, never mixed into the score', 'Price cuts, time on the market and other seller cues are read from the listing and shown separately — context for your offer, kept out of the maths.', html) });
  }
  // 4) MEASURE TOOL
  {
    const listing = parse('zoopla', 'zoopla-newbuild-semi-floorplan.html', 'https://www.zoopla.co.uk/for-sale/details/3');
    const v = mkView({ listing, strategy: 'hmo', unknowns: { roomRent: '650', rooms: '4' },
      floorplan: { available: true, open: true, acceptedSqm: null, measuredRooms: [12.4, 8.1, 5.2], imageUrl: undefined } });
    resetApp(); panel.renderMeasure(v as any, {});
    const card = doc.querySelector('#app > section.card');
    const html = card ? card.outerHTML : doc.getElementById('app')!.innerHTML;
    scenes.push({ name: '4-measure', heading: 'Measure the floor plan yourself', sub: 'Set the scale from a dimension you can read, then measure walls or test whether a room clears the HMO minimum — all on your device, nothing uploaded.', tall: true, html: () => page('Measure the floor plan yourself', 'Set the scale from a dimension you can read, then measure walls or test whether a room clears the HMO minimum — all on your device, nothing uploaded.', html, true) });
  }

  const manifest: string[] = [];
  for (const s of scenes) {
    const p = join(OUT, 'html', `${s.name}.html`);
    writeFileSync(p, s.html());
    manifest.push(p);
    console.log('wrote', p);
  }
  writeFileSync(join(OUT, 'html', 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\n' + scenes.length + ' screenshot pages generated.');
}
main().catch((e) => { console.error(e); process.exit(1); });
