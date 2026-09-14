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
  PACK_COPY, PACK_PARTS, PACK_SECTIONS, SECTION,
} from '../../config/pack';
import { accentReadsOnPaper, onAccent } from '../../lib/pack/accent';
import { PackDocument, type PackModel } from './PackDocument';

type Base = Omit<PackModel, 'on' | 'order' | 'photos' | 'summary' | 'investorName' | 'branding'>;

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
  const preview = useRef<HTMLDivElement>(null);

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
    const fit = (): void => setZoom(Math.min(1, Math.max(0.25, (el.clientWidth - 32) / SHEET_PX)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
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

  /** The rail, in reading order: pinned first, the movable ones, pinned last. */
  const rail = [
    ...PACK_SECTIONS.filter((s) => s.pinned === 'first'),
    ...order.map((k) => PACK_SECTIONS.find((s) => s.key === k)).filter((s): s is typeof PACK_SECTIONS[number] => s !== undefined),
    ...PACK_SECTIONS.filter((s) => s.pinned === 'last'),
  ];

  return (
    <div class="pk-composer">
      <div class="pk-bar">
        <h1>{PACK_COPY.composer.heading}</h1>
        <button type="button" class="btn-action" onClick={() => window.print()}>
          {PACK_COPY.composer.download}
        </button>
        <p class="pk-note">{PACK_COPY.composer.downloadHint}</p>
      </div>

      {/* ---- the rail ------------------------------------------------ */}
      <aside class="pk-side glass card" aria-label={PACK_COPY.composer.sections}>
        <h2>{PACK_COPY.composer.sections}</h2>
        <p class="pk-note">{PACK_COPY.composer.sectionsHint}</p>
        <ul class="pk-sections">
          {rail.map((s) => {
            const locked = Boolean(s.lockedWhy);
            const movable = s.pinned === undefined;
            const i = order.indexOf(s.key);
            return (
              <li class={`pk-row${locked ? ' is-locked' : ''}`} key={s.key}>
                <input
                  type="checkbox" id={`pk-s-${s.key}`}
                  checked={locked || on.includes(s.key)}
                  disabled={locked}
                  aria-describedby={locked ? `pk-why-${s.key}` : undefined}
                  onChange={(e) => {
                    // A disabled box is a suggestion; this is the rule. It snaps
                    // back so the screen never says something untrue about the pack.
                    if (locked) { (e.currentTarget as HTMLInputElement).checked = true; return; }
                    toggle(s.key);
                  }}
                />
                <label class="pk-row-name" for={`pk-s-${s.key}`}>{s.label}</label>
                {locked && <span class="pk-lock">{PACK_COPY.build.lockedBadge}</span>}
                {movable && (
                  <span class="pk-row-move">
                    <button type="button" class="btn-link" disabled={i <= 0}
                      aria-label={PACK_COPY.composer.moveUp(s.label)} onClick={() => move(s.key, -1)}>↑</button>
                    <button type="button" class="btn-link" disabled={i < 0 || i >= order.length - 1}
                      aria-label={PACK_COPY.composer.moveDown(s.label)} onClick={() => move(s.key, 1)}>↓</button>
                  </span>
                )}
                {locked && <p class="pk-why" id={`pk-why-${s.key}`}>{s.lockedWhy}</p>}
              </li>
            );
          })}
        </ul>

        <h2>{PACK_COPY.composer.parts}</h2>
        <ul class="pk-sections">
          {PACK_PARTS.map((p) => (
            <li class="pk-row" key={p.key}>
              <input type="checkbox" id={`pk-p-${p.key}`} checked={on.includes(p.key)} onChange={() => toggle(p.key)} />
              <label class="pk-row-name" for={`pk-p-${p.key}`}>{p.label}</label>
            </li>
          ))}
        </ul>
      </aside>

      {/* ---- the document -------------------------------------------- */}
      <div class="pk-preview" ref={preview}>
        <div class="pk-scale" style={{ zoom }}>
          <PackDocument model={model} />
        </div>
      </div>

      {/* ---- the branding panel -------------------------------------- */}
      <aside class="pk-side glass card" aria-label={PACK_COPY.composer.brand}>
        <h2>{PACK_COPY.composer.brand}</h2>

        <div class="pk-field">
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
            <input type="color" class="pk-swatch" aria-label={PACK_COPY.composer.custom} value={accent}
              onInput={(e) => onBranding({ ...branding, accentColour: (e.target as HTMLInputElement).value })} />
          </div>
          {!accentReadsOnPaper(accent) && <p class="pk-note" role="alert">{PACK_COPY.composer.accentWarning}</p>}
        </div>

        <div class="pk-field">
          <label for="pk-logo">{PACK_COPY.composer.logo}</label>
          <input id="pk-logo" type="file" accept="image/png,image/jpeg"
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => onBranding({ ...branding, logoDataUri: String(r.result ?? '') });
              r.readAsDataURL(f);
            }} />
          {branding.logoDataUri !== '' && (
            <button type="button" class="btn-link"
              onClick={() => onBranding({ ...branding, logoDataUri: '' })}>{PACK_COPY.composer.logoRemove}</button>
          )}
        </div>

        <div class="pk-field">
          <label for="pk-investor">{PACK_COPY.composer.investor}</label>
          <input id="pk-investor" type="text" maxLength={120} value={investorName}
            onInput={(e) => setInvestorName((e.target as HTMLInputElement).value)} />
        </div>

        <div class="pk-field">
          <label for="pk-summary">{PACK_COPY.composer.summary}</label>
          <p class="pk-note">{PACK_COPY.composer.summaryHint}</p>
          <textarea id="pk-summary" rows={4} value={summary}
            onInput={(e) => setSummary((e.target as HTMLTextAreaElement).value)} />
        </div>

        <div class="pk-field">
          <h2>{PACK_COPY.composer.photos}</h2>
          <p class="pk-note">{PACK_COPY.composer.photosHint}</p>
          <p class="pk-note">{PACK_COPY.composer.noPortalImages}</p>
          <p class="pk-note">{PACK_COPY.composer.photosNote}</p>
          <input type="file" accept="image/*" multiple aria-label={PACK_COPY.composer.photosAdd}
            onChange={(e) => addPhotos((e.target as HTMLInputElement).files)} />
          {photos.length > 0 && (
            <>
              <div class="pk-thumbs">{photos.slice(0, 6).map((src) => <img class="pk-thumb" src={src} alt="" key={src} />)}</div>
              <p class="pk-note">
                {PACK_COPY.composer.photosCount(photos.length)}{' '}
                <button type="button" class="btn-link" onClick={() => setPhotos([])}>{PACK_COPY.composer.photosClear}</button>
              </p>
              <label class="pk-row" for="pk-duo">
                <input id="pk-duo" type="checkbox" checked={branding.duotone}
                  onChange={() => onBranding({ ...branding, duotone: !branding.duotone })} />
                <span class="pk-row-name">{PACK_COPY.composer.duotone}</span>
              </label>
              <p class="pk-note">{PACK_COPY.composer.duotoneHint}</p>
            </>
          )}
        </div>

        {/* REFUSED WITH AN EXPLANATION, never a silent strip. */}
        {refused.length > 0 && (
          <div role="alert">
            <h2>{BANNED_COPY.heading}</h2>
            <p class="pk-note">{BANNED_COPY.intro}</p>
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
