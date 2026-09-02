/** Show-the-maths accordion rendering the S3.1 breakdown shape. */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Breakdown } from '@gil-bricks/core';

export function MathsAccordion({ breakdown }: { breakdown: Breakdown }) {
  return (
    <Accordion label="How is this calculated?">
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
  const [open, setOpen] = useState(false);
  return (
    <div class="accordion">
      <button type="button" class="accordion-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">{open ? '−' : '+'}</span> {label}
      </button>
      {open && <div class="accordion-body">{children}</div>}
    </div>
  );
}
