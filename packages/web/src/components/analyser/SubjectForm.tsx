/** Shared subject-property inputs. Tooltip copy lives in src/content/microcopy.ts. */
import { useState } from 'preact/hooks';
import { MoneyInput } from './MoneyInput';
import { state, update } from './state';
import { Tooltip } from './Tooltip';
import { lookupEpcArea } from './epcArea';
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
  const [areaSource, setAreaSource] = useState<'user' | 'epc' | null>(null);
  const [epcBusy, setEpcBusy] = useState(false);
  const [epcMsg, setEpcMsg] = useState<string | null>(null);

  const findArea = async () => {
    setEpcBusy(true);
    setEpcMsg(null);
    const found = await lookupEpcArea(s.postcode, s.paon);
    setEpcBusy(false);
    if (found === null) {
      setEpcMsg(SUBJECT_FORM.epc.noMatch);
    } else if (state.value.area === '') {
      update({ area: String(found) });
      setAreaSource('epc');
      areaEpc.value = true; // provenance: this area is from EPC data
    } else {
      setEpcMsg(SUBJECT_FORM.epc.keptYours(found));
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
          onInput={(e) => { update({ paon: (e.target as HTMLInputElement).value, saon: '' }); markEdited('paon'); }} />
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
            onInput={(e) => { update({ area: (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, '') }); setAreaSource('user'); areaEpc.value = false; markEdited('area'); }} />
          <button type="button" class="mini-btn" onClick={findArea}
            disabled={epcBusy || s.paon.trim() === ''}
            title={s.paon.trim() === '' ? SUBJECT_FORM.epc.needsNumber : undefined}
            aria-describedby={s.paon.trim() === '' ? 'epc-needs' : undefined}>
            {epcBusy ? SUBJECT_FORM.epc.lookupBusy : SUBJECT_FORM.epc.lookupButton}
          </button>
        </div>
        {/* A greyed button with no reason reads as broken (D1). */}
        {s.paon.trim() === '' && <p id="epc-needs" class="field-hint">{SUBJECT_FORM.epc.needsNumber}</p>}
        {areaSource === 'epc' && <p class="field-hint">{SUBJECT_FORM.epc.fromEpc}</p>}
        {epcMsg && <p class="field-hint" role="status">{epcMsg}</p>}
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
