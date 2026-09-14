/**
 * DP1 — THE PACK ITSELF. Six A4 sheets, one idea a page.
 *
 * WHAT THIS COMPONENT DOES NOT DO, and each is a rule rather than an omission:
 *
 *  • It computes nothing. Every figure arrives already built by
 *    `packNumbers()` in @gil-bricks/core, which refuses one with no basis. This
 *    file formats and lays out.
 *  • It holds no copy. Every word comes from src/config/pack.ts.
 *  • It never renders the Deal Score, the verdict, the binding constraint or a
 *    lever. Those are not passed in — the model has no field for them — so it
 *    could not print one if it tried.
 *  • It never puts a portal image in the document. The only images are the
 *    user's own photographs, chosen in this browser, and their own traced floor
 *    plan. No <img> here has a remote src.
 *
 * THE LOCKED PARTS render whatever the selection says, because `withLocked()`
 * has already put them back. The tick boxes disable themselves too, but a
 * disabled box is a suggestion and this is the rule.
 */
import type { EvidencedFigure } from '@gil-bricks/core';
import { PACK_COPY, PACK_DISCLAIMER, PACK_DISCLAIMER_FULL } from '../../config/pack';

export interface PackBranding {
  businessName: string;
  accentColour: string;
  logoDataUri: string;
}

export interface PackCompliance {
  businessName: string;
  redressScheme: string;
  redressNumber: string;
  hmrcAml: string;
  ico: string;
  piInsurer: string;
  piExpiry: string;
}

export interface AreaHighlight {
  label: string;
  value: string;
  /** Named, always. A figure with no source does not go in. */
  sourceName: string;
  sourceAsOf: string;
}

export interface PackModel {
  title: string;
  strategy: string;
  investorName: string;
  summary: string;
  preparedOn: string;
  branding: PackBranding;
  compliance: PackCompliance;
  headline: EvidencedFigure[];
  costs: EvidencedFigure[];
  returns: EvidencedFigure[];
  scope: string[];
  duration: { parts: { name: string; weeks: string }[]; total: string; basis: string } | null;
  /** Object URLs for photographs the user chose in THIS browser. Never remote. */
  photos: string[];
  floorPlanSvg: string | null;
  area: AreaHighlight[];
  /** Section keys that are switched on. Locked ones are always present. */
  on: readonly string[];
}

/**
 * The section keys, named once. They are structural identifiers rather than
 * copy, but a bare string inside a JSX expression is counted by the inline-copy
 * ratchet — and naming them reads better anyway.
 */
const S = {
  photos: 'photos', summary: 'summary', purchase: 'purchase', returns: 'returns',
  scope: 'scope', duration: 'duration', floorplan: 'floorplan',
} as const;

const has = (m: PackModel, key: string): boolean => m.on.includes(key);

/** The disclaimer and our line, at the foot of every sheet. Never optional. */
function Foot({ page, total }: { page: number; total: number }) {
  return (
    <div class="pk-foot">
      <p class="pk-foot-disclaimer">{PACK_DISCLAIMER}</p>
      <p class="pk-foot-made">{PACK_COPY.madeWith} · {PACK_COPY.pageOf(page, total)}</p>
    </div>
  );
}

function Figure({ f, big }: { f: EvidencedFigure; big?: boolean }) {
  return (
    <li class="pk-figure">
      <p class="pk-figure-label">{f.label}</p>
      <p class="pk-figure-value">
        {f.value}
        {f.projected && <span class="pk-estimate">{PACK_COPY.basis.estimateTag}</span>}
      </p>
      {!big && <p class="pk-figure-basis">{f.basis}</p>}
    </li>
  );
}

