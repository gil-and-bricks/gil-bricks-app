/**
 * DP1 — THE PACK PAGE. Everything it needs, gathered once.
 *
 * FOUR DOORS, IN ORDER, AND EACH ONE IS A RULE:
 *
 *   signed out            →  the sign-in wall. A pack is about somebody's own
 *                            saved deal; there is nothing to show a stranger.
 *   no declaration        →  the one-off declaration, and nothing else exists
 *                            until it is done.
 *   no deal in the link   →  say so, and point at the board. A pack is only ever
 *                            made from a deal the user already has.
 *   otherwise             →  the builder.
 *
 * THE FIGURES ARE THE BOARD'S FIGURES. The deal's own saved parameters go
 * through `applyFacts` and then `packSourceFor`, which is the same chokepoint
 * the board re-scores through. If the two disagreed, an investor would be
 * reading numbers the sourcer had never seen.
 *
 * NOTHING OF THE PORTAL'S IS FETCHED HERE. No listing photograph, no floor-plan
 * image, no listing page. The floor plan is the geometry the user traced; the
 * photographs are the ones they choose in this tab; the area lines come from
 * our own published data files.
 */
import { useEffect, useState } from 'preact/hooks';
import { getOutcodePostcodes, refurbDuration, salesByPrice, sayWeeks, sectorOfPostcode } from '@gil-bricks/core';
import { loadMe, me, meUnknown, openLoginWall } from '../../lib/auth/session';
import { ACCOUNT } from '../../config/account';
import { COPY } from '../../config/copy';
import { PACK_COPY } from '../../config/pack';
import { REFURB_ITEMS } from '../../config/refurb';
import { DURATION_COPY, REFURB_DURATION } from '../../config/refurbDuration';
import { applyFacts, type DealFact } from '../../lib/deals/facts';
import { packFloorPlan } from '../../lib/pack/floorPlan';
import { packNumbersFor, packSourceFor, tickedKeys, tickedScope } from '../../lib/pack/fromDeal';
import { areaHighlights, loadAreaFacts, type HighlightSources } from '../../lib/pack/areaHighlights';
import { compsFrom, growthFrom, heroAndStrip, waterfallFrom, type GrowthModel } from '../../lib/pack/packData';
import { partsSumToTotal } from '@gil-bricks/core';
import { ownWeeksFrom } from '../analyser/RefurbSection';
import { PackComposer, type Branding } from './PackComposer';
import { PackDeclaration } from './PackDeclaration';
import { NEUTRAL_ACCENT } from './PackProfile';
import type { AreaHighlight, CompRow, PackCompliance, PackModel } from './PackDocument';

interface Deal {
  id: string;
  strategy: string;
  title: string;
  url_params: string;
}

interface ProfileRow {
  business_name: string;
  accent_colour: string;
  logo_data_uri: string;
}

interface DeclarationRow {
  hmrc_aml_ref: string;
  redress_scheme: string;
  redress_number: string;
  ico_registration: string;
  pi_insurer: string;
  pi_expiry: string;
}

type Base = Omit<PackModel, 'on' | 'order' | 'photos' | 'summary' | 'investorName' | 'branding'>;

const param = (k: string): string => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(k) ?? '';
};

const today = (): string => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const complianceOf = (d: DeclarationRow | null, businessName: string): PackCompliance => ({
  businessName,
  redressScheme: d?.redress_scheme ?? '',
  redressNumber: d?.redress_number ?? '',
  hmrcAml: d?.hmrc_aml_ref ?? '',
  ico: d?.ico_registration ?? '',
  piInsurer: d?.pi_insurer ?? '',
  piExpiry: d?.pi_expiry ?? '',
});

