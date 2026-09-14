/**
 * DP1 — THE PACK BUILDER.
 *
 * Three states, in order, and the order is the safety:
 *
 *   no declaration  →  the one-off declaration, and nothing else is reachable
 *   declared        →  choose what goes in, add your own photographs
 *   built           →  the document, and the print button
 *
 * WHAT THE USER CAN CHANGE is deliberately narrow: which sections go in, their
 * own summary, their own photographs, who it is for. Their branding is set once
 * on the profile screen. There is no font control, no size control, no layout
 * control and no page reordering — the pack stays well designed because it
 * cannot be broken, and nobody ends up supporting somebody's typography.
 *
 * WHAT THEY CANNOT CHANGE is the locked set, and the tick boxes for those are
 * disabled AND the model puts them back regardless. Two mechanisms on purpose:
 * a disabled input is a suggestion, `withLocked()` is the rule.
 *
 * THE PHOTOGRAPHS NEVER LEAVE THIS BROWSER. They are read into object URLs for
 * the print and are not uploaded, not stored and not sent anywhere. The listing
 * portal's own images are never touched: nothing here fetches a remote image.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { checkFreeText, withLocked, type BannedHit } from '@gil-bricks/core';
import { BANNED_COPY, BANNED_PHRASES, PACK_COPY, PACK_PAGES } from '../../config/pack';
import { PackDocument, type PackModel } from './PackDocument';

interface Props {
  /** Everything the document needs except the parts chosen on this screen. */
  base: Omit<PackModel, 'on' | 'photos' | 'summary' | 'investorName'>;
  /** Whether the one-off declaration has been completed. */
  declared: boolean;
}

/** Every section key, so "all on" is derived rather than retyped. */
const ALL_SECTIONS = PACK_PAGES.flatMap((p) => p.sections.map((s) => s.key));
const LOCKED_KEYS = PACK_PAGES.flatMap((p) => p.sections.filter((s) => s.lockedWhy).map((s) => s.key));

export function PackApp({ base, declared }: Props) {
  const [on, setOn] = useState<string[]>(() => withLocked(ALL_SECTIONS));
  const [investorName, setInvestorName] = useState('');
  const [summary, setSummary] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [built, setBuilt] = useState(false);

  /** Their own words, checked before the pack will build. */
  const refused: BannedHit[] = useMemo(
    () => [...checkFreeText(summary, BANNED_PHRASES).hits, ...checkFreeText(investorName, BANNED_PHRASES).hits],
    [summary, investorName],
  );

  // Object URLs are a resource; release them when the set changes or we leave.
  useEffect(() => () => { for (const url of photos) URL.revokeObjectURL(url); }, []);

  if (!declared) return null;

  const toggle = (key: string): void => {
    if (LOCKED_KEYS.includes(key)) return;
    setOn((prev) => withLocked(prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const addPhotos = (files: FileList | null): void => {
    if (!files) return;
    const urls = [...files].filter((f) => f.type.startsWith('image/')).map((f) => URL.createObjectURL(f));
    setPhotos((prev) => [...prev, ...urls]);
  };

  const clearPhotos = (): void => {
    for (const url of photos) URL.revokeObjectURL(url);
    setPhotos([]);
  };

  const model: PackModel = { ...base, on: withLocked(on), photos, summary, investorName };

  if (built) {
    return (
      <>
        <div class="pk-build">
          <button type="button" class="btn-secondary" onClick={() => setBuilt(false)}>{PACK_COPY.build.back}</button>
          <button type="button" class="btn-action" onClick={() => window.print()}>{PACK_COPY.build.print}</button>
        </div>
        <div class="pk-preview-wrap">
          <PackDocument model={model} />
        </div>
      </>
    );
  }

  return (
    <div class="pk-build">
      <h1>{PACK_COPY.build.heading}</h1>
      <p class="hint">{PACK_COPY.build.intro}</p>

      {PACK_PAGES.map((page) => (
        <section key={page.key}>
          <h2>{page.title}</h2>
          <ul class="pk-sections">
            {page.sections.map((s) => {
              const locked = Boolean(s.lockedWhy);
              return (
                <li class="pk-section-row" key={s.key}>
                  <input
                    type="checkbox"
                    id={`pk-${s.key}`}
                    checked={locked || on.includes(s.key)}
                    disabled={locked}
                    aria-describedby={locked ? `pk-why-${s.key}` : undefined}
                    onChange={() => toggle(s.key)}
                  />
                  <div>
                    <label for={`pk-${s.key}`}>{s.label}</label>
                    {locked && (
                      <>
                        {' '}
                        <span class="pk-locked" aria-label={PACK_COPY.build.lockedAria}>{PACK_COPY.build.lockedBadge}</span>
                        <p class="pk-locked-why" id={`pk-why-${s.key}`}>{s.lockedWhy}</p>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <label for="pk-investor">{PACK_COPY.build.investorName}</label>
      <input id="pk-investor" type="text" value={investorName}
        onInput={(e) => setInvestorName((e.target as HTMLInputElement).value)} />

      <label for="pk-summary">{PACK_COPY.build.summaryLabel}</label>
      <p class="hint">{PACK_COPY.build.summaryHint}</p>
      <textarea id="pk-summary" rows={4} value={summary}
        onInput={(e) => setSummary((e.target as HTMLTextAreaElement).value)} />

      <h2>{PACK_COPY.build.photosLabel}</h2>
      <p class="hint">{PACK_COPY.build.photosHint}</p>
      <p class="hint">{PACK_COPY.build.noPortalImages}</p>
      <p class="hint">{PACK_COPY.build.photosNote}</p>
      <input type="file" accept="image/*" multiple aria-label={PACK_COPY.build.photosAdd}
        onChange={(e) => addPhotos((e.target as HTMLInputElement).files)} />
      {photos.length > 0 && (
        <p>
          {PACK_COPY.build.photosCount(photos.length)}{' '}
          <button type="button" class="btn-secondary" onClick={clearPhotos}>{PACK_COPY.build.photosClear}</button>
        </p>
      )}

      {/* REFUSED WITH AN EXPLANATION, never a silent strip. */}
      {refused.length > 0 && (
        <div role="alert">
          <h2>{BANNED_COPY.heading}</h2>
          <p class="hint">{BANNED_COPY.intro}</p>
          {refused.map((h) => (
            <div class="pk-refused" key={h.phrase}>
              <p class="pk-refused-phrase">{BANNED_COPY.found(h.phrase)}</p>
              <p class="pk-refused-why">{h.why}</p>
              <p class="hint">{BANNED_COPY.inContext} “{h.context}”</p>
            </div>
          ))}
          <p>{BANNED_COPY.cannotContinue}</p>
        </div>
      )}

      <button type="button" class="btn-action" disabled={refused.length > 0} onClick={() => setBuilt(true)}>
        {PACK_COPY.build.make}
      </button>
    </div>
  );
}
