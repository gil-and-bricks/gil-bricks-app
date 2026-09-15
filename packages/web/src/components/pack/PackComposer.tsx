/**
 * DP2 — THE COMPOSER. One screen, and the document is already on it.
 *
 * WHAT WAS WRONG WITH THE LAST ONE, in the operator's words: too many steps
 * before seeing anything, a dead end at the end with no way back, and branding
 * he could not find. Three complaints, three rules:
 *
 *   1. The pack renders immediately, finished-looking, with sensible defaults.
 *      There is nothing to click through before seeing a document.
 *   2. There is no final screen. Download is a button on this screen, and after
 *      exporting you are still on this screen.
 *   3. Branding is a labelled panel that is always visible. It is not behind a
 *      disclosure, a tab or a different route.
 *
 * WHAT THE USER CONTROLS is deliberately narrow: which pages, in what order,
 * their colour, their logo, their photographs, and their own words. They never
 * touch type, grid, spacing or layout — so no arrangement of their choices
 * comes out misaligned. The design quality lives in the templates.
 *
 * REORDERING IS BUTTONS, NOT DRAG. A drag handle needs a keyboard equivalent
 * anyway, and the keyboard equivalent IS a pair of buttons — so the buttons are
 * the whole feature rather than a grudging fallback. They work with a mouse, a
 * finger and a tab key without three implementations of one idea.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { checkFreeText, withLocked, type BannedHit } from '@gil-bricks/core';
import {
  ACCENT_PALETTE, BANNED_COPY, BANNED_PHRASES, MOVABLE_SECTIONS,
  PACK_COPY, PACK_FIELDS, PACK_PARTS, PACK_SECTIONS, SECTION,
} from '../../config/pack';
import { accentReadsOnPaper, onAccent } from '../../lib/pack/accent';
import { buildPackHtml, downloadPack, packFilename } from '../../lib/pack/share';
import { openWhatsApp } from '../../lib/share/whatsapp';
import { FilePick } from './FilePick';
import { PackDocument, sectionsWithContent, type PackModel } from './PackDocument';

/**
 * The document's data, minus everything the builder owns. Exported because
 * PackApp declared its own copy of this and the two drifted the moment one
 * gained a field — a compile error that only appeared because they happened to
 * share a name.
 */
export type Base = Omit<PackModel, 'on' | 'order' | 'photos' | 'summary' | 'investorName' | 'branding'> & { dealId: string };

export interface Branding {
  businessName: string;
  accentColour: string;
  logoDataUri: string;
  duotone: boolean;
}

interface Props {
  base: Base;
  branding: Branding;
  onBranding: (b: Branding) => void;
}

const ALL_KEYS = [...PACK_SECTIONS.map((s) => s.key), ...PACK_PARTS.map((p) => p.key)];
const LOCKED = PACK_SECTIONS.filter((s) => s.lockedWhy).map((s) => s.key);
/** A4 at 96dpi. The preview scales the real sheet rather than restyling it. */
const SHEET_PX = 793.7;

