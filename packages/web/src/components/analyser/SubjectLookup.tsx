/**
 * The property they are analysing, searched (E10).
 *
 * Every comparable row has had a Google button since C1. The SUBJECT — the one
 * property the person actually came here about, and the only address they typed
 * themselves — had none.
 *
 * IT SEARCHES WHAT THEY TYPED. The postcode, the house number and the flat if
 * they gave one. Not a street: we never ask for one, and inferring it from the
 * sales that happen to share the postcode would put an address on their screen
 * that they did not write and that could be wrong. Google resolves
 * "6 CF37 1HR" perfectly well.
 *
 * With no house number there is no property — only a street — so the button is
 * withheld and the reason is said, the same way the EPC lookup does it.
 */
import { fullAddress, googleSearchUrl, identifiesAProperty } from '@gil-bricks/core';
import { state } from './state';
import { SUBJECT_FORM } from '../../config/analyserForm';

export function SubjectLookup() {
  const s = state.value;
  const parts = { saon: s.saon, paon: s.paon, postcode: s.postcode };
  const ready = s.postcode.trim() !== '' && identifiesAProperty(parts);
  if (!ready) {
    return s.postcode.trim() === ''
      ? null
      : <p class="field-hint subject-lookup-needs">{SUBJECT_FORM.lookup.needsNumber}</p>;
  }
  const address = fullAddress(parts);
  return (
    <p class="subject-lookup">
      <a
        class="mini-btn"
        href={googleSearchUrl(address)}
        target="_blank"
        rel="noopener"
        aria-label={SUBJECT_FORM.lookup.full(address)}
      >
        {SUBJECT_FORM.lookup.button}
      </a>
    </p>
  );
}
