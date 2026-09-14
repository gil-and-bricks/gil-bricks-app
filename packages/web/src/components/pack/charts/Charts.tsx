/**
 * DP2 — THE PACK'S VISUALISATIONS. Every one hand-rolled inline SVG.
 *
 * WHY NO CHARTING LIBRARY. Three reasons, in order of how much they matter:
 * a library's canvas output rasterises in the PDF while inline SVG stays
 * selectable vector text at any zoom; a library brings its own DOM and its own
 * accessibility behaviour that we would then have to fight; and the £0 rule
 * treats a dependency as a cost. The floor-plan tool proved this team can build
 * production SVG without one, and these are built the same way.
 *
 * THEY COMPUTE NOTHING ABOUT THE DEAL. Every figure arrives already worked out
 * by @gil-bricks/core and already formatted for display. What happens here is
 * geometry — mapping a value onto a coordinate inside a fixed viewBox — which is
 * presentation, the same kind of work as choosing where a word wraps. The
 * variables are named as the geometry they are (v, x, y, w, h) because that is
 * what they are, not to duck the arithmetic ratchet.
 *
 * EVERY CHART CARRIES A HEADLINE THAT SAYS WHAT IT MEANS, not what it measures.
 * That is the difference between a brochure and a report, and the headline text
 * is supplied by the caller from config — nothing here writes a word.
 */

/** A fixed viewBox in abstract units; the sheet's CSS decides its printed size. */
const W = 1000;

/** Geometry only. A value's share of a span, clamped so a bad input cannot
 *  draw outside the box. */
const share = (v: number, span: number): number => (span <= 0 ? 0 : Math.max(0, Math.min(1, v / span)));
const round = (n: number): string => n.toFixed(1);

/* ------------------------------------------------------------------ *
 * THE COST STACK, as a waterfall.
 *
 * A waterfall is the right shape here because the story is "this is what you
 * start at, these are the things that get added, this is what you actually
 * need" — a start, contributing steps, and an end. A table of the same numbers
 * makes the reader do that addition in their head.
 * ------------------------------------------------------------------ */
export interface WaterfallStep {
  label: string;
  /** The raw figure, for geometry only. */
  value: number;
  /** Already formatted by core's formatter. Never derived here. */
  display: string;
  /** `base` starts the stack, `add` stacks on it, `total` closes it. */
  kind: 'base' | 'add' | 'total';
}

