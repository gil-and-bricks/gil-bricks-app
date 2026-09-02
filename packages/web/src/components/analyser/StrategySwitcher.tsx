/**
 * "Analyse this as…" pills. Navigating keeps ALL shared subject + comps
 * state (everything in UrlState) and deliberately DROPS strategy-specific
 * params — the target strategy starts from its own config defaults.
 * toQuery(state, {}) serialises exactly the shared keys, so the valuation
 * and comparables render identically on the other side.
 */
import { strategies } from '@gil-bricks/core';
import { state, toQuery } from './state';

export function StrategySwitcher({ currentId, label = 'Analyse this as…' }: {
  currentId: string | null;
  label?: string;
}) {
  const query = toQuery(state.value, {});
  return (
    <nav class="switcher" aria-label={label}>
      <span class="switcher-label">{label}</span>
      {strategies.map((s) =>
        s.id === currentId ? (
          <span class="pill pill-current" aria-current="page">{s.name}</span>
        ) : (
          <a class="pill" href={`${s.route}/analyser${query}`}>{s.name}</a>
        ),
      )}
    </nav>
  );
}
