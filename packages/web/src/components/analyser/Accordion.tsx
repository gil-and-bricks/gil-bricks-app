/** Show-the-maths accordion rendering the S3.1 breakdown shape. Native
 * <details>/<summary> (N2): collapsed by default, works with no JavaScript,
 * and the browser's own find-in-page can open it. */
import type { ComponentChildren } from 'preact';
import type { Breakdown } from '@gil-bricks/core';
import { SECTION_STRIP } from '../../config/analyserSections';

export function MathsAccordion({ breakdown }: { breakdown: Breakdown }) {
  return (
    <Accordion label={SECTION_STRIP.maths}>
      <dl class="maths">
        <dt>Formula</dt>
        <dd>{breakdown.formula}</dd>
        <dt>Your numbers</dt>
        <dd>{breakdown.substituted}</dd>
        <dt>Result</dt>
        <dd>{breakdown.result}</dd>
      </dl>
      <p class="maths-note">{breakdown.note}</p>
    </Accordion>
  );
}

export function Accordion({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <details class="accordion">
      <summary class="accordion-btn">{label}</summary>
      <div class="accordion-body">{children}</div>
    </details>
  );
}
