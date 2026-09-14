/**
 * DP2 — THE PACK. Seven designed sheets, not a white page with writing on it.
 *
 * WHAT THIS COMPONENT DOES NOT DO, each a rule rather than an omission:
 *  • It computes nothing about the deal. Every figure arrives already built by
 *    `packNumbers()` in @gil-bricks/core, which refuses one with no basis.
 *  • It holds no copy. Every word comes from src/config/pack.ts.
 *  • It never renders the Deal Score, the verdict, the binding constraint or a
 *    lever. They are not in the model, so it could not print one if it tried.
 *  • It never puts a portal image in the document. The only pictures are the
 *    user's own photographs, chosen in this browser, and their own traced plan.
 *
 * THE DESIGN LIVES HERE. The user reorders sections and toggles them; they do
 * not touch type, grid or layout, so there is no arrangement of their choices
 * that comes out looking amateur. That is the whole trade, and it is why the
 * templates get the attention rather than an editing canvas.
 */
import type { EvidencedFigure } from '@gil-bricks/core';
import { PACK_COPY, PACK_DISCLAIMER, PACK_DISCLAIMER_FULL, SECTION } from '../../config/pack';
import { Waterfall, GrowthBand, Runway, ScopeBars, type WaterfallStep, type GrowthPoint, type RunwayPhase, type ScopeItem } from './charts/Charts';

export interface PackBranding {
  businessName: string;
  accentColour: string;
  /** Black or white, whichever is readable on the accent. Computed, never guessed. */
  onAccent: string;
  logoDataUri: string;
  /** Duotone unifies a set of mismatched phone photographs into one branded set. */
  duotone: boolean;
}

export interface PackCompliance {
  businessName: string; redressScheme: string; redressNumber: string;
  hmrcAml: string; ico: string; piInsurer: string; piExpiry: string;
}

export interface AreaHighlight { label: string; value: string; sourceName: string; sourceAsOf: string }

export interface CompRow { address: string; value: number; display: string; note: string; subject: boolean }

export interface PackFloorPlan {
  levels: { name: string; totalSqm: string; rooms: { name: string; area: string; points: { x: number; y: number }[] }[] }[];
  total: string;
}

export interface PackModel {
  address: string;
  strategy: string;
  investorName: string;
  summary: string;
  preparedOn: string;
  branding: PackBranding;
  compliance: PackCompliance;
  /** The one enormous number the returns page is built around. */
  hero: EvidencedFigure | null;
  strip: EvidencedFigure[];
  costs: EvidencedFigure[];
  returns: EvidencedFigure[];
  waterfall: WaterfallStep[];
  /** Whether those steps genuinely add up. Decided by the engine, not the page. */
  waterfallStacks: boolean;
  scope: ScopeItem[];
  runway: { phases: RunwayPhase[]; total: string; basis: string } | null;
  floorPlan: PackFloorPlan | null;
  area: AreaHighlight[];
  growth: { history: GrowthPoint[]; band: { low: number; high: number; years: number } | null; headline: string; note: string } | null;
  comps: CompRow[];
  /** A print-resolution PNG of our own map, captured in this browser. */
  mapImage: string | null;
  photos: string[];
  /** The user's chosen order for the movable sections. */
  order: readonly string[];
  on: readonly string[];
}

const has = (m: PackModel, key: string): boolean => m.on.includes(key);

/**
 * The comparable rows that fit, with the subject always among them.
 *
 * THE SUBJECT IS NEVER CUT. On a cheap purchase it sorted below eight dearer
 * sales and the cap dropped it, so the page compared eight homes to nothing.
 */
function compRows(m: PackModel): CompRow[] {
  const room = m.mapImage === null ? 8 : 6;
  const head = m.comps.slice(0, room);
  if (head.some((c) => c.subject) || !m.comps.some((c) => c.subject)) return head;
  return [...m.comps.slice(0, room - 1), ...m.comps.filter((c) => c.subject)];
}
const missing = (v: string) => (v.trim() === ''
  ? <span class="pk-missing">{PACK_COPY.basis.compliance.missing}</span>
  : v);

/** The tag every forward-looking figure wears. Not decoration. */
function Est({ on }: { on: boolean }) {
  return on ? <span class="pk-est">{PACK_COPY.basis.estimateTag}</span> : null;
}

