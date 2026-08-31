/** Shared subject-property inputs. Tooltip copy lives in src/content/microcopy.ts. */
import { useState } from 'preact/hooks';
import { state, update } from './state';
import { Tooltip } from './Tooltip';
import { lookupEpcArea } from './epcArea';
import { tip } from '../../content/microcopy';

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
      setEpcMsg('No EPC match found for this address.');
    } else if (state.value.area === '') {
      update({ area: String(found) });
      setAreaSource('epc');
    } else {
      setEpcMsg(`EPC says ${found} sqm — your figure kept.`);
    }
  };

  return (
    <form class="subject-form" onSubmit={(e) => e.preventDefault()}>
      <div class="field">
        <label for="f-postcode">Postcode <Tooltip text={TIPS.postcode} /></label>
        <input id="f-postcode" inputMode="text" autocomplete="postal-code" value={s.postcode}
          onInput={(e) => update({ postcode: (e.target as HTMLInputElement).value.toUpperCase() })} />
        {postcodeError && <p class="field-error" role="alert">{postcodeError}</p>}
      </div>
      <div class="field">
        <label for="f-paon">House number / name <Tooltip text={TIPS.paon} /></label>
        <input id="f-paon" value={s.paon}
          onInput={(e) => update({ paon: (e.target as HTMLInputElement).value, saon: '' })} />
      </div>
      <div class="field">
        <label for="f-price">Price (£) <Tooltip text={TIPS.price} /></label>
        <input id="f-price" inputMode="numeric" value={s.price}
          onInput={(e) => update({ price: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
      </div>
      <div class="field">
        <label for="f-type">Property type <Tooltip text={TIPS.type} /></label>
        <select id="f-type" value={s.type} onChange={(e) => update({ type: (e.target as HTMLSelectElement).value as never })}>
          <option value="">Choose…</option>
          <option value="D">Detached</option>
          <option value="S">Semi-detached</option>
          <option value="T">Terraced</option>
          <option value="F">Flat</option>
        </select>
      </div>
      <div class="field">
        <label for="f-area">Internal area (sqm) <Tooltip text={TIPS.area} /></label>
        <div class="row">
          <input id="f-area" inputMode="numeric" value={s.area}
            onInput={(e) => { update({ area: (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, '') }); setAreaSource('user'); }} />
          <button type="button" class="mini-btn" onClick={findArea} disabled={epcBusy || s.paon.trim() === ''}>
            {epcBusy ? '…' : 'EPC lookup'}
          </button>
        </div>
        {areaSource === 'epc' && <p class="field-hint">From the EPC match for this address — edit to override.</p>}
        {areaSource !== 'epc' && s.area !== '' && <p class="field-hint">Your figure (EPC lookup available).</p>}
        {epcMsg && <p class="field-hint" role="status">{epcMsg}</p>}
      </div>
      <div class="field">
        <label for="f-beds">Bedrooms <Tooltip text={TIPS.beds} /></label>
        <select id="f-beds" value={s.beds} onChange={(e) => update({ beds: (e.target as HTMLSelectElement).value })}>
          <option value="">—</option>
          {['1', '2', '3', '4', '5', '6+'].map((b) => <option value={b}>{b}</option>)}
        </select>
      </div>
      <div class="field">
        <label for="f-baths">Bathrooms <Tooltip text={TIPS.baths} /></label>
        <select id="f-baths" value={s.baths} onChange={(e) => update({ baths: (e.target as HTMLSelectElement).value })}>
          <option value="">—</option>
          {['1', '2', '3+'].map((b) => <option value={b}>{b}</option>)}
        </select>
      </div>
      <div class="field">
        <label for="f-refurb">Refurb needed <Tooltip text={TIPS.refurb} /></label>
        <select id="f-refurb" value={s.refurb} onChange={(e) => update({ refurb: (e.target as HTMLSelectElement).value as never })}>
          <option value="">—</option>
          <option value="none">None</option>
          <option value="light">Light</option>
          <option value="moderate">Moderate</option>
          <option value="heavy">Heavy</option>
        </select>
      </div>
      <div class="field">
        <label for="f-age">Age band <Tooltip text={TIPS.age} /></label>
        <select id="f-age" value={s.age} onChange={(e) => update({ age: (e.target as HTMLSelectElement).value as never })}>
          <option value="">—</option>
          <option value="pre1900">Pre-1900</option>
          <option value="1900-1949">1900–1949</option>
          <option value="1950-1999">1950–1999</option>
          <option value="2000plus">2000 on</option>
        </select>
      </div>
      <div class="field">
        <label for="f-garden">Garden <Tooltip text={TIPS.garden} /></label>
        <select id="f-garden" value={s.garden} onChange={(e) => update({ garden: (e.target as HTMLSelectElement).value as never })}>
          <option value="">—</option>
          <option value="none">None</option>
          <option value="yes">Yes</option>
        </select>
      </div>
      <div class="field">
        <label for="f-parking">Parking <Tooltip text={TIPS.parking} /></label>
        <select id="f-parking" value={s.parking} onChange={(e) => update({ parking: (e.target as HTMLSelectElement).value as never })}>
          <option value="">—</option>
          <option value="0">None</option>
          <option value="1">1 space</option>
          <option value="2plus">2+</option>
        </select>
      </div>
    </form>
  );
}