export function PackApp() {
  const [declared, setDeclared] = useState<boolean | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [declaration, setDeclaration] = useState<DeclarationRow | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [facts, setFacts] = useState<readonly DealFact[]>([]);
  const [floorPlanRaw, setFloorPlanRaw] = useState<string | null>(null);
  const [area, setArea] = useState<AreaHighlight[]>([]);
  const [comps, setComps] = useState<CompRow[]>([]);
  const [growth, setGrowth] = useState<GrowthModel | null>(null);
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [failed, setFailed] = useState('');
  const [ready, setReady] = useState(false);

  const dealId = param('deal');

  /**
   * Re-read after the declaration is completed.
   *
   * THE FIRST PACK USED TO HAVE NO REGISTRATIONS ON IT. The declaration was
   * saved, the screen moved on, and the compliance block printed "Registration
   * details not provided" — because this component had read the row once, when
   * there was nothing to read. Found by opening a real pack in a browser; no
   * amount of unit testing the pieces would have shown it.
   */
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    void loadMe().then(async (who) => {
      if (who === null || !live) return;

      const profileRes = await fetch('/api/pack/profile', { credentials: 'same-origin' }).catch(() => null);
      if (!live) return;
      if (profileRes === null || !profileRes.ok) { setFailed(PACK_COPY.errors.loadFailed); setReady(true); return; }
      const body = await profileRes.json() as { profile: ProfileRow | null; declaration: DeclarationRow | null };
      if (!live) return;
      setDeclared(body.declaration !== null);
      setDeclaration(body.declaration);
      setBranding({
        businessName: body.profile?.business_name ?? '',
        accentColour: body.profile?.accent_colour === '' || body.profile == null ? NEUTRAL_ACCENT : body.profile.accent_colour,
        logoDataUri: body.profile?.logo_data_uri ?? '',
        // Duotone is on by default: it is what turns a set of mismatched phone
        // photographs into something that looks like one branded set.
        duotone: true,
      });

      if (dealId === '') { setReady(true); return; }

      const dealsRes = await fetch('/api/deals', { credentials: 'same-origin' }).catch(() => null);
      if (!live) return;
      if (dealsRes === null || !dealsRes.ok) { setFailed(PACK_COPY.errors.loadFailed); setReady(true); return; }
      const dealsBody = await dealsRes.json() as { deals?: Deal[]; facts?: DealFact[] };
      if (!live) return;
      const found = (dealsBody.deals ?? []).find((d) => d.id === dealId) ?? null;
      setDeal(found);
      setFacts((dealsBody.facts ?? []).filter((f) => f.deal_id === dealId));
      setReady(true);
      if (found === null) return;

      // The plan is geometry on our own row. There is no image in this request
      // and no image in its answer.
      const planRes = await fetch(`/api/deals/${found.id}/floorplan`, { credentials: 'same-origin' }).catch(() => null);
      if (live && planRes !== null && planRes.ok) {
        setFloorPlanRaw(((await planRes.json()) as { plan: string | null }).plan);
      }

      // The area lines, from our own published files. Failure is silence: the
      // area page says it has nothing rather than showing a line with no source.
      const postcode = new URLSearchParams(found.url_params).get('postcode') ?? '';
      const sector = sectorOfPostcode(postcode.trim().toUpperCase().replace(/\s+/g, ' '));
      if (sector !== '') {
        const facts: HighlightSources | null = await loadAreaFacts(sector).catch(() => null);
        if (live && facts !== null) {
          setArea(areaHighlights(facts));
          const price = Number(new URLSearchParams(found.url_params).get('price') ?? 0);
          setComps(compsFrom(facts.sector, Number.isFinite(price) ? price : 0));
          setGrowth(growthFrom(facts.trajectory, facts.codes, sector, Number.isFinite(price) ? price : null));

          /**
           * THE MAP, CAPTURED FROM OUR OWN TILES IN THIS BROWSER.
           *
           * Last, and never blocking: the pack is already on screen and already
           * has its ranked comparables list by the time this is attempted. If it
           * returns nothing — no WebGL, a GPU texture cap, tiles that never
           * settle — the list is what prints, which is a real answer rather than
           * a degraded one. A blank rectangle would be worse than no map.
           */
          const here = postcode.trim().toUpperCase().replace(/\s+/g, ' ');
          const outcode = here.split(' ')[0] ?? '';
          const sales = facts.sector?.sales ?? [];
          if (outcode !== '' && sales.length > 0) {
            void getOutcodePostcodes(outcode)
              .then(async (places) => {
                // The geocode map keys postcodes WITHOUT a space (SA16HW),
                // which is why the first attempt looked up "SA1 6HW", found
                // nothing and silently drew no map at all.
                const at = places[here.replace(/\s+/g, '')];
                if (at === undefined) return;
                const { captureMap } = await import('../../lib/pack/mapShot');
                const shot = await captureMap({
                  subject: { lat: at[0], lng: at[1] },
                  radiusMiles: 0.5,
                  selectedId: null,
                  comps: salesByPrice(sales, 12)
                    .map((sale) => ({ ...sale, distanceMiles: 0, included: true, links: {} as never })),
                }, branding?.accentColour ?? '');
                if (live && shot.png !== null) setMapImage(shot.png);
              })
              .catch(() => { /* the ranked list is the answer when this cannot be */ });
          }
        }
      }
    });
    return () => { live = false; };
  }, [dealId, reload]);

  const who = me.value;
  if (who === undefined || (who !== null && !ready)) {
    return (
      <div class="glass card" aria-hidden="true">
        <div class="skeleton sk-title" />
        <div class="skeleton sk-line" />
      </div>
    );
  }
  if (who === null && meUnknown.value) {
    return (
      <div class="glass card">
        <h2 class="state-h">{COPY.account.sessionUnknownHeading}</h2>
        <p class="hint">{COPY.account.sessionUnknown}</p>
      </div>
    );
  }
  if (who === null) {
    return (
      <div class="glass card">
        <h2 class="state-h">{ACCOUNT.signedOut.heading}</h2>
        <p class="hint">{COPY.account.signInToSave}</p>
        <button type="button" class="btn-action" onClick={openLoginWall}>{ACCOUNT.signedOut.logIn}</button>
      </div>
    );
  }
  if (failed !== '') return <div class="glass card"><p class="hint" role="alert">{failed}</p></div>;
  if (declared === false) return <PackDeclaration onDone={() => { setReady(false); setReload((n) => n + 1); }} />;
  if (dealId === '') return <div class="glass card"><p class="hint">{PACK_COPY.errors.noDeal}</p></div>;
  if (deal === null) return <div class="glass card"><p class="hint">{PACK_COPY.errors.dealGone}</p></div>;
  if (branding === null) return null;

  // The deal's own saved parameters, with anything learned since folded in —
  // exactly what the board re-scores from.
  const params = applyFacts(deal.strategy, deal.url_params, facts);
  const numbers = packNumbersFor(deal.strategy, params);
  if (numbers === null) return <div class="glass card"><p class="hint">{PACK_COPY.errors.noFigures}</p></div>;

  const ticked = tickedKeys(params, REFURB_ITEMS);
  const runway = refurbDuration(ticked, REFURB_DURATION, ownWeeksFrom(Object.fromEntries(new URLSearchParams(params))));

  const { hero, strip } = heroAndStrip(numbers);

  const base: Base = {
    address: deal.title,
    strategy: deal.strategy,
    preparedOn: today(),
    compliance: complianceOf(declaration, branding.businessName),
    hero,
    strip,
    costs: numbers.costs,
    returns: numbers.returns,
    waterfall: waterfallFrom(numbers),
    waterfallStacks: partsSumToTotal(numbers),
    scope: tickedScope(params, REFURB_ITEMS),
    runway: runway === null ? null : {
      phases: [
        { name: DURATION_COPY.parts.leadIn, from: runway.parts.leadIn.from, to: runway.parts.leadIn.to, display: sayWeeks(runway.parts.leadIn) },
        { name: DURATION_COPY.parts.onTools, from: runway.parts.onTools.from, to: runway.parts.onTools.to, display: sayWeeks(runway.parts.onTools) },
        { name: DURATION_COPY.parts.snagging, from: runway.parts.snagging.from, to: runway.parts.snagging.to, display: sayWeeks(runway.parts.snagging) },
        { name: DURATION_COPY.parts.voidPeriod, from: runway.parts.voidPeriod.from, to: runway.parts.voidPeriod.to, display: sayWeeks(runway.parts.voidPeriod) },
      ],
      total: sayWeeks(runway.total),
      basis: runway.breakdown.note ?? DURATION_COPY.runway,
    },
    floorPlan: packFloorPlan(floorPlanRaw),
    area,
    growth,
    comps,
    mapImage,
  };

  return <PackComposer base={base} branding={branding} onBranding={setBranding} />;
}
