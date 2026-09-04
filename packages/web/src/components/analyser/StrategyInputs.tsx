/** Generic renderer for StrategyConfig fields — visible inputs + the
 * assumptions accordion. Purely config-driven; no strategy names in code. */
import type { StrategyField } from '@gil-bricks/core';
import { strategyParams, updateStrategy } from './state';
import { Tooltip } from './Tooltip';
import { Accordion } from './Accordion';
import { ProvBadge } from './ProvBadge';
import { markEdited } from './provenance';
import { SECTION_STRIP } from '../../config/analyserSections';

function Field({ f }: { f: StrategyField }) {
  const v = strategyParams.value[f.key] ?? f.default;
  return (
    <div class="field">
      <label for={`sf-${f.key}`}>
        {f.label}{f.unit ? ` (${f.unit})` : ''} <Tooltip text={f.tip} /> <ProvBadge field={f.key} />
      </label>
      {f.kind === 'select' ? (
        <select id={`sf-${f.key}`} value={v} onChange={(e) => { updateStrategy({ [f.key]: (e.target as HTMLSelectElement).value }); markEdited(f.key); }}>
          {(f.options ?? []).map((o) => <option value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input id={`sf-${f.key}`} inputMode="decimal" value={v}
          onInput={(e) => { updateStrategy({ [f.key]: (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, '') }); markEdited(f.key); }} />
      )}
    </div>
  );
}

export function StrategyInputs({ visible, assumptions }: { visible: StrategyField[]; assumptions: StrategyField[] }) {
  return (
    <>
      <div class="subject-form" id="sec-inputs">
        {visible
          .filter((f) => !f.showWhen || (strategyParams.value[f.showWhen.key] ?? '') === f.showWhen.value)
          .map((f) => <Field f={f} />)}
      </div>
      {assumptions.length > 0 && (
        <div class="assumptions">
          <Accordion label={SECTION_STRIP.assumptions}>
            <div class="subject-form">
              {assumptions.map((f) => <Field f={f} />)}
            </div>
          </Accordion>
        </div>
      )}
    </>
  );
}
