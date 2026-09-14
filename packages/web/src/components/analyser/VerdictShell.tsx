/**
 * THE CARDS AROUND A VERDICT (L1) — one shell, four strategies.
 *
 * WHAT THIS REPLACED. Every strategy rendered ONE card titled "<Strategy>
 * verdict" that held the inputs, the assumptions, the refurb section and the
 * answer. So a person filling in a rent, a deposit and a mortgage rate was
 * doing it inside a box labelled as the verdict, and the refurb photo carousel
 * — a whole feature with its own heading — appeared nested three levels down
 * inside it. R1 put refurb before the verdict, which was right; it did it by
 * nesting, which was not.
 *
 * THE ORDER THIS PRODUCES, and it is the page's real order, not CSS:
 *
 *     Property → Inputs → Refurb → Floor plan → Verdict → Figures → Costs
 *     → Comparables → Valuation
 *
 * Everything that FEEDS the answer now comes before it, and the answer sits
 * after all of it. That only works because the sticky bar already keeps the
 * score and the headline on screen the whole way down — the verdict card is the
 * detail, never the only place the answer exists.
 */
import type { ComponentChildren } from 'preact';
import type { CountryCode, StrategyConfig, StrategyField } from '@gil-bricks/core';
import { ANALYSER_SHELL } from '../../config/analyserForm';
import { VERDICT_COPY } from '../../config/verdicts';
import { features } from '../../config/features';
import { RefurbSection } from './RefurbSection';
import { StrategyInputs } from './StrategyInputs';
import { legacyRefurbLevel } from './state';

export function VerdictShell({
  config, country, hasContingency, aboveInputs, afterInputs, beforeVerdict, missing, afterVerdict, children,
}: {
  config: StrategyConfig;
  /** ONSPD country of the subject, for the refurb section's regional figures. */
  country: CountryCode | null;
  /** Whether this strategy's own engine already applies a contingency (R2). */
  hasContingency: boolean;
  /** Rendered at the TOP of the inputs card — HMO's scope note. */
  aboveInputs?: ComponentChildren;
  /** Rendered under the inputs — HMO's Article 4 flag and its sui generis warning. */
  afterInputs?: ComponentChildren;
  /** Rendered between refurb and the verdict: the floor plan. */
  beforeVerdict?: ComponentChildren;
  /**
   * The fields this strategy still needs before it can answer. When there are
   * any, the Verdict, Figures and Costs sections are not rendered by the island
   * — so the shell puts a line where each one would be, naming what it wants.
   */
  missing?: readonly StrategyField[];
  /**
   * CA1 — rendered INSIDE the verdict card, under the answer and before the
   * waiting line: the area trajectory panel. It is a collapsed line, visually
   * separate, and it is never part of the verdict — it is history and clearly
   * labelled assumptions, and the Deal Score has never seen it.
   */
  afterVerdict?: ComponentChildren;
  /** The verdict card's own body: the score, the banner, the figures, the costs. */
  children: ComponentChildren;
}) {
  const waiting = missing ?? [];
  const labels = waiting.map((f) => f.label);
  return (
    <>
      <section class="glass card" id="sec-inputs-card" aria-labelledby="inputs-h">
        <h2 id="inputs-h">{ANALYSER_SHELL.inputsHeading}</h2>
        {aboveInputs}
        <StrategyInputs visible={config.strategyInputs} assumptions={config.assumptions} />
        {afterInputs}
      </section>

      {/* Its own card, its own heading, its own place in the strip. It feeds the
          verdict, so it comes before it — which was always the point. */}
      {features.refurbSection && (
        <RefurbSection
          legacy={legacyRefurbLevel.value}
          onLegacySeen={() => { legacyRefurbLevel.value = false; }}
          country={country}
          hasContingency={hasContingency}
        />
      )}

      {beforeVerdict}

      <section class="glass card" aria-labelledby="verdict-h">
        <h2 id="verdict-h" tabIndex={-1}>{VERDICT_COPY.heading(config.name)}</h2>
        {children}
        {afterVerdict}
        {/* SAY WHY, DO NOT JUST HIDE IT. Each section keeps its own anchor, so
            its chip stays in the strip and lands on the explanation rather than
            disappearing and leaving the page looking broken. */}
        {waiting.length > 0 && (
          <p class="hint waiting-for" id="sec-verdict" role="status">
            {VERDICT_COPY.waitingFor(labels)}
            {VERDICT_COPY.waitingAnchors.map((id) => <span class="waiting-anchor" id={id} key={id} />)}
          </p>
        )}
      </section>
    </>
  );
}