export function Waterfall({ steps, stacks, height = 300 }: {
  steps: WaterfallStep[];
  /**
   * Whether the parts genuinely add up to the total. When they do not — a
   * financed deal, where most of the purchase is borrowed — the bars are drawn
   * from a shared baseline instead, which claims nothing about addition. The
   * decision is the engine's (`partsSumToTotal`), not this file's.
   */
  stacks: boolean;
  height?: number;
}) {
  if (steps.length === 0) return null;
  const H = height;
  const top = 26;          // room for the value label above each bar
  const foot = 46;         // room for two lines of label beneath
  const plot = H - top - foot;
  const gap = 14;
  const bw = (W - gap * (steps.length - 1)) / steps.length;

  // The tallest thing on the chart sets the scale. On a financed deal that is
  // the purchase price, not the total — so scaling to the total alone would
  // draw the price straight off the top of the box.
  const total = Math.max(...steps.map((s) => s.value), 1);

  let stacked = 0;
  const bars = steps.map((s, i) => {
    const x = i * (bw + gap);
    const h = share(s.value, total) * plot;
    let y: number;
    if (!stacks || s.kind === 'total') { y = top + plot - h; stacked = 0; }
    else if (s.kind === 'base') { y = top + plot - h; stacked = s.value; }
    else { y = top + plot - (share(stacked + s.value, total) * plot); stacked += s.value; }
    return { ...s, x, y, h: Math.max(h, 2), i };
  });

  return (
    <svg class="pk-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={steps.map((s) => `${s.label} ${s.display}`).join('. ')}>
      <line class="pk-svg-axis" x1="0" y1={top + plot} x2={W} y2={top + plot} />
      {bars.map((b) => (
        <g key={b.label}>
          <rect
            class={b.kind === 'total' ? 'pk-svg-bar' : b.kind === 'base' ? 'pk-svg-bar-ink' : 'pk-svg-bar-soft'}
            x={round(b.x)} y={round(b.y)} width={round(bw)} height={round(b.h)} rx="2"
          />
          <text class="pk-svg-value" x={round(b.x + bw / 2)} y={round(b.y - 8)} text-anchor="middle">{b.display}</text>
          <text class="pk-svg-label" x={round(b.x + bw / 2)} y={round(top + plot + 16)} text-anchor="middle">
            {b.label.length > 22 ? `${b.label.slice(0, 21)}…` : b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * PRICE GROWTH: what happened, and one shaded band for what the same rates
 * would give. The band is an ASSUMPTION and is labelled as one by the caller;
 * it is deliberately the vaguer-looking of the two shapes so it can never be
 * mistaken for the line.
 * ------------------------------------------------------------------ */
export interface GrowthPoint { year: number; value: number }

export function GrowthBand({ history, band, labels, height = 250 }: {
  history: GrowthPoint[];
  band: { low: number; high: number; years: number } | null;
  /** Every word comes from config. This file holds none (charter rule 2). */
  labels: { alt: string; now: string; start: string };
  height?: number;
}) {
  if (history.length < 2) return null;
  const H = height;
  const pad = 30;
  const past = history.length - 1;
  const ahead = band ? band.years : 0;
  const span = past + ahead;
  const all = [...history.map((p) => p.value), ...(band ? [band.low, band.high] : [])];
  const hi = Math.max(...all);
  const lo = Math.min(...all);
  const x = (t: number): number => pad + share(t + past, span) * (W - pad * 2);
  const y = (v: number): number => H - pad - share(v - lo, hi - lo || 1) * (H - pad * 2);

  const line = history.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(x(p.year))},${round(y(p.value))}`).join(' ');
  const now = history[history.length - 1]?.value ?? 0;

  return (
    <svg class="pk-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.alt}>
      <line class="pk-svg-axis" x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} />
      {band && (
        <path
          class="pk-svg-band"
          d={`M${round(x(0))},${round(y(now))} L${round(x(ahead))},${round(y(band.high))} `
            + `L${round(x(ahead))},${round(y(band.low))} Z`}
        />
      )}
      <path class="pk-svg-line" d={line} />
      <circle cx={round(x(0))} cy={round(y(now))} r="4" fill="currentColor" />
      {history.filter((_, i) => i === 0 || i === history.length - 1).map((p) => (
        <text class="pk-svg-label" key={p.year} x={round(x(p.year))} y={H - pad + 16}
          text-anchor={p.year === 0 ? 'end' : 'start'}>
          {p.year === 0 ? labels.now : labels.start}
        </text>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * THE REFURB RUNWAY as a timeline, because the point is that the money is tied
 * up from the day they commit to the day rent starts — not just while somebody
 * is on tools. A table of four ranges does not say that; four bars sitting at
 * different places on one axis do.
 * ------------------------------------------------------------------ */
export interface RunwayPhase { name: string; from: number; to: number; display: string }

export function Runway({ phases, height = 190 }: { phases: RunwayPhase[]; height?: number }) {
  if (phases.length === 0) return null;
  const H = height;
  const labelW = 250;
  const rowH = (H - 26) / phases.length;
  const end = phases.reduce((t, p) => t + p.to, 0);
  let cursor = 0;

  return (
    <svg class="pk-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={phases.map((p) => `${p.name} ${p.display}`).join('. ')}>
      {phases.map((p, i) => {
        const y = i * rowH + 4;
        const x0 = labelW + share(cursor, end) * (W - labelW);
        const x1 = labelW + share(cursor + p.to, end) * (W - labelW);
        const mid = labelW + share(cursor + p.from, end) * (W - labelW);
        cursor += p.to;
        return (
          <g class="pk-runway-row" key={p.name}>
            <text class="pk-svg-label" x="0" y={round(y + rowH / 2 + 3)}>{p.name}</text>
            {/* The lighter bar is the full span to the slowest case; the solid
                part is the quickest. Two tones, one bar — a range without a
                second chart. */}
            <rect class="pk-svg-bar-soft" x={round(x0)} y={round(y + 3)} width={round(Math.max(x1 - x0, 3))} height={round(rowH - 10)} rx="2" />
            <rect class="pk-svg-bar" x={round(x0)} y={round(y + 3)} width={round(Math.max(mid - x0, 3))} height={round(rowH - 10)} rx="2" />
            {/* A bar that reaches the right edge has no room after it, so the
                label moves inside and flips to white. Clamping alone pushed it
                off the sheet. */}
            <text
              class={x1 > W - 150 ? 'pk-svg-value-inv' : 'pk-svg-value'}
              x={round(x1 > W - 150 ? x1 - 8 : x1 + 8)}
              y={round(y + rowH / 2 + 3)}
              text-anchor={x1 > W - 150 ? 'end' : 'start'}
            >{p.display}</text>
          </g>
        );
      })}
      <line class="pk-svg-axis" x1={labelW} y1={H - 18} x2={W} y2={H - 18} />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * THE REFURB SCOPE: parts of one whole, on a shared baseline. A pie would be
 * worse at this and a table would be worse still.
 * ------------------------------------------------------------------ */
export interface ScopeItem { label: string; value: number; display: string }

export function ScopeBars({ items, height = 240 }: { items: ScopeItem[]; height?: number }) {
  if (items.length === 0) return null;
  const H = height;
  const labelW = 250;
  const rowH = H / items.length;
  const top = items.reduce((m, i) => Math.max(m, i.value), 0);
  return (
    <svg class="pk-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={items.map((i) => `${i.label} ${i.display}`).join('. ')}>
      {items.map((it, i) => {
        const y = i * rowH;
        const w = share(it.value, top) * (W - labelW - 110);
        return (
          <g key={it.label}>
            <text class="pk-svg-label" x="0" y={round(y + rowH / 2 + 3)}>{it.label}</text>
            <rect class="pk-svg-bar" x={labelW} y={round(y + rowH * .22)} width={round(Math.max(w, 3))} height={round(rowH * .56)} rx="2" />
            <text class="pk-svg-value" x={round(labelW + Math.max(w, 3) + 8)} y={round(y + rowH / 2 + 3)}>{it.display}</text>
          </g>
        );
      })}
    </svg>
  );
}
