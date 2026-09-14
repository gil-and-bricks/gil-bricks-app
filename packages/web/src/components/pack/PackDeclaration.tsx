/**
 * DP1 — THE ONE-OFF DECLARATION, and the gate in front of every pack.
 *
 * WHY A GATE AT ALL. Sourcing property for somebody else is estate agency work
 * in the UK. A person who does not know that will make a pack, send it, and
 * find out later. The screen is not a warning banner they can scroll past: no
 * pack exists until it is completed, which is the only version of this that
 * actually changes what happens.
 *
 * IT DOES NOT JUDGE THEM. It states plainly what the law treats sourcing as,
 * asks for the registrations that go on every pack, and says out loud that it
 * is not advice. It never tells them whether they comply — that is between them
 * and their regulator, and a product that ruled on it would be doing something
 * it has no standing to do.
 *
 * A BLANK IS KEPT, NOT HIDDEN. Anything left empty prints as "Registration
 * details not provided" on the pack's compliance block. A gap the investor can
 * see is safer than one they cannot, so the form says so before they submit.
 */
import { useState } from 'preact/hooks';
import { DECLARATION, DECLARATION_VERSION, PACK_COPY } from '../../config/pack';

/** The fields, in the order they are asked and the order they are stored. */
const FIELDS = [
  { key: 'businessName', copy: DECLARATION.fields.businessName },
  { key: 'hmrcAml', copy: DECLARATION.fields.hmrcAml },
  { key: 'redressScheme', copy: DECLARATION.fields.redressScheme },
  { key: 'redressNumber', copy: DECLARATION.fields.redressNumber },
  { key: 'ico', copy: DECLARATION.fields.ico },
  { key: 'piInsurer', copy: DECLARATION.fields.piInsurer },
  { key: 'piExpiry', copy: DECLARATION.fields.piExpiry },
] as const;

type Values = Record<string, string>;

export function PackDeclaration({ onDone }: { onDone: () => void }) {
  const [values, setValues] = useState<Values>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const save = async (): Promise<void> => {
    if (!confirmed) { setNote(DECLARATION.mustConfirm); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/pack/declaration', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...values, confirmed: true, version: DECLARATION_VERSION }),
      });
      // 409 means it is already recorded — the gate is satisfied either way, and
      // a record that cannot be rewritten is the point of the 409.
      if (res.ok || res.status === 409) { onDone(); return; }
      setNote(PACK_COPY.errors.saveFailed);
    } catch {
      setNote(PACK_COPY.errors.saveFailed);
    }
    setBusy(false);
  };

  return (
    <div class="glass card pk-declare">
      <h1>{DECLARATION.heading}</h1>
      <p class="hint">{DECLARATION.intro}</p>

      {DECLARATION.understanding.map((p) => <p class="pk-declare-para" key={p}>{p}</p>)}

      {FIELDS.map((f) => (
        <div class="field" key={f.key}>
          <label for={`pk-d-${f.key}`}>{f.copy.label}</label>
          {f.copy.hint !== '' && <p class="field-hint">{f.copy.hint}</p>}
          <input
            id={`pk-d-${f.key}`}
            type="text"
            maxLength={120}
            value={values[f.key] ?? ''}
            onInput={(e) => setValues((v) => ({ ...v, [f.key]: (e.target as HTMLInputElement).value }))}
          />
        </div>
      ))}

      <p class="hint pk-declare-blanks">{DECLARATION.blanksWarning}</p>

      <label class="pk-declare-confirm" for="pk-d-confirm">
        <input
          id="pk-d-confirm"
          type="checkbox"
          checked={confirmed}
          onChange={(e) => { setConfirmed((e.target as HTMLInputElement).checked); setNote(''); }}
        />
        <span>{DECLARATION.confirmLabel}</span>
      </label>

      {note !== '' && <p class="hint" role="alert">{note}</p>}

      <button type="button" class="btn-action" disabled={busy || !confirmed} onClick={() => void save()}>
        {DECLARATION.submit}
      </button>
    </div>
  );
}
