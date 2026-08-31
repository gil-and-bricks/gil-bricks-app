# Adding a strategy = config + one verdict component

The analyser shell is generic. A strategy consists of exactly two things:

## 1. Its StrategyConfig (src/config/strategies/index.ts)

```ts
{
  id: 'flip',
  name: 'Flip',            // shortName for compact nav if needed
  route: '/flip',          // landing page + /flip/analyser both derive from this
  tagline: '…', heroLine: '…',
  strategyInputs: [ … ],   // VISIBLE inputs — keep to 6 or fewer (simplicity law)
  assumptions: [ … ],      // editable defaults, each with a whyDefault note
  thresholds: { … },       // every verdict cut-off lives HERE, never in code
  verdictSlot: 'FlipVerdict',
  copy: {},
}
```

Each field is a `StrategyField`: `{ key, label, kind: 'number'|'select', unit,
default, options?, tip, whyDefault? }`. Field keys become URL query params
automatically (shareable links) — keys must be unique against the shared
`UrlState` keys in `src/components/analyser/state.ts` (DEFAULTS) and across
strategies; `state.test.ts` enforces this, so a collision fails CI.

## 2. Its verdict island (src/components/analyser/&lt;Name&gt;Verdict.tsx)

- Register it in the `VERDICTS` map at the top of `AnalyserApp.tsx` (one line).
- Its props are fixed by the registry:
  `{ config: StrategyConfig; comps: ComparablesResult | null; valuation: Valuation | null }` —
  thresholds arrive inside `config`.
- On mount call `initStrategyParams([...config.strategyInputs, ...config.assumptions])`
  (it clamps URL values to each field's options/number shape); read live values
  from the `strategyParams` signal; render inputs with the generic
  `<StrategyInputs visible={config.strategyInputs} assumptions={config.assumptions} />`.
- Compute via a composition module in `src/lib/strategies/<id>.ts` that ONLY
  calls `src/lib/maths` functions — every figure keeps its breakdown so every
  tile gets a "How is this calculated?" accordion (`<MathsAccordion>`).
- Verdict colours and copy: Green/Amber/Red with plain-English sentences and
  a single most-useful lever where the verdict isn't green.
- Take thresholds from `config.thresholds` — tuning a strategy must never
  need a code change.

BTL (S4.2) is the reference implementation: `src/config/strategies/index.ts`
(btl entry), `src/lib/strategies/btl.ts` (+ tests) and
`src/components/analyser/BtlVerdict.tsx`.
