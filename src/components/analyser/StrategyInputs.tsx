/** Generic renderer for StrategyConfig fields — visible inputs + the
 * assumptions accordion. Purely config-driven; no strategy names in code. */
import type { StrategyField } from '../../config/strategies/types';
import { strategyParams, updateStrategy } from './state';
import { Tooltip } from './Tooltip';
import { Accordion } from './Accordion';

function Field({ f }: { f: StrategyField }) {
  const v = strategyParams.value[f.key] ?? f.default;
  return (
    <div class="field">
      <label for={`sf-${f.key}`}>
        {f.label}{f.unit ? ` (${f.unit})` : ''} <Tooltip text={f.tip} />
      </label>
      {f.kind === 'select' ? (
        <select id={`sf-${f.key}`} value={v} onChange={(e) => updateStrategy({ [f.key]: (e.target as HTMLSelectElement).value })}>
          {(f.options ?? []).map((o) => <option value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input id={`sf-${f.key}`} inputMode="decimal" value={v}
          onInput={(e) => updateStrategy({ [f.key]: (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, '') })} />
      )}
      {f.whyDefault && <p class="field-hint">{f.whyDefault}</p>}
    </div>
  );
}

export function StrategyInputs({ visible, assumptions }: { visible: StrategyField[]; assumptions: StrategyField[] }) {
  return (
    <>
      <div class="subject-form">
        {visible
          .filter((f) => !f.showWhen || (strategyParams.value[f.showWhen.key] ?? '') === f.showWhen.value)
          .map((f) => <Field f={f} />)}
      </div>
      {assumptions.length > 0 && (
        <div class="assumptions">
          <Accordion label="Assumptions — all editable">
            <div class="subject-form">
              {assumptions.map((f) => <Field f={f} />)}
            </div>
          </Accordion>
        </div>
      )}
    </>
  );
}
