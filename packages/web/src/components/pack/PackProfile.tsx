/**
 * DP1 — THE SOURCER'S BRANDING. Three things, and deliberately only three.
 *
 * WHAT THEY MAY CHANGE: business name, one accent colour, a logo. That is the
 * whole list. No fonts, no sizes, no layout, no page order — a pack that can be
 * broken will be broken, and the person it gets sent to is the one who pays for
 * it. The screen says why rather than leaving them hunting for the control.
 *
 * THE LOGO IS THEIRS AND IT IS SMALL. It is read in this browser, capped at
 * LOGO_MAX_BYTES by the Worker, and stored as a data URI on their own row so it
 * prints without a network fetch. Deleting the account deletes it with
 * everything else — the privacy policy says so, and handleDeleteAccount does it.
 */
import { useState } from 'preact/hooks';
import { PACK_COPY } from '../../config/pack';

export interface Branding {
  businessName: string;
  accentColour: string;
  logoDataUri: string;
}

/** The colour the pack falls back to when they have not chosen one. Neutral on
 *  purpose: an unbranded pack must look deliberate, not unfinished. */
export const NEUTRAL_ACCENT = '#334155';

export function PackProfile({ value, onSaved }: {
  value: Branding;
  onSaved: (b: Branding) => void;
}) {
  const [draft, setDraft] = useState<Branding>(value);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const readLogo = (file: File | null): void => {
    if (file === null) return;
    const reader = new FileReader();
    reader.onload = () => setDraft((d) => ({ ...d, logoDataUri: String(reader.result ?? '') }));
    reader.onerror = () => setNote(PACK_COPY.errors.logoFailed);
    reader.readAsDataURL(file);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setNote('');
    try {
      const res = await fetch('/api/pack/profile', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: draft.businessName,
          accentColour: draft.accentColour,
          logo: draft.logoDataUri,
        }),
      });
      if (res.ok) { onSaved(draft); setNote(PACK_COPY.profile.saved); }
      else if (res.status === 413) setNote(PACK_COPY.errors.logoTooBig);
      else setNote(PACK_COPY.errors.saveFailed);
    } catch {
      setNote(PACK_COPY.errors.saveFailed);
    }
    setBusy(false);
  };

  return (
    <div class="pk-profile">
      <h2>{PACK_COPY.profile.heading}</h2>
      <p class="hint">{PACK_COPY.profile.intro}</p>

      <div class="field">
        <label for="pk-p-name">{PACK_COPY.profile.businessName}</label>
        <input id="pk-p-name" type="text" maxLength={120} value={draft.businessName}
          onInput={(e) => setDraft((d) => ({ ...d, businessName: (e.target as HTMLInputElement).value }))} />
      </div>

      <div class="field">
        <label for="pk-p-accent">{PACK_COPY.profile.accent}</label>
        <p class="field-hint">{PACK_COPY.profile.accentHint}</p>
        <input id="pk-p-accent" type="color" value={draft.accentColour === '' ? NEUTRAL_ACCENT : draft.accentColour}
          onInput={(e) => setDraft((d) => ({ ...d, accentColour: (e.target as HTMLInputElement).value }))} />
      </div>

      <div class="field">
        <label for="pk-p-logo">{PACK_COPY.profile.logo}</label>
        <p class="field-hint">{PACK_COPY.profile.logoHint}</p>
        <input id="pk-p-logo" type="file" accept="image/png,image/jpeg"
          onChange={(e) => readLogo((e.target as HTMLInputElement).files?.[0] ?? null)} />
        {draft.logoDataUri !== '' && (
          <p>
            <img class="pk-profile-logo" src={draft.logoDataUri} alt="" />
            <button type="button" class="btn-link"
              onClick={() => setDraft((d) => ({ ...d, logoDataUri: '' }))}>{PACK_COPY.profile.logoRemove}</button>
          </p>
        )}
      </div>

      <p class="hint">{PACK_COPY.profile.whyNoMore}</p>
      {note !== '' && <p class="hint" role="status">{note}</p>}
      <button type="button" class="btn-secondary" disabled={busy} onClick={() => void save()}>
        {PACK_COPY.profile.save}
      </button>
    </div>
  );
}
