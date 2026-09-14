import { cloneElement } from 'preact';
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
import { compBarWidths } from '@gil-bricks/core';
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
  /**
   * HOW MANY ROWS THE SHEET ACTUALLY HOLDS, not how many look about right.
   *
   * Six fitted when a row was one line of text. Giving every row a bar made the
   * rows taller and six then overran the footer by 17px — measured, and now
   * guarded: check-pack.mjs fails if any page's content crosses its own footer.
   * That is the same fault the area page had in DP2, found the same way.
   */
  const room = m.mapImage === null ? 8 : 5;
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

/**
 * Zoom is applied to the PAGE, never to a wrapper around it, so the controls
 * sitting beside a page are not scaled down with it. Cloning here rather than
 * threading a style through every page builder keeps the page functions
 * ignorant of the preview entirely.
 */
function withZoom(page: preact.JSX.Element, zoom: number): preact.JSX.Element {
  const prev = (page.props as { style?: Record<string, unknown> }).style ?? {};
  return cloneElement(page, { style: { ...prev, zoom } });
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

/**
 * DP4 — WHAT `chrome` IS, AND WHY IT IS A PROP RATHER THAN MARKUP IN HERE.
 *
 * The builder puts each page's own controls in the gutter BESIDE that page, so
 * a sourcer adjusts the thing they are looking at. Those controls are the
 * builder's, not the document's — the document is what an investor receives —
 * so this component never authors them. It leaves a slot, and the builder fills
 * it. Print, the export, the tests and the shared-link view pass nothing and
 * get exactly the document they got before.
 *
 * `zoom` moved from the wrapper to the PAGE for the same reason: a wrapper zoom
 * scales whatever is inside it, which at 390px means a 41% control. Zooming
 * each page leaves its sibling chrome at full size, with no counter-scaling to
 * get wrong. `zoom` rather than `transform: scale` is unchanged and deliberate —
 * it reflows, so the row's height is right and the page scrolls properly.
 */
export interface PackChrome {
  (key: string, index: number, total: number): preact.JSX.Element | null;
}

export function PackDocument(
  { model, chrome, zoom }: { model: PackModel; chrome?: PackChrome; zoom?: number },
) {
  const m = model;
  const accent = /^#[0-9a-fA-F]{6}$/.test(m.branding.accentColour) ? m.branding.accentColour : undefined;
  const shot = (src: string) => (m.branding.duotone ? 'pk-shot pk-duo' : 'pk-shot');

  /* ---- 1. THE COVER ---- */
  /**
   * A PHOTOGRAPH, NOT A WASH.
   *
   * The cover used to put the photograph full-bleed behind the whole sheet and
   * lay a scrim over it dark enough to guarantee white type anywhere on the
   * page. That works for a stock hero shot and destroys an ordinary one: the
   * operator added a photo of a house and got "a faint background image across
   * the whole A4". It was doing exactly what it was built to do, and what it
   * was built to do was wrong.
   *
   * The photograph now OWNS A REGION and is not dimmed at all. Type never
   * crosses it, so nothing has to be crushed to keep the type readable — the
   * words sit on a solid ink band below, which is also where the contrast
   * guarantee comes from. The one gradient left is a short fade at the join,
   * and that is a joint, not a scrim.
   */
  const hasCoverShot = has(m, SECTION.photos) && m.photos[0] !== undefined;
  /** The figures fill the band when there is no photograph to fill the sheet. */
  const coverStrip = hasCoverShot ? m.strip.slice(0, 3) : m.strip.slice(0, 3);

  const cover = (n: number, total: number) => (
    <section class={`pk-page pk-cover is-bleed${hasCoverShot ? ' has-shot' : ''}`} key="cover">
      {hasCoverShot
        ? (
          <div class="pk-cover-shot">
            <img src={m.photos[0]} alt="" class={m.branding.duotone ? 'pk-duo' : undefined} />
            <div class="pk-cover-join" />
          </div>
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
        {/**
          * WITHOUT A PHOTOGRAPH THE COVER USED TO BE A VOID.
          *
          * `justify-content: space-between` over three children leaves two big
          * gaps, which a full-bleed photograph fills. With no photograph — which
          * is EVERY pack on first load, because nobody has uploaded one yet —
          * the operator opened the builder and saw a near-black empty sheet.
          * That is what "it opens blank" meant: not that nothing was switched
          * on, but that the first and largest thing on screen had nothing in it.
          *
          * So when there is no cover shot the space carries the deal's own
          * headline figures instead. Nothing new is computed and nothing new is
          * asked for — these are the same strip figures the glance page prints,
          * which exist for every deal the moment it is saved.
          */}
        {coverStrip.length > 0 && (
          <ul class="pk-cover-strip">
            {coverStrip.map((f) => (
              <li key={f.label}>
                <span class="pk-cover-strip-fig">{f.value}</span>
                <span class="pk-cover-strip-lab">{f.label}<Est on={f.projected} /></span>
              </li>
            ))}
          </ul>
        )}
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
        <Opener n={contentNo(n)} eyebrow={PACK_COPY.returns.eyebrow} title={PACK_COPY.returns.heading} />
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
  /**
   * NOTHING RENDERS AS AN EMPTY PAGE.
   *
   * Three of these sheets had no guard at all, and the plan page had something
   * worse than none: when a deal had no ticked scope, no runway and no floor
   * plan it printed a line of apology in the middle of an otherwise blank A4.
   * A page that says "there is nothing here" is still a page somebody has to
   * turn, and in a document being sent to an investor it reads as an oversight.
   * If a section has no content it is not in the document.
   */
  const numbersHasContent = m.waterfall.length > 0 || m.costs.length > 0 || m.returns.length > 0;
  const planHasContent =
    (has(m, SECTION.scope) && m.scope.length > 0)
    || (has(m, SECTION.duration) && m.runway !== null)
    || (has(m, SECTION.floorplan) && m.floorPlan !== null);
  const areaHasContent = m.area.length > 0 || m.growth !== null;

  const numbersPage = !numbersHasContent ? null : (n: number, total: number) => (
    <section class="pk-page" key="numbers">
      <div class="pk-page-body">
        <Opener n={contentNo(n)} eyebrow={PACK_COPY.numbers.eyebrow} title={PACK_COPY.numbers.heading} />
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
  const planPage = !planHasContent ? null : (n: number, total: number) => (
    <section class="pk-page" key="plan">
      <div class="pk-page-body">
        <Opener n={contentNo(n)} eyebrow={PACK_COPY.property.eyebrow} title={PACK_COPY.property.heading} />
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
      </div>
      <Foot n={n} total={total} />
    </section>
  );

  /* ---- 5. THE AREA: public data, each line with its source. ---- */
  const areaPage = !areaHasContent ? null : (n: number, total: number) => (
    <section class="pk-page" key="area">
      <div class="pk-page-body">
        <Opener n={contentNo(n)} eyebrow={PACK_COPY.area.eyebrow} title={PACK_COPY.area.heading} />
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
        <Opener n={contentNo(n)} eyebrow={PACK_COPY.comps.eyebrow} title={PACK_COPY.comps.heading} />
          <div class="pk-fig">
            <p class="pk-chart-head">{PACK_COPY.comps.head(String(m.comps.filter((c) => !c.subject).length))}</p>
            {m.mapImage !== null && (
              <div class="pk-map-wrap">
                <img class="pk-map" src={m.mapImage} alt={PACK_COPY.comps.mapAlt} />
                <p class="pk-chart-note">{PACK_COPY.comps.odbl}</p>
              </div>
            )}
            {/* THE SUBJECT IS NEVER CUT. It sorted to the bottom on a cheap
                purchase and the slice dropped it, so the page compared eight
                homes to nothing. Its row is kept and the list trimmed around it.
                Fewer rows when the map is there: the sheet holds one or the
                other comfortably, and the list ran into the footer when it
                tried to hold both. */}
            {/**
              * RANKED, AND DRAWN. This was three columns of text with the sold
              * price in a 20mm slot — readable, but you had to compare the
              * numbers yourself. Each row now carries a proportional bar, so the
              * ranking is visible before a single figure is read, and the
              * subject property is the one bar in the sourcer's own accent.
              *
              * THE WIDTHS COME FROM core. Nothing on this page divides a price.
              */}
            <ol class="pk-comps">
              {(() => {
                const rows = compRows(m);
                const widths = compBarWidths(rows.map((c) => c.value));
                return rows.map((c, i) => (
                  <li class={c.subject ? 'is-subject' : undefined} key={`${c.address}-${c.display}`}>
                    <span class="pk-comp-addr">{c.address}</span>
                    <span class="pk-comp-bar">
                      <span class="pk-comp-bar-fill" style={{ width: `${(widths[i] ?? 0) * 100}%` }} />
                    </span>
                    <span class="pk-comp-val">{c.display}</span>
                    {c.note !== '' && <span class="pk-comp-note"><span class="pk-pill">{c.note}</span></span>}
                  </li>
                ));
              })()}
            </ol>
          </div>
      </div>
      <Foot n={n} total={total} />
    </section>
  );

  /* ---- 6. THEIR PHOTOGRAPHS, full-bleed and disciplined. ---- */
  /**
   * THE GALLERY TAKES WHATEVER THE COVER DID NOT.
   *
   * It used to require `photos.length > 1` whether or not the cover was using
   * one, so a sourcer with a single photograph and "Photograph on the cover"
   * switched OFF had a photo in the pack that appeared nowhere, and two
   * checkboxes that both did nothing. Now the cover consumes the first shot
   * only when it is switched on, and every remaining photograph lands here.
   */
  const galleryShots = hasCoverShot ? m.photos.slice(1) : m.photos;
  const photosPage = galleryShots.length === 0 ? null : (n: number, total: number) => (
    <section class="pk-page is-bleed" key="photos">
      <div class="pk-shots-full">
        <div class="pk-shots" style="height:100%">
          {galleryShots.slice(0, 4).map((src, i) => (
            <img class={`${shot(src)}${i === 0 && galleryShots.length === 1 ? ' pk-shot-lead' : ''}`} src={src} alt="" key={src} />
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
        <Opener n={contentNo(n)} eyebrow={PACK_COPY.basis.eyebrow} title={PACK_COPY.basis.heading} />
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

  /* ---- 7. THE FINAL FIGURES: two columns, no chart, no argument. ---- */
  /**
   * THE PLAINEST PAGE IN THE PACK, AND DELIBERATELY SO.
   *
   * Every other money page here explains itself: the waterfall shows how the
   * cash stacks, the returns page argues one number at ninety-six point, the
   * basis page evidences all of them. None of that answers the question an
   * investor actually asks last, which is "what do I put in, and what do I get
   * back". This page answers exactly that and does nothing else — two columns,
   * a ruled total, and a line saying it is before tax.
   *
   * IT COMPUTES NOTHING. Both columns are figures already in the model, printed
   * in the order the engine produced them (charter rule 3: a component may
   * format a figure, never make one).
   */
  /** The parts, and the total that core appended after them. */
  const costTotal = m.costs.length > 1 ? m.costs[m.costs.length - 1] : undefined;
  const costParts = m.costs.length > 1 ? m.costs.slice(0, -1) : m.costs;
  const figuresHasContent = m.costs.length > 0 || m.returns.length > 0;
  const figuresPage = !figuresHasContent ? null : (n: number, total: number) => (
    <section class="pk-page" key="figures">
      <div class="pk-page-body">
        <Opener n={contentNo(n)} eyebrow={PACK_COPY.figures.eyebrow} title={PACK_COPY.figures.heading} />
        <div class="pk-ledger">
          <div class="pk-ledger-col">
            <p class="pk-eyebrow">{PACK_COPY.figures.inHead}</p>
            {/**
              * THE LAST COST IS THE TOTAL, AND MUST NOT BE PRINTED AS A ROW.
              *
              * `packNumbers` builds `costs` as the parts followed by the total,
              * so listing the array whole put "Total going in £78,890" at the
              * bottom of a column reading £120,000, £6,000, £35,000, £1,500 —
              * set in the same type as the parts, so it read as a column that
              * does not add up. That is the DP2 waterfall's lie in a different
              * shape, and on the plainest page in the pack it is worse: there is
              * no chart here to blame, just a list that looks wrong.
              *
              * The total is now the total, and when the parts genuinely do not
              * sum to it — a financed purchase, where most of the price is
              * borrowed — the page says why. `waterfallStacks` is core's own
              * `partsSumToTotal`; the page asks it, it does not decide.
              */}
            <dl class="pk-ledger-list">
              {costParts.map((f) => (
                <div class="pk-ledger-row" key={f.label}>
                  <dt>{f.label}<Est on={f.projected} /></dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
            {costTotal && (
              <div class="pk-ledger-total">
                <span>{costTotal.label}<Est on={costTotal.projected} /></span>
                <strong>{costTotal.value}</strong>
              </div>
            )}
            {costTotal && !m.waterfallStacks && (
              <p class="pk-ledger-note">{PACK_COPY.figures.financed}</p>
            )}
          </div>
          <div class="pk-ledger-col is-out">
            <p class="pk-eyebrow">{PACK_COPY.figures.outHead}</p>
            <dl class="pk-ledger-list">
              {m.returns.map((f) => (
                <div class="pk-ledger-row" key={f.label}>
                  <dt>{f.label}<Est on={f.projected} /></dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <p class="pk-chart-note">{PACK_COPY.figures.note}</p>
      </div>
      <Foot n={n} total={total} />
    </section>
  );

  /**
   * THE MOVABLE PAGES, IN THE USER'S ORDER. The cover is pinned first and the
   * basis page pinned last, because a pack that opens on its disclaimer or ends
   * on a photograph is not a pack. Everything between them is theirs to arrange.
   */
  /**
   * THE BIG NUMERAL COUNTS CONTENT PAGES, not the sheet's position.
   *
   * It was `n - 1`, which assumed the cover was always page one. Now that the
   * cover can be switched off, that produced a page numbered "00" — and with
   * the cover on and a page hidden it would have skipped a number. It counts
   * from whatever the first non-cover sheet turns out to be.
   */
  const coverOn = has(m, SECTION.cover);
  const contentNo = (n: number): number => (coverOn ? n - 1 : n);

  type Sheet = (n: number, total: number) => preact.JSX.Element;
  /** Every sheet travels with its key so the gutter knows which page it is on. */
  type Keyed = { key: string; render: Sheet };
  const movable: Record<string, Sheet | null> = {
    [SECTION.returns]: returnsPage,
    [SECTION.purchase]: numbersPage,
    [SECTION.plan]: planPage,
    [SECTION.area]: areaPage,
    [SECTION.comps]: compsPage,
    [SECTION.figures]: figuresPage,
    [SECTION.gallery]: photosPage,
  };
  const middle: Keyed[] = m.order
    .filter((k) => has(m, k))
    .map((k) => ({ key: k, render: movable[k] }))
    .filter((x): x is Keyed => x.render !== null && x.render !== undefined);

  /**
   * THE COVER HONOURS ITS OWN SWITCH. It did not: `sheets` listed `cover`
   * unconditionally, so the Cover checkbox was wired to nothing and unticking
   * it changed the document not at all — a control that lies about what it does.
   */
  const sheets: Keyed[] = [
    ...(has(m, SECTION.cover) ? [{ key: SECTION.cover, render: cover }] : []),
    ...middle,
    { key: SECTION.basis, render: basisPage },
  ];

  /**
   * SWITCHED-OFF PAGES STILL HAVE A ROW — IN THE BUILDER ONLY.
   *
   * Moving each page's controls beside its page had one consequence I did not
   * see until the toggle matrix ran: switching a page OFF removed the page, and
   * the page was carrying the only switch that could bring it back. Every
   * section could be turned off exactly once and never again.
   *
   * So the builder keeps a slim placeholder where a hidden page would be — not
   * an A4 sheet, a single line saying it is out — and the gutter stays beside
   * it. The DOCUMENT is unchanged: `sheets` above is what gets rendered, printed
   * and exported, and a hidden page is absent from all three. This is scaffolding
   * for the person building, and `chrome` is what distinguishes them.
   */
  /**
   * THE BUILDER'S ROW LIST: every page that COULD be in the pack, in order,
   * each marked present or hidden. The document itself is `sheets` above and
   * contains only what is switched on; this exists so a hidden page keeps the
   * control that brings it back.
   */
  /** What the DEAL has, regardless of what is switched on. */
  const couldRender: Record<string, boolean> = {
    [SECTION.returns]: returnsPage !== null,
    [SECTION.purchase]: numbersHasContent,
    [SECTION.plan]: m.scope.length > 0 || m.runway !== null || m.floorPlan !== null,
    [SECTION.area]: areaHasContent,
    [SECTION.comps]: m.comps.length > 0,
    [SECTION.figures]: figuresHasContent,
    [SECTION.gallery]: m.photos.length > 0,
  };

  type Row = { key: string; render: Sheet | null };
  const rows: Row[] = chrome === undefined
    ? sheets.map((x) => ({ key: x.key, render: x.render }))
    : [
      { key: SECTION.cover, render: has(m, SECTION.cover) ? cover : null },
      /**
       * A ROW IS OFFERED ONLY WHERE A PAGE COULD EXIST.
       *
       * `couldRender` asks the DATA, never the switches: a gallery with no
       * photographs and a plan page on a deal with no scope, no runway and no
       * floor plan can never produce a sheet, so neither gets a row and neither
       * gets a control. That is the dead-toggle class closed at the root — not
       * a control that is disabled, a control that is not written.
       */
      ...m.order
        .filter((k) => movable[k] !== undefined && couldRender[k] === true)
        .map((k) => ({ key: k, render: has(m, k) ? (movable[k] ?? null) : null })),
      { key: SECTION.basis, render: basisPage },
    ];
  const total = sheets.length;

  return (
    <div class="pk pk-pages" style={accent ? { '--pk-accent': accent, '--pk-on-accent': m.branding.onAccent } as unknown as string : undefined}>
      <DuotoneDef accent={accent ?? '#8a1f4b'} />
      {/* The footer is rendered INTO each sheet rather than through an @page
          margin box. A margin box is invisible until the print dialog opens,
          and a preview that hides the locked disclaimer is a preview that lies
          about the document — on a screen whose whole job is to show the user
          what they are about to send somebody. */}
      {rows.map((row, i) => {
        const gutter = chrome === undefined ? null : chrome(row.key, i, rows.length);
        if (row.render === null) {
          /* Hidden, or empty: a line in the builder, nothing in the document. */
          return (
            <div class="pk-sheet is-off" key={`sheet-${row.key}`}>
              {gutter}
              <div class="pk-ghost" data-chrome>{PACK_COPY.gutter.notInPack}</div>
            </div>
          );
        }
        const pageNo = sheets.findIndex((x) => x.key === row.key) + 1;
        const page = row.render(pageNo, total);
        /**
         * NO CHROME, NO WRAPPER. Print, the export and every test render the
         * document exactly as they did before this existed — the builder is the
         * only caller that passes `chrome`, and the only one that pays for it.
         */
        if (gutter === null) return zoom === undefined ? page : withZoom(page, zoom);
        return (
          <div class="pk-sheet" key={`sheet-${row.key}`}>
            {gutter}
            {zoom === undefined ? page : withZoom(page, zoom)}
          </div>
        );
      })}
    </div>
  );
}