/** The locked furniture, at the foot of every sheet. Never optional. */
function Foot({ n, total }: { n: number; total: number }) {
  return (
    <div class="pk-foot">
      <p class="pk-foot-disclaimer">{PACK_DISCLAIMER}</p>
      <p class="pk-foot-page">{PACK_COPY.madeWith} · {PACK_COPY.pageOf(n, total)}</p>
    </div>
  );
}

/** A page opener: an oversized numeral in their colour, then the title. */
function Opener({ n, eyebrow, title }: { n: number; eyebrow: string; title: string }) {
  return (
    <header>
      <p class="pk-eyebrow">{eyebrow}</p>
      <div class="pk-opener">
        <span class="pk-opener-num">{String(n).padStart(2, '0')}</span>
        <h2 class="pk-title">{title}</h2>
      </div>
      <hr class="pk-rule" />
    </header>
  );
}

/**
 * THE DUOTONE FILTER.
 *
 * Two colours — their accent for the highlights, a deep neutral for the
 * shadows — mapped onto a desaturated photograph. Computed live in the browser,
 * so changing the accent re-themes every picture with nothing re-exported.
 * Declared once per document and referenced by every image that wants it.
 */
function DuotoneDef({ accent }: { accent: string }) {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(accent)?.[1] ?? '8a1f4b';
  const ch = (i: number): number => parseInt(hex.slice(i, i + 2), 16) / 255;
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">
      <filter id="pk-duotone" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="
          .34 .5 .16 0 0
          .34 .5 .16 0 0
          .34 .5 .16 0 0
          0 0 0 1 0" />
        <feComponentTransfer>
          <feFuncR type="table" tableValues={`0.05 ${ch(0).toFixed(3)}`} />
          <feFuncG type="table" tableValues={`0.07 ${ch(2).toFixed(3)}`} />
          <feFuncB type="table" tableValues={`0.13 ${ch(4).toFixed(3)}`} />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

/** One storey of their traced plan. Coordinates in, an architectural drawing out. */
function Level({ level }: { level: PackFloorPlan['levels'][number] }) {
  const xs = level.rooms.flatMap((r) => r.points.map((p) => p.x));
  const ys = level.rooms.flatMap((r) => r.points.map((p) => p.y));
  if (xs.length === 0 || ys.length === 0) return null;
  const minX = Math.min(...xs); const minY = Math.min(...ys);
  const w = Math.max(Math.max(...xs) - minX, 1); const h = Math.max(Math.max(...ys) - minY, 1);
  const mid = (ns: number[]): number => ns.reduce((a, n) => a + n, 0) / ns.length;
  return (
    <div class="pk-plan">
      <p class="pk-plan-name">{level.name} · {level.totalSqm}</p>
      <svg class="pk-plan-svg" viewBox={`${minX - 10} ${minY - 10} ${w + 20} ${h + 20}`} role="img" aria-label={level.name}>
        {level.rooms.map((room) => (
          <g key={room.name}>
            <polygon class="pk-plan-room" points={room.points.map((p) => `${p.x},${p.y}`).join(' ')} />
            <text class="pk-plan-label" x={mid(room.points.map((p) => p.x))} y={mid(room.points.map((p) => p.y))} text-anchor="middle">
              {room.name} · {room.area}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function PackDocument({ model }: { model: PackModel }) {
  const m = model;
  const accent = /^#[0-9a-fA-F]{6}$/.test(m.branding.accentColour) ? m.branding.accentColour : undefined;
  const shot = (src: string) => (m.branding.duotone ? 'pk-shot pk-duo' : 'pk-shot');

  /* ---- 1. THE COVER: a full-bleed photograph, their logo, the address, one
        figure. The one page that has to make somebody keep reading. ---- */
  const cover = (n: number, total: number) => (
    <section class="pk-page pk-cover is-bleed" key="cover">
      {has(m, SECTION.photos) && m.photos[0]
        ? (
          <>
            <div class="pk-cover-shot"><img src={m.photos[0]} alt="" class={m.branding.duotone ? 'pk-duo' : undefined} /></div>
            <div class="pk-cover-scrim" />
          </>
        )
        : <div class="pk-cover-plain" />}
      <div class="pk-cover-inner">
        <div>
          {m.branding.logoDataUri !== ''
            ? <img class="pk-cover-logo" src={m.branding.logoDataUri} alt="" />
            : <span class="pk-cover-logo-text">{m.branding.businessName || m.compliance.businessName}</span>}
        </div>
        <div>
          <p class="pk-eyebrow">{PACK_COPY.cover.eyebrow}</p>
          <h1 class="pk-cover-address">{m.address}</h1>
          <p class="pk-cover-strategy">{PACK_COPY.glance.strategyNames[m.strategy] ?? m.strategy}</p>
          {m.hero && (
            <div class="pk-cover-hero">
              <span class="pk-cover-hero-fig">{m.hero.value}</span>
              <span class="pk-cover-hero-lab">{m.hero.label}<Est on={m.hero.projected} /></span>
            </div>
          )}
        </div>
        <dl class="pk-cover-meta">
          {m.investorName.trim() !== '' && (
            <div><dt>{PACK_COPY.cover.forInvestor}</dt><dd>{m.investorName}</dd></div>
          )}
          <div>
            <dt>{PACK_COPY.cover.preparedBy}</dt>
            <dd>{missing(m.branding.businessName || m.compliance.businessName)}</dd>
          </div>
          <div><dt>{PACK_COPY.cover.preparedOn}</dt><dd>{m.preparedOn}</dd></div>
        </dl>
        <Foot n={n} total={total} />
      </div>
    </section>
  );

  /* ---- 2. THE RETURN: one enormous number, on an ink band. ---- */
  const hero = m.hero;
  const returnsPage = hero === null ? null : (n: number, total: number) => (
    <section class="pk-page is-ink" key="returns">
      <div class="pk-page-body">
        <Opener n={1} eyebrow={PACK_COPY.returns.eyebrow} title={PACK_COPY.returns.heading} />
        <div class="pk-hero">
          <p class="pk-hero-fig">{hero.value}</p>
          <p class="pk-hero-lab">{hero.label}<Est on={hero.projected} /></p>
          <p class="pk-hero-basis">{hero.basis}</p>
          {m.strip.length > 0 && (
            <div class="pk-strip">
              {m.strip.slice(0, 4).map((f) => (
                <div class="pk-strip-item" key={f.label}>
                  <p class="pk-strip-fig">{f.value}</p>
                  <p class="pk-strip-lab">{f.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        {has(m, SECTION.summary) && m.summary.trim() !== '' && <p class="pk-lede">{m.summary}</p>}
      </div>
      <Foot n={n} total={total} />
    </section>
  );

  /* ---- 3. WHAT IT COSTS TO GET IN: a waterfall, not a table. ---- */
  const numbersPage = (n: number, total: number) => (
    <section class="pk-page" key="numbers">
      <div class="pk-page-body">
        <Opener n={2} eyebrow={PACK_COPY.numbers.eyebrow} title={PACK_COPY.numbers.heading} />
        <div class="pk-fig">
          <p class="pk-chart-head">
            {m.waterfallStacks
              ? PACK_COPY.numbers.chartHead(m.waterfall[m.waterfall.length - 1]?.display ?? '')
              : PACK_COPY.numbers.chartHeadFinanced(m.waterfall[m.waterfall.length - 1]?.display ?? '')}
          </p>
          <Waterfall steps={m.waterfall} stacks={m.waterfallStacks} />
          <p class="pk-chart-note">{m.waterfallStacks ? PACK_COPY.numbers.chartNote : PACK_COPY.numbers.chartNoteFinanced}</p>
        </div>
        {m.returns.length > 0 && (
          <div class="pk-strip">
            {m.returns.slice(0, 4).map((f) => (
              <div class="pk-strip-item" key={f.label}>
                <p class="pk-strip-fig">{f.value}</p>
                <p class="pk-strip-lab">{f.label}</p>
                <p class="pk-strip-note">{f.projected ? PACK_COPY.basis.estimateTag : PACK_COPY.basis.factTag}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <Foot n={n} total={total} />
    </section>
  );

  /* ---- 4. THE WORK, AND HOW LONG THE MONEY IS TIED UP. ---- */
  const planPage = (n: number, total: number) => (
    <section class="pk-page" key="plan">
      <div class="pk-page-body">
        <Opener n={3} eyebrow={PACK_COPY.property.eyebrow} title={PACK_COPY.property.heading} />
        {has(m, SECTION.scope) && m.scope.length > 0 && (
          <div class="pk-fig">
            <p class="pk-chart-head">{PACK_COPY.property.scopeHead(String(m.scope.length))}</p>
            <ScopeBars items={m.scope} height={Math.max(120, m.scope.length * 26)} />
          </div>
        )}
        {has(m, SECTION.duration) && m.runway && (
          <div class="pk-fig">
            <p class="pk-chart-head">{PACK_COPY.property.runwayHead(m.runway.total)}</p>
            <Runway phases={m.runway.phases} />
            <p class="pk-chart-note">{m.runway.basis} {PACK_COPY.property.runwayNote}</p>
          </div>
        )}
        {has(m, SECTION.floorplan) && m.floorPlan && (
          <div class="pk-fig">
            <p class="pk-chart-head">{PACK_COPY.property.planHead(m.floorPlan.total)}</p>
            {m.floorPlan.levels.map((l) => <Level level={l} key={l.name} />)}
            <p class="pk-chart-note">{PACK_COPY.property.floorPlanMine}</p>
          </div>
        )}
        {m.scope.length === 0 && !m.runway && !m.floorPlan && <p class="pk-lede">{PACK_COPY.property.noScope}</p>}
      </div>
      <Foot n={n} total={total} />
    </section>
  );

  /* ---- 5. THE AREA: public data, each line with its source. ---- */
  const areaPage = (n: number, total: number) => (
    <section class="pk-page" key="area">
      <div class="pk-page-body">
        <Opener n={4} eyebrow={PACK_COPY.area.eyebrow} title={PACK_COPY.area.heading} />
        {m.area.length > 0 && (
          <div class="pk-fig">
            <div class="pk-strip">
              {m.area.slice(0, 4).map((a) => (
                <div class="pk-strip-item" key={a.label}>
                  <p class="pk-strip-fig">{a.value}</p>
                  <p class="pk-strip-lab">{a.label}</p>
                  <p class="pk-strip-note">{PACK_COPY.area.source(a.sourceName, a.sourceAsOf)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {m.growth && (
          <div class="pk-fig">
            <p class="pk-chart-head">{m.growth.headline}</p>
            <GrowthBand history={m.growth.history} band={m.growth.band}
              labels={{
                alt: PACK_COPY.growth.alt(String(m.growth.history.length - 1)),
                now: PACK_COPY.growth.now,
                start: PACK_COPY.growth.start(String(m.growth.history.length - 1)),
              }} />
            <p class="pk-chart-note">{m.growth.note}</p>
          </div>
        )}
        {m.area.length === 0 && m.growth === null && <p class="pk-lede">{PACK_COPY.area.none}</p>}
      </div>
      <Foot n={n} total={total} />
    </section>
  );

  /* ---- 5b. WHAT SELLS NEARBY. Its own sheet: the area page carried three
        ideas and the third one printed over the footer. ---- */
  const compsPage = m.comps.length === 0 ? null : (n: number, total: number) => (
    <section class="pk-page" key="comps">
      <div class="pk-page-body">
        <Opener n={5} eyebrow={PACK_COPY.comps.eyebrow} title={PACK_COPY.comps.heading} />
          <div class="pk-fig">
            <p class="pk-chart-head">{PACK_COPY.comps.head(String(m.comps.filter((c) => !c.subject).length))}</p>
            {m.mapImage !== null && (
              <div class="pk-map-wrap">
                <img class="pk-map" src={m.mapImage} alt={PACK_COPY.comps.mapAlt} />
                <p class="pk-chart-note">{PACK_COPY.comps.odbl}</p>
              </div>
            )}
            <ul class="pk-comps">
              {/* THE SUBJECT IS NEVER CUT. It sorted to the bottom on a cheap
                  purchase and the slice dropped it, so the page compared eight
                  homes to nothing. Its row is kept and the list trimmed around it. */}
              {/* Fewer rows when the map is there: the sheet holds one or the
                  other comfortably, and the list ran into the footer when it
                  tried to hold both. */}
              {compRows(m).map((c) => (
                <li class={c.subject ? 'is-subject' : undefined} key={`${c.address}-${c.display}`}>
                  <span class="pk-comp-addr">{c.address}</span>
                  <span>{c.note !== '' && <span class="pk-pill">{c.note}</span>}</span>
                  <span class="pk-comp-val">{c.display}</span>
                </li>
              ))}
            </ul>
          </div>
      </div>
      <Foot n={n} total={total} />
    </section>
  );

  /* ---- 6. THEIR PHOTOGRAPHS, full-bleed and disciplined. ---- */
  const photosPage = !(has(m, SECTION.photos) && m.photos.length > 1) ? null : (n: number, total: number) => (
    <section class="pk-page is-bleed" key="photos">
      <div class="pk-shots-full">
        <div class="pk-shots" style="height:100%">
          {m.photos.slice(1, 5).map((src, i) => (
            <img class={`${shot(src)}${i === 0 && m.photos.length === 2 ? ' pk-shot-lead' : ''}`} src={src} alt="" key={src} />
          ))}
        </div>
      </div>
      <Foot n={n} total={total} />
    </section>
  );

  /* ---- 7. BASIS, TERMS AND WHO PREPARED IT. Locked, quiet, never illegible. -- */
  const basisPage = (n: number, total: number) => (
    <section class="pk-page" key="basis">
      <div class="pk-page-body">
        <Opener n={5} eyebrow={PACK_COPY.basis.eyebrow} title={PACK_COPY.basis.heading} />
        <dl class="pk-basis-list">
          {[m.hero, ...m.strip, ...m.costs, ...m.returns]
            .filter((f): f is EvidencedFigure => f !== null)
            .filter((f, i, all) => all.findIndex((x) => x.label === f.label) === i)
            .map((f) => (
              <div key={f.label}>
                <dt>{f.label} — {f.value}</dt>
                <dd>{f.basis}</dd>
              </div>
            ))}
          {m.runway && (
            <div><dt>{PACK_COPY.numbers.refurbDuration} — {m.runway.total}</dt><dd>{m.runway.basis}</dd></div>
          )}
        </dl>

        <div class="pk-compliance">
          <p class="pk-eyebrow">{PACK_COPY.basis.compliance.heading}</p>
          <dl class="pk-compliance-grid">
            <div><dt>{PACK_COPY.basis.compliance.businessName}</dt><dd>{missing(m.compliance.businessName)}</dd></div>
            <div><dt>{PACK_COPY.basis.compliance.redress}</dt><dd>{missing(m.compliance.redressScheme)}</dd></div>
            <div><dt>{PACK_COPY.basis.compliance.redressNumber}</dt><dd>{missing(m.compliance.redressNumber)}</dd></div>
            <div><dt>{PACK_COPY.basis.compliance.hmrc}</dt><dd>{missing(m.compliance.hmrcAml)}</dd></div>
            <div><dt>{PACK_COPY.basis.compliance.ico}</dt><dd>{missing(m.compliance.ico)}</dd></div>
            <div>
              <dt>{PACK_COPY.basis.compliance.pi}</dt>
              <dd>{missing(m.compliance.piInsurer)}{m.compliance.piExpiry.trim() !== '' && ` · ${m.compliance.piExpiry}`}</dd>
            </div>
          </dl>
        </div>

        <p class="pk-eyebrow">{PACK_COPY.basis.disclaimerHeading}</p>
        <div class="pk-terms">{PACK_DISCLAIMER_FULL.map((p) => <p key={p}>{p}</p>)}</div>
      </div>
      <Foot n={n} total={total} />
    </section>
  );

  /**
   * THE MOVABLE PAGES, IN THE USER'S ORDER. The cover is pinned first and the
   * basis page pinned last, because a pack that opens on its disclaimer or ends
   * on a photograph is not a pack. Everything between them is theirs to arrange.
   */
  type Sheet = (n: number, total: number) => preact.JSX.Element;
  const movable: Record<string, Sheet | null> = {
    [SECTION.returns]: returnsPage,
    [SECTION.purchase]: numbersPage,
    [SECTION.plan]: planPage,
    [SECTION.area]: areaPage,
    [SECTION.comps]: compsPage,
    [SECTION.gallery]: photosPage,
  };
  const middle = m.order
    .filter((k) => has(m, k))
    .map((k) => movable[k])
    .filter((p): p is Sheet => p !== null && p !== undefined);

  const sheets: Sheet[] = [cover, ...middle, basisPage];
  const total = sheets.length;

  return (
    <div class="pk pk-pages" style={accent ? { '--pk-accent': accent, '--pk-on-accent': m.branding.onAccent } as unknown as string : undefined}>
      <DuotoneDef accent={accent ?? '#8a1f4b'} />
      {/* The footer is rendered INTO each sheet rather than through an @page
          margin box. A margin box is invisible until the print dialog opens,
          and a preview that hides the locked disclaimer is a preview that lies
          about the document — on a screen whose whole job is to show the user
          what they are about to send somebody. */}
      {sheets.map((sheet, i) => sheet(i + 1, total))}
    </div>
  );
}
