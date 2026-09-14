/**
 * DP1 — THE PACK BUILDER.
 *
 * Two states, and the order is the safety:
 *
 *   choose  →  what goes in, your own summary, your own photographs
 *   built   →  the document, and the two ways to get it out
 *
 * WHAT THE USER CAN CHANGE is deliberately narrow: which sections go in, their
 * own summary, their own photographs, who it is for, and the branding on the
 * panel below. There is no font control, no size control, no layout control and
 * no page reordering — the pack stays well designed because it cannot be
 * broken, and nobody ends up supporting somebody's typography.
 *
 * WHAT THEY CANNOT CHANGE is the locked set, and the tick boxes for those are
 * disabled AND the model puts them back regardless. Two mechanisms on purpose:
 * a disabled input is a suggestion, `withLocked()` is the rule.
 *
 * THE PHOTOGRAPHS NEVER LEAVE THIS BROWSER. They are read in this tab, go into
 * the document, and are not uploaded, not stored and not sent anywhere. The
 * listing portal's own images are never touched: nothing here has a remote
 * image source, and nothing here fetches one.
 */
import { useMemo, useRef, useState } from 'preact/hooks';
import { checkFreeText, withLocked, type BannedHit } from '@gil-bricks/core';
import { BANNED_COPY, BANNED_PHRASES, PACK_COPY, PACK_PAGES } from '../../config/pack';
import { PackDocument, type PackModel } from './PackDocument';
import { PackProfile, type Branding } from './PackProfile';
import { savePackFile } from '../../lib/pack/saveFile';

interface Props {
  /** Everything the document needs except the parts chosen on this screen. */
  base: Omit<PackModel, 'on' | 'photos' | 'summary' | 'investorName'>;
  onBranding: (b: Branding) => void;
}

/** Every section key, so "all on" is derived rather than retyped. */
const ALL_SECTIONS = PACK_PAGES.flatMap((p) => p.sections.map((s) => s.key));
const LOCKED_KEYS = PACK_PAGES.flatMap((p) => p.sections.filter((s) => s.lockedWhy).map((s) => s.key));

/** A file name from the deal's own title. No punctuation anybody's OS dislikes. */
const fileNameFor = (title: string): string => {
  const stem = title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${stem === '' ? 'deal-pack' : stem}.html`;
};

export function PackBuilder({ base, onBranding }: Props) {
  const [on, setOn] = useState<string[]>(() => withLocked(ALL_SECTIONS));
  const [investorName, setInvestorName] = useState('');
  const [summary, setSummary] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [built, setBuilt] = useState(false);
  const [note, setNote] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  /** Their own words, checked before the pack will build. */
  const refused: BannedHit[] = useMemo(
    () => [...checkFreeText(summary, BANNED_PHRASES).hits, ...checkFreeText(investorName, BANNED_PHRASES).hits],
    [summary, investorName],
  );

  const toggle = (key: string): void => {
    if (LOCKED_KEYS.includes(key)) return;
    setOn((prev) => withLocked(prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  /**
   * READ AS DATA, NOT AS A LINK. An object URL only works in the tab that made
   * it, so a saved pack would have lost its photographs the moment it was sent.
   * Read here, the picture is part of the document.
   */
  const addPhotos = (files: FileList | null): void => {
    if (files === null) return;
    for (const file of [...files].filter((f) => f.type.startsWith('image/'))) {
      const reader = new FileReader();
      reader.onload = () => setPhotos((prev) => [...prev, String(reader.result ?? '')]);
      reader.readAsDataURL(file);
    }
  };

  const model: PackModel = { ...base, on: withLocked(on), photos, summary, investorName };

  if (built) {
    return (
      <>
        <div class="pk-build pk-build-bar">
          <button type="button" class="btn-secondary" onClick={() => setBuilt(false)}>{PACK_COPY.build.back}</button>
          <button type="button" class="btn-action" onClick={() => window.print()}>{PACK_COPY.build.print}</button>
          <button
            type="button"
            class="btn-secondary"
            onClick={() => { if (!savePackFile(sheet.current, model.title, fileNameFor(model.title))) setNote(PACK_COPY.save.failed); }}
          >
            {PACK_COPY.save.file}
          </button>
          <p class="hint">{PACK_COPY.save.fileHint}</p>
          {note !== '' && <p class="hint" role="alert">{note}</p>}
        </div>
        <div class="pk-preview-wrap" ref={sheet}>
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
                    onChange={(e) => {
                      // A LOCKED BOX SNAPS BACK. The document puts the section
                      // in regardless, so a box left looking unticked — which
                      // is what happens when the `disabled` attribute is
                      // removed, and all it takes is dev tools — would tell the
                      // user something untrue about their own pack.
                      if (locked) { (e.currentTarget as HTMLInputElement).checked = true; return; }
                      toggle(s.key);
                    }}
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

      <div class="field">
        <label for="pk-investor">{PACK_COPY.build.investorName}</label>
        <input id="pk-investor" type="text" maxLength={120} value={investorName}
          onInput={(e) => setInvestorName((e.target as HTMLInputElement).value)} />
      </div>

      <div class="field">
        <label for="pk-summary">{PACK_COPY.build.summaryLabel}</label>
        <p class="field-hint">{PACK_COPY.build.summaryHint}</p>
        <textarea id="pk-summary" rows={4} value={summary}
          onInput={(e) => setSummary((e.target as HTMLTextAreaElement).value)} />
      </div>

      <h2>{PACK_COPY.build.photosLabel}</h2>
      <p class="hint">{PACK_COPY.build.photosHint}</p>
      <p class="hint">{PACK_COPY.build.noPortalImages}</p>
      <p class="hint">{PACK_COPY.build.photosNote}</p>
      <input type="file" accept="image/*" multiple aria-label={PACK_COPY.build.photosAdd}
        onChange={(e) => addPhotos((e.target as HTMLInputElement).files)} />
      {photos.length > 0 && (
        <p>
          {PACK_COPY.build.photosCount(photos.length)}{' '}
          <button type="button" class="btn-secondary" onClick={() => setPhotos([])}>{PACK_COPY.build.photosClear}</button>
        </p>
      )}

      <details class="pk-profile-wrap" open={showProfile} onToggle={(e) => setShowProfile((e.target as HTMLDetailsElement).open)}>
        <summary>{PACK_COPY.profile.open}</summary>
        <PackProfile value={base.branding} onSaved={onBranding} />
      </details>

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