export function PackDocument({ model }: { model: PackModel }) {
  const m = model;
  const accent = /^#[0-9a-fA-F]{6}$/.test(m.branding.accentColour) ? m.branding.accentColour : undefined;
  const pages: preact.JSX.Element[] = [];
  const total = 6;
  const missing = (v: string) => (v.trim() === ''
    ? <span class="pk-missing">{PACK_COPY.basis.compliance.missing}</span>
    : v);

  // ---- 1. COVER -------------------------------------------------------
  pages.push(
    <section class="pk-page pk-cover" key="cover">
      <div>
        {m.branding.logoDataUri !== '' && <img class="pk-logo" src={m.branding.logoDataUri} alt="" />}
      </div>
      <div class="pk-page-body">
        <h1 class="pk-cover-title">{m.title}</h1>
        <hr class="pk-rule" />
        <p class="pk-cover-sub">{PACK_COPY.glance.strategyNames[m.strategy] ?? m.strategy}</p>
        {has(m, S.photos) && m.photos.length > 0 && (
          <div class="pk-photos">
            {m.photos.slice(0, 3).map((src, i) => (
              <img class={`pk-photo${i === 0 ? ' pk-photo-lead' : ''}`} src={src} alt="" key={src} />
            ))}
          </div>
        )}
      </div>
      <dl class="pk-cover-meta">
        {m.investorName.trim() !== '' && (
          <>
            <dt>{PACK_COPY.cover.forInvestor}</dt>
            <dd>{m.investorName}</dd>
          </>
        )}
        <dt>{PACK_COPY.cover.preparedBy}</dt>
        <dd>{missing(m.branding.businessName || m.compliance.businessName)}</dd>
        <dd>{PACK_COPY.cover.on(m.preparedOn)}</dd>
      </dl>
      <Foot page={1} total={total} />
    </section>,
  );

  // ---- 2. AT A GLANCE -------------------------------------------------
  pages.push(
    <section class="pk-page" key="glance">
      <div class="pk-page-body">
        <h2 class="pk-h2">{PACK_COPY.glance.heading}</h2>
        <hr class="pk-rule" />
        <ul class="pk-figures pk-headline">
          {m.headline.map((f) => <Figure f={f} big key={f.label} />)}
        </ul>
        {has(m, S.summary) && m.summary.trim() !== '' && <p class="pk-lede">{m.summary}</p>}
      </div>
      <Foot page={2} total={total} />
    </section>,
  );

  // ---- 3. THE NUMBERS -------------------------------------------------
  pages.push(
    <section class="pk-page" key="numbers">
      <div class="pk-page-body">
        <h2 class="pk-h2">{PACK_COPY.numbers.heading}</h2>
        <hr class="pk-rule" />
        {has(m, S.purchase) && <ul class="pk-figures">{m.costs.map((f) => <Figure f={f} key={f.label} />)}</ul>}
        {has(m, S.returns) && m.returns.length > 0 && (
          <>
            <h3 class="pk-h3">{PACK_COPY.numbers.roi}</h3>
            <ul class="pk-figures">{m.returns.map((f) => <Figure f={f} key={f.label} />)}</ul>
          </>
        )}
      </div>
      <Foot page={3} total={total} />
    </section>,
  );

  // ---- 4. THE PROPERTY AND THE PLAN -----------------------------------
  pages.push(
    <section class="pk-page" key="property">
      <div class="pk-page-body">
        <h2 class="pk-h2">{PACK_COPY.property.heading}</h2>
        <hr class="pk-rule" />
        {has(m, S.scope) && (
          <>
            <h3 class="pk-h3">{PACK_COPY.property.scopeHeading}</h3>
            {m.scope.length === 0
              ? <p class="pk-source">{PACK_COPY.property.noScope}</p>
              : <ul class="pk-list">{m.scope.map((s) => <li key={s}>{s}</li>)}</ul>}
          </>
        )}
        {has(m, S.duration) && m.duration !== null && (
          <>
            <h3 class="pk-h3">
              {PACK_COPY.numbers.refurb}
              <span class="pk-estimate">{PACK_COPY.basis.estimateTag}</span>
            </h3>
            <div class="pk-runway">
              {m.duration.parts.map((p) => (
                <div class="pk-runway-part" key={p.name}>
                  <p class="pk-runway-name">{p.name}</p>
                  <p class="pk-runway-weeks">{p.weeks}</p>
                </div>
              ))}
            </div>
            <p class="pk-figure-value">{m.duration.total}</p>
            <p class="pk-figure-basis">{m.duration.basis}</p>
          </>
        )}
        {has(m, S.floorplan) && (
          <>
            <h3 class="pk-h3">{PACK_COPY.property.floorPlanHeading}</h3>
            {m.floorPlanSvg === null
              ? <p class="pk-source">{PACK_COPY.property.noFloorPlan}</p>
              : (
                <>
                  {/* Their own traced plan — geometry we hold, drawn here as SVG.
                      Never the agent's floor plan image. */}
                  <div dangerouslySetInnerHTML={{ __html: m.floorPlanSvg }} />
                  <p class="pk-source">{PACK_COPY.property.floorPlanMine}</p>
                </>
              )}
          </>
        )}
      </div>
      <Foot page={4} total={total} />
    </section>,
  );

  // ---- 5. THE AREA ----------------------------------------------------
  pages.push(
    <section class="pk-page" key="area">
      <div class="pk-page-body">
        <h2 class="pk-h2">{PACK_COPY.area.heading}</h2>
        <hr class="pk-rule" />
        <p class="pk-lede">{PACK_COPY.area.intro}</p>
        {m.area.length === 0
          ? <p class="pk-source">{PACK_COPY.area.none}</p>
          : (
            <ul class="pk-list">
              {m.area.map((a) => (
                <li key={a.label}>
                  <div class="pk-row">
                    <span>{a.label}</span>
                    <span class="pk-row-value">{a.value}</span>
                  </div>
                  {/* No line goes in without its source and its date. */}
                  <p class="pk-source">{PACK_COPY.area.source(a.sourceName, a.sourceAsOf)}</p>
                </li>
              ))}
            </ul>
          )}
      </div>
      <Foot page={5} total={total} />
    </section>,
  );

  // ---- 6. BASIS, TERMS AND DISCLAIMERS — every part of this is locked ---
  pages.push(
    <section class="pk-page" key="basis">
      <div class="pk-page-body">
        <h2 class="pk-h2">{PACK_COPY.basis.heading}</h2>
        <hr class="pk-rule" />
        <p class="pk-lede">{PACK_COPY.basis.intro}</p>
        <dl class="pk-basis-list">
          {[...m.headline, ...m.costs, ...m.returns]
            .filter((f, i, all) => all.findIndex((x) => x.label === f.label) === i)
            .map((f) => (
              <div key={f.label}>
                <dt>{f.label} — {f.value}</dt>
                <dd>{f.basis}</dd>
              </div>
            ))}
          {m.duration !== null && (
            <div>
              <dt>{PACK_COPY.property.heading} — {m.duration.total}</dt>
              <dd>{m.duration.basis}</dd>
            </div>
          )}
        </dl>

        <h3 class="pk-h3">{PACK_COPY.basis.compliance.heading}</h3>
        <dl class="pk-compliance">
          <dt>{PACK_COPY.basis.compliance.businessName}</dt>
          <dd>{missing(m.compliance.businessName)}</dd>
          <dt>{PACK_COPY.basis.compliance.redress}</dt>
          <dd>{missing(m.compliance.redressScheme)}</dd>
          <dt>{PACK_COPY.basis.compliance.redressNumber}</dt>
          <dd>{missing(m.compliance.redressNumber)}</dd>
          <dt>{PACK_COPY.basis.compliance.hmrc}</dt>
          <dd>{missing(m.compliance.hmrcAml)}</dd>
          <dt>{PACK_COPY.basis.compliance.ico}</dt>
          <dd>{missing(m.compliance.ico)}</dd>
          <dt>{PACK_COPY.basis.compliance.pi}</dt>
          <dd>{missing(m.compliance.piInsurer)}{m.compliance.piExpiry.trim() !== '' && ` · ${m.compliance.piExpiry}`}</dd>
        </dl>

        <h3 class="pk-h3">{PACK_COPY.basis.disclaimerHeading}</h3>
        <div class="pk-terms">
          {PACK_DISCLAIMER_FULL.map((p) => <p key={p}>{p}</p>)}
        </div>
      </div>
      <Foot page={6} total={total} />
    </section>,
  );

  return (
    <div class="pk pk-pages" style={accent ? { '--pk-accent': accent } as unknown as string : undefined}>
      {pages}
    </div>
  );
}