export function PackComposer({ base, branding, onBranding }: Props) {
  const [on, setOn] = useState<string[]>(() => withLocked(ALL_KEYS));
  const [order, setOrder] = useState<string[]>([...MOVABLE_SECTIONS]);
  const [investorName, setInvestorName] = useState('');
  const [summary, setSummary] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [shareLink, setShareLink] = useState('');
  const preview = useRef<HTMLDivElement>(null);
  const doc = useRef<HTMLDivElement>(null);

  /** Their own words, refused with an explanation rather than stripped. */
  const refused: BannedHit[] = useMemo(
    () => [...checkFreeText(summary, BANNED_PHRASES).hits, ...checkFreeText(investorName, BANNED_PHRASES).hits],
    [summary, investorName],
  );

  /**
   * THE PREVIEW IS THE REAL SHEET, SCALED — not a re-styled copy of it. `zoom`
   * rather than `transform: scale` because zoom reflows, so the container's
   * height is right and the page scrolls properly; a transform would leave the
   * old height behind and the preview would scroll into empty space.
   */
  useEffect(() => {
    const el = preview.current;
    if (el === null || typeof ResizeObserver === 'undefined') return undefined;
    /**
     * THE SHEET NO LONGER HAS THE COLUMN TO ITSELF.
     *
     * Each page now shares its row with the gutter holding that page's
     * controls, so fitting the sheet to the FULL preview width overflows it by
     * exactly the width of the gutter — the cover's address ran off the right
     * edge mid-word. Measured from a real row rather than assumed from the CSS,
     * so the two cannot drift: at narrow widths the gutter stacks above instead
     * of beside, and this reads 0 for it without needing to know that.
     */
    const fit = (): void => {
      /**
       * ASK THE LAYOUT, DO NOT INFER IT.
       *
       * Each page shares its row with the gutter holding that page's controls,
       * so fitting to the full preview width overflows by exactly the gutter —
       * the cover's address ran off the right edge mid-word. A first attempt
       * guessed "are they side by side?" from offsets and got it wrong; this
       * reads the grid's own resolved columns, which is the only thing that
       * actually knows. One track means the gutter has stacked above (narrow
       * widths) and the sheet has the whole row.
       */
      const row = el.querySelector<HTMLElement>('.pk-sheet');
      let taken = 0;
      if (row !== null) {
        const cols = getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean);
        if (cols.length > 1) {
          const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
          taken = (Number.parseFloat(cols[0] ?? '0') || 0) + gap;
        }
      }
      setZoom(Math.min(1, Math.max(0.25, (el.clientWidth - taken - 32) / SHEET_PX)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    // The first fit runs before the gutters exist; one more after paint.
    const t = setTimeout(fit, 0);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, []);

  const toggle = (key: string): void => {
    if (LOCKED.includes(key)) return;
    setOn((prev) => withLocked(prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const move = (key: string, by: -1 | 1): void => {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      const j = i + by;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  /**
   * READ AS DATA, NOT AS A LINK. An object URL only works in the tab that made
   * it, so a saved pack would lose its photographs the moment it was sent.
   */
  const addPhotos = (files: FileList | null): void => {
    if (files === null) return;
    for (const file of [...files].filter((f) => f.type.startsWith('image/'))) {
      const reader = new FileReader();
      reader.onload = () => setPhotos((prev) => [...prev, String(reader.result ?? '')]);
      reader.readAsDataURL(file);
    }
  };

  /**
   * SHARING IS THE PRIMARY ACTION, and it is one press.
   *
   * The file is built from the sheets already on screen, so what is sent is
   * literally what was previewed — there is no second renderer to disagree with
   * the first. `busy` exists because inlining the fonts is a handful of fetches
   * and a big base64, and a button that looks inert for a second invites a
   * second press and a second file.
   */
  /**
   * SAVING ATTACHES THE PACK TO THE DEAL. It used to download a file, which is
   * not saving: come back tomorrow and the pack was gone, and the deal card
   * never showed one had been made. The pack's contents go to the deal, and the
   * save returns the link that makes WhatsApp and email possible at all.
   */
  const savePack = async (): Promise<string> => {
    if (busy) return shareLink;
    setBusy(true);
    try {
      const res = await fetch('/api/pack/save', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        /**
         * THE WHOLE MODEL, NOT JUST THE CHOICES — because a saved pack is a
         * SNAPSHOT. An investor opening a link a week later must see the
         * document that was sent them, not one silently rebuilt from figures
         * that have since been re-scored. Saving only the switches also meant
         * the link had no address, no figures and no comparables to render,
         * which is exactly what it did: a blank page behind a valid token.
         */
        body: JSON.stringify({ deal: base.dealId, pack: model }),
      });
      if (!res.ok) return '';
      const body = (await res.json()) as { token?: string; savedAt?: string };
      setSavedAt(body.savedAt ?? new Date().toISOString());
      const link = body.token !== undefined && body.token !== ''
        ? `${location.origin}/p/${body.token}`
        : shareLink;
      if (link !== '') setShareLink(link);
      return link;
    } finally {
      setBusy(false);
    }
  };

  /**
   * DIRECT, NEVER A MENU. `openWhatsApp` is the one place a wa.me URL is built
   * (whatsapp.ts), and it opens SYNCHRONOUSLY on the click so the gesture is
   * still live and the tab is not blocked as a popup — which is why the link is
   * fetched first and the window opened after, only when we already have one.
   */
  const sendTo = async (where: 'whatsapp' | 'email'): Promise<void> => {
    const link = shareLink !== '' ? shareLink : await savePack();
    if (link === '') return;
    const text = PACK_COPY.composer.shareText(base.address, link);
    if (where === 'whatsapp') { openWhatsApp(text); return; }
    const to = `mailto:?subject=${encodeURIComponent(PACK_COPY.composer.shareSubject(base.address))}`
      + `&body=${encodeURIComponent(text)}`;
    location.href = to;
  };

  const download = async (): Promise<void> => {
    const root = doc.current?.querySelector<HTMLElement>('.pk');
    if (root === null || root === undefined || busy) return;
    setBusy(true);
    try {
      const html = await buildPackHtml(root, base.address, document.documentElement.lang || 'en-GB');
      downloadPack(html, packFilename(base.address, PACK_COPY.composer.fileSuffix));
    } finally {
      setBusy(false);
    }
  };

  /**
   * DP5 — THE RAIL IS BACK, AND SO IS THE RULE THAT MADE THE TOGGLES WORK.
   *
   * DP4 put each page's controls in a gutter beside that page. That fixed the
   * five dead toggles, but it did so by rebuilding the layout, and the layout
   * was the part DP3 had got right. The FIX was never the gutter — it was the
   * rule underneath it: a control may only exist where the thing it controls
   * does. That rule is a filter, and a filter works just as well on a sidebar.
   *
   * `sectionsWithContent` is the same function the document uses to decide
   * what to draw, so the rail cannot offer a row for a page that will not
   * render. A section that is switched OFF still keeps its row — the sidebar
   * never had DP4's problem of a hidden page taking its own switch away with
   * it, which is one piece of machinery this layout simply does not need.
   */
  const contentful = sectionsWithContent({ ...base, photos });

  /** A part is offered only where the underlying figure, list or image exists. */
  const partExists = (key: string): boolean => {
    if (key === SECTION.photos) return photos.length > 0;
    if (key === SECTION.scope) return base.scope.length > 0;
    if (key === SECTION.duration) return base.runway !== null;
    if (key === SECTION.floorplan) return base.floorPlan !== null;
    return false;
  };
  const liveParts = PACK_PARTS.filter((x) => partExists(x.key));

  const accent = branding.accentColour === '' ? ACCENT_PALETTE[0].hex : branding.accentColour;
  const model: PackModel = {
    ...base,
    branding: { ...branding, accentColour: accent, onAccent: onAccent(accent) },
    on: withLocked(on),
    order,
    photos,
    summary: refused.length > 0 ? '' : summary,
    investorName: refused.length > 0 ? '' : investorName,
  };

  /**
   * The rail, in reading order: pinned first, the movable ones, pinned last —
   * and ONLY sections this deal can actually produce a page for.
   *
   * The three locked rows are folded into one line at the foot rather than
   * three rows wearing the same badge. That was a separate complaint ("do not
   * give unchangeable things the same weight as changeable ones") and it is not
   * a layout matter, so it survives the return to the sidebar.
   */
  const rail = [
    ...PACK_SECTIONS.filter((s) => s.pinned === 'first'),
    ...order.map((k) => PACK_SECTIONS.find((s) => s.key === k)).filter((s): s is typeof PACK_SECTIONS[number] => s !== undefined),
  ].filter((s) => contentful[s.key] === true);
  const lockedRows = PACK_SECTIONS.filter((s) => s.lockedWhy !== undefined);

  return (
    <div class="pk-composer">
      <div class="pk-bar">
        <h1 class="page-title">{PACK_COPY.composer.heading}</h1>
        <div class="pk-actions">
          <button type="button" class="btn-action" disabled={busy} onClick={() => void savePack()}>
            {busy ? PACK_COPY.composer.saving : PACK_COPY.composer.save}
          </button>
          <button type="button" class="btn-secondary" disabled={busy} onClick={() => void sendTo('whatsapp')}>
            {PACK_COPY.composer.shareWhatsApp}
          </button>
          <button type="button" class="btn-secondary" disabled={busy} onClick={() => void sendTo('email')}>
            {PACK_COPY.composer.shareEmail}
          </button>
          <button type="button" class="btn-link" disabled={busy} onClick={() => void download()}>
            {PACK_COPY.composer.download}
          </button>
          <button type="button" class="btn-link" onClick={() => window.print()}>
            {PACK_COPY.composer.print}
          </button>
          {savedAt !== '' && <span class="hint pk-saved">{PACK_COPY.composer.saved}</span>}
        </div>
      </div>

      {/* ---- the rail ------------------------------------------------ */}
      <aside class="pk-side glass card" aria-label={PACK_COPY.composer.sections}>
        <h2>{PACK_COPY.composer.sections}</h2>
        <ul class="pk-sections">
          {rail.map((s) => {
            const movable = s.pinned === undefined;
            const i = order.indexOf(s.key);
            return (
              <li class="pk-row" key={s.key}>
                <input
                  type="checkbox" id={`pk-s-${s.key}`}
                  checked={on.includes(s.key)}
                  onChange={() => toggle(s.key)}
                />
                <label class="pk-row-name" for={`pk-s-${s.key}`}>{s.label}</label>
                {movable && (
                  <span class="pk-row-move">
                    {/**
                      * `aria-disabled`, NOT `disabled`. Walk a section to the
                      * top with the keyboard and a truly disabled button blurs
                      * under the user's own focus, dropping them to the body.
                      * This stays focusable and simply refuses.
                      */}
                    <button type="button" class="btn-link" aria-disabled={i <= 0}
                      aria-label={PACK_COPY.composer.moveUp(s.label)}
                      onClick={() => { if (i > 0) move(s.key, -1); }}>↑</button>
                    <button type="button" class="btn-link" aria-disabled={i < 0 || i >= order.length - 1}
                      aria-label={PACK_COPY.composer.moveDown(s.label)}
                      onClick={() => { if (i >= 0 && i < order.length - 1) move(s.key, 1); }}>↓</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {liveParts.length > 0 && (
          <>
            <h2>{PACK_COPY.composer.parts}</h2>
            <ul class="pk-sections">
              {liveParts.map((pt) => (
                <li class="pk-row" key={pt.key}>
                  <input type="checkbox" id={`pk-p-${pt.key}`} checked={on.includes(pt.key)}
                    onChange={() => toggle(pt.key)} />
                  <label class="pk-row-name" for={`pk-p-${pt.key}`}>{pt.label}</label>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Said ONCE, quietly, at the foot — not three rows with a badge each. */}
        <p class="pk-always">
          {PACK_COPY.gutter.always}: {lockedRows.map((s) => s.label.toLowerCase()).join(', ')}.
        </p>
      </aside>

      {/* ---- the document -------------------------------------------- */}
      <div class="pk-preview" ref={preview}>
        <div class="pk-scale" style={{ zoom }} ref={doc}>
          <PackDocument model={model} />
        </div>
      </div>

      {/* ---- the branding panel -------------------------------------- */}
      <aside class="pk-side glass card" aria-label={PACK_COPY.composer.brand}>
        <h2>{PACK_COPY.composer.brand}</h2>

        <div class="field">
          <label id="pk-accent-lab">{PACK_COPY.composer.accent}</label>
          <div class="pk-swatches" role="group" aria-labelledby="pk-accent-lab">
            {ACCENT_PALETTE.map((c) => (
              <button
                type="button" class="pk-swatch" key={c.hex} title={c.name} aria-label={c.name}
                aria-pressed={accent.toLowerCase() === c.hex.toLowerCase()}
                style={{ background: c.hex }}
                onClick={() => onBranding({ ...branding, accentColour: c.hex })}
              />
            ))}
            {/**
              * THE CUSTOM PICKER LOOKED LIKE A SEVENTH PRESET.
              *
              * `<input type="color">` paints itself as a plain filled square of
              * its current value, so at the end of a row of coloured discs it
              * read as one more colour to choose — a grey box with no hint that
              * pressing it opens anything. The wrapper gives it the one thing
              * the control could not say about itself: that it is a way in to
              * every other colour. The input is still the real input, still
              * labelled, still keyboard-reachable; only its face changes.
              */}
            <span class="pk-custom">
              <input type="color" id="pk-custom" class="pk-swatch pk-swatch-custom"
                aria-label={PACK_COPY.composer.custom} value={accent}
                onInput={(e) => onBranding({ ...branding, accentColour: (e.target as HTMLInputElement).value })} />
              <span class="pk-custom-ring" aria-hidden="true" />
              <span class="pk-custom-plus" aria-hidden="true">+</span>
            </span>
          </div>
          {!accentReadsOnPaper(accent) && <p class="hint" role="alert">{PACK_COPY.composer.accentWarning}</p>}
        </div>

        <div class="field">
          <label for="pk-logo">{PACK_COPY.composer.logo}</label>
          <FilePick id="pk-logo" accept="image/png,image/jpeg" label={PACK_COPY.composer.logoPick}
            onFiles={(files) => {
              const f = files?.[0];
              if (f === undefined) return;
              const r = new FileReader();
              r.onload = () => onBranding({ ...branding, logoDataUri: String(r.result ?? '') });
              r.readAsDataURL(f);
            }} />
          {branding.logoDataUri !== '' && (
            <button type="button" class="btn-link"
              onClick={() => onBranding({ ...branding, logoDataUri: '' })}>{PACK_COPY.composer.logoRemove}</button>
          )}
        </div>

        {/**
          * DP4 RENAMED THESE AND DP5 KEEPS THE NAMES.
          *
          * They used to read "Who is it for? (optional)" and "Your summary of
          * the deal (optional)", which the operator said meant nothing to him —
          * fairly, because both describe a CATEGORY rather than an effect. They
          * are named by what they do to the document now, and each says where it
          * lands. That was a copy fix, not a layout one, so returning the
          * controls to the sidebar does not undo it.
          */}
        <div class="field">
          <label for="pk-f-investor">{PACK_FIELDS.investor}</label>
          <input id="pk-f-investor" type="text" maxLength={120} value={investorName}
            onInput={(e) => setInvestorName((e.target as HTMLInputElement).value)} />
          <p class="hint">{PACK_FIELDS.investorHint}</p>
        </div>

        <div class="field">
          <label for="pk-f-summary">{PACK_FIELDS.summary}</label>
          <textarea id="pk-f-summary" rows={3} value={summary}
            onInput={(e) => setSummary((e.target as HTMLTextAreaElement).value)} />
          <p class="hint">{PACK_FIELDS.summaryHint}</p>
        </div>

        <div class="field">
          <h2>{PACK_COPY.composer.photos}</h2>
          <p class="hint">{PACK_COPY.composer.photosHint}</p>
          <FilePick id="pk-photos" accept="image/*" multiple label={PACK_COPY.composer.photosAdd}
            onFiles={(f) => addPhotos(f)} />
          {photos.length > 0 && (
            <>
              <div class="pk-thumbs">{photos.slice(0, 6).map((src) => <img class="pk-thumb" src={src} alt="" key={src} />)}</div>
              <p class="hint">
                {PACK_COPY.composer.photosCount(photos.length)}{' '}
                <button type="button" class="btn-link" onClick={() => setPhotos([])}>{PACK_COPY.composer.photosClear}</button>
              </p>
              <label class="pk-row" for="pk-duo">
                <input id="pk-duo" type="checkbox" checked={branding.duotone}
                  onChange={() => onBranding({ ...branding, duotone: !branding.duotone })} />
                <span class="pk-row-name">{PACK_COPY.composer.duotone}</span>
              </label>
            </>
          )}
        </div>

        {/* REFUSED WITH AN EXPLANATION, never a silent strip. */}
        {refused.length > 0 && (
          <div role="alert">
            <h2>{BANNED_COPY.heading}</h2>
            <p class="hint">{BANNED_COPY.intro}</p>
            {refused.map((h) => (
              <div class="pk-refused" key={h.phrase}>
                <p class="pk-refused-phrase">{BANNED_COPY.found(h.phrase)}</p>
                <p class="pk-refused-why">{h.why}</p>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
