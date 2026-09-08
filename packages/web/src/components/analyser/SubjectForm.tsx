/** Shared subject-property inputs. Tooltip copy lives in src/content/microcopy.ts. */
import { useState } from 'preact/hooks';
import { MoneyInput } from './MoneyInput';
import { state, update } from './state';
import { Tooltip } from './Tooltip';
import { lookupEpcArea } from './epcArea';
import type { AreaSource } from '@gil-bricks/core';
import { tip } from '../../content/microcopy';
import { ProvBadge } from './ProvBadge';
import { markEdited, areaEpc } from './provenance';
import { SUBJECT_FORM } from '../../config/analyserForm';

// Tooltip copy lives in src/content/microcopy.ts (edit words there, not here).
const TIPS: Record<string, string> = {
  postcode: tip('subject.postcode'),
  price: tip('subject.price'),
  paon: tip('subject.paon'),
  type: tip('subject.type'),
  area: tip('subject.area'),
  beds: tip('subject.beds'),
  baths: tip('subject.baths'),
  refurb: tip('subject.refurb'),
  age: tip('subject.age'),
  garden: tip('subject.garden'),
  parking: tip('subject.parking'),
};

export function SubjectForm({ postcodeError }: { postcodeError: string | null }) {
  const s = state.value;
  // WHICH source filled the area, or null when the person typed it. The value
  // is the key into the copy, so no source name is ever spelled out in here.
  const [lookedUp, setLookedUp] = useState<AreaSource | null>(null);
  const [supersededNote, setSupersededNote] = useState(false);
  const [epcBusy, setEpcBusy] = useState(false);
  const [epcMsg, setEpcMsg] = useState<string | null>(null);
  // Our fault vs the address's: an outage is announced, an outcome is a hint.
  const [epcOurFault, setEpcOurFault] = useState(false);

  const findArea = async () => {
    setEpcBusy(true);
    setEpcMsg(null);
    // try/finally, because the button DISABLES itself while busy: if anything
    // threw on the way through, the flag stayed true and the button sat greyed
    // out saying "…" for ever, with no way back. A dead control is the very
    // thing this lookup was rewritten to stop.
    try {
      const found = await lookupEpcArea(s.postcode, s.paon, s.saon);
      if (!found.ok) {
        setEpcMsg(SUBJECT_FORM.epc.problem[found.reason]);
        setEpcOurFault(found.reason === 'unavailable');
      } else if (state.value.area === '') {
        setEpcOurFault(false);
        update({ area: String(found.sqm) });
        setLookedUp(found.source);
        // Only a register answer ever carries this, so it needs no source test.
        setSupersededNote(found.supersededOthers === true);
        areaEpc.value = true; // provenance: this area is looked up, not typed
      } else {
        setEpcOurFault(false);
        setEpcMsg(SUBJECT_FORM.epc.keptYours(found.sqm));
      }
    } catch {
      setEpcMsg(SUBJECT_FORM.epc.problem.unavailable);
      setEpcOurFault(true);
    } finally {
      setEpcBusy(false);
    }
  };

  return (
    <form class="subject-form" onSubmit={(e) => e.preventDefault()}>
      <div class="field">
        <label for="f-postcode">{SUBJECT_FORM.labels.postcode} <Tooltip text={TIPS.postcode} /> <ProvBadge field="postcode" /></label>
        <input id="f-postcode" inputMode="text" autocomplete="postal-code" value={s.postcode}
          onInput={(e) => { update({ postcode: (e.target as HTMLInputElement).value.toUpperCase() }); markEdited('postcode'); }} />
        {postcodeError && <p class="field-error" role="alert">{postcodeError}</p>}
      </div>
      <div class="field">
        <label for="f-paon">{SUBJECT_FORM.labels.paon} <Tooltip text={TIPS.paon} /> <ProvBadge field="paon" /></label>
        <input id="f-paon" value={s.paon}
          onInput={(e) => {
            // A DIFFERENT building means the flat number from the old one is
            // meaningless, so it goes. Retyping the SAME number keeps it — it is
            // the only record of which flat this is, and there is no field to put
            // it back in (P7 review).
            const paon = (e.target as HTMLInputElement).value;
            update(paon.trim() === s.paon.trim() ? { paon } : { paon, saon: '' });
            markEdited('paon');
          }} />
      </div>
      <div class="field">
        <label for="f-price">{SUBJECT_FORM.labels.price} <Tooltip text={TIPS.price} /> <ProvBadge field="price" /></label>
        <MoneyInput id="f-price" value={s.price} onValue={(price) => update({ price })} onEdited={() => markEdited('price')} />
      </div>
      <div class="field">
        <label for="f-type">{SUBJECT_FORM.labels.type} <Tooltip text={TIPS.type} /> <ProvBadge field="type" /></label>
        <select id="f-type" value={s.type} onChange={(e) => { update({ type: (e.target as HTMLSelectElement).value as never }); markEdited('type'); }}>
          <option value="">{SUBJECT_FORM.choices.typePrompt}</option>
          <option value="D">{SUBJECT_FORM.choices.type.detached}</option>
          <option value="S">{SUBJECT_FORM.choices.type.semiDetached}</option>
          <option value="T">{SUBJECT_FORM.choices.type.terraced}</option>
          <option value="F">{SUBJECT_FORM.choices.type.flat}</option>
        </select>
      </div>
      <div class="field">
        <label for="f-area">{SUBJECT_FORM.labels.area} <Tooltip text={TIPS.area} /> <ProvBadge field="area" /></label>
        <div class="row">
          <input id="f-area" inputMode="numeric" value={s.area}
            onInput={(e) => { update({ area: (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, '') }); setLookedUp(null); setSupersededNote(false); areaEpc.value = false; markEdited('area'); }} />
          <button type="button" class="mini-btn" onClick={findArea}
            disabled={epcBusy || s.paon.trim() === ''}
            title={s.paon.trim() === '' ? SUBJECT_FORM.epc.needsNumber : undefined}
            aria-describedby={s.paon.trim() === '' ? 'epc-needs' : undefined}>
            {epcBusy ? SUBJECT_FORM.epc.lookupBusy : SUBJECT_FORM.epc.lookupButton}
          </button>
        </div>
        {/* A greyed button with no reason reads as broken (D1). */}
        {s.paon.trim() === '' && <p id="epc-needs" class="field-hint">{SUBJECT_FORM.epc.needsNumber}</p>}
        {lookedUp !== null && (
          <p class="field-hint">
            {SUBJECT_FORM.epc.source[lookedUp]}
            {supersededNote ? ` ${SUBJECT_FORM.epc.superseded}` : ''}
          </p>
        )}
        {epcMsg && (epcOurFault
          ? <p class="field-error" role="alert">{epcMsg}</p>
          : <p class="field-hint" role="status">{epcMsg}</p>)}
      </div>
      <div class="field">
        <label for="f-beds">{SUBJECT_FORM.labels.beds} <Tooltip text={TIPS.beds} /> <ProvBadge field="beds" /></label>
        <select id="f-beds" value={s.beds} onChange={(e) => { update({ beds: (e.target as HTMLSelectElement).value }); markEdited('beds'); }}>
          <option value="">{SUBJECT_FORM.choices.empty}</option>
          {['1', '2', '3', '4', '5', '6+'].map((b) => <option value={b}>{b}</option>)}
        </select>
      </div>
      <div class="field">
        <label for="f-baths">{SUBJECT_FORM.labels.baths} <Tooltip text={TIPS.baths} /> <ProvBadge field="baths" /></label>
        <select id="f-baths" value={s.baths} onChange={(e) => { update({ baths: (e.target as HTMLSelectElement).value }); markEdited('baths'); }}>
          <option value="">{SUBJECT_FORM.choices.empty}</option>
          {['1', '2', '3+'].map((b) => <option value={b}>{b}</option>)}
        </select>
      </div>
      <div class="field">
        <label for="f-refurb">{SUBJECT_FORM.labels.refurb} <Tooltip text={TIPS.refurb} /></label>
        <select id="f-refurb" value={s.refurb} onChange={(e) => update({ refurb: (e.target as HTMLSelectElement).value as never })}>
          <option value="">{SUBJECT_FORM.choices.empty}</option>
          <option value="none">{SUBJECT_FORM.choices.refurb.none}</option>
          <option value="light">{SUBJECT_FORM.choices.refurb.light}</option>
          <option value="moderate">{SUBJECT_FORM.choices.refurb.moderate}</option>
          <option value="heavy">{SUBJECT_FORM.choices.refurb.heavy}</option>
        </select>
      </div>
      <div class="field">
        <label for="f-age">{SUBJECT_FORM.labels.age} <Tooltip text={TIPS.age} /></label>
        <select id="f-age" value={s.age} onChange={(e) => update({ age: (e.target as HTMLSelectElement).value as never })}>
          <option value="">{SUBJECT_FORM.choices.empty}</option>
          <option value="pre1900">{SUBJECT_FORM.choices.age.pre1900}</option>
          <option value="1900-1949">{SUBJECT_FORM.choices.age.from1900}</option>
          <option value="1950-1999">{SUBJECT_FORM.choices.age.from1950}</option>
          <option value="2000plus">{SUBJECT_FORM.choices.age.from2000}</option>
        </select>
      </div>
      <div class="field">
        <label for="f-garden">{SUBJECT_FORM.labels.garden} <Tooltip text={TIPS.garden} /></label>
        <select id="f-garden" value={s.garden} onChange={(e) => update({ garden: (e.target as HTMLSelectElement).value as never })}>
          <option value="">{SUBJECT_FORM.choices.empty}</option>
          <option value="none">{SUBJECT_FORM.choices.garden.none}</option>
          <option value="yes">{SUBJECT_FORM.choices.garden.yes}</option>
        </select>
      </div>
      <div class="field">
        <label for="f-parking">{SUBJECT_FORM.labels.parking} <Tooltip text={TIPS.parking} /></label>
        <select id="f-parking" value={s.parking} onChange={(e) => update({ parking: (e.target as HTMLSelectElement).value as never })}>
          <option value="">{SUBJECT_FORM.choices.empty}</option>
          <option value="0">{SUBJECT_FORM.choices.parking.none}</option>
          <option value="1">{SUBJECT_FORM.choices.parking.one}</option>
          <option value="2plus">{SUBJECT_FORM.choices.parking.twoPlus}</option>
        </select>
      </div>
    </form>
  );
}
