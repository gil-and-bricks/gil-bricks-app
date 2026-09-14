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
import { refurbDuration, sayWeeks, sectorOfPostcode } from '@gil-bricks/core';
import { loadMe, me, meUnknown, openLoginWall } from '../../lib/auth/session';
import { ACCOUNT } from '../../config/account';
import { COPY } from '../../config/copy';
import { PACK_COPY } from '../../config/pack';
import { REFURB_ITEMS } from '../../config/refurb';
import { DURATION_COPY, REFURB_DURATION } from '../../config/refurbDuration';
import { applyFacts, type DealFact } from '../../lib/deals/facts';
import { packFloorPlan } from '../../lib/pack/floorPlan';
import { packNumbersFor, tickedKeys, tickedScope } from '../../lib/pack/fromDeal';
import { areaHighlights, loadAreaFacts } from '../../lib/pack/areaHighlights';
import { ownWeeksFrom } from '../analyser/RefurbSection';
import { PackBuilder } from './PackBuilder';
import { PackDeclaration } from './PackDeclaration';
import { NEUTRAL_ACCENT, type Branding } from './PackProfile';
import type { AreaHighlight, PackCompliance, PackModel } from './PackDocument';

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

type Base = Omit<PackModel, 'on' | 'photos' | 'summary' | 'investorName'>;

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
        const highlights = await loadAreaFacts(sector).then(areaHighlights).catch(() => []);
        if (live) setArea(highlights);
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

  const base: Base = {
    title: deal.title,
    strategy: deal.strategy,
    preparedOn: today(),
    branding,
    compliance: complianceOf(declaration, branding.businessName),
    headline: numbers.headline,
    costs: numbers.costs,
    returns: numbers.returns,
    scope: tickedScope(params, REFURB_ITEMS),
    duration: runway === null ? null : {
      parts: [
        { name: DURATION_COPY.parts.leadIn, weeks: sayWeeks(runway.parts.leadIn) },
        { name: DURATION_COPY.parts.onTools, weeks: sayWeeks(runway.parts.onTools) },
        { name: DURATION_COPY.parts.snagging, weeks: sayWeeks(runway.parts.snagging) },
        { name: DURATION_COPY.parts.voidPeriod, weeks: sayWeeks(runway.parts.voidPeriod) },
      ],
      total: sayWeeks(runway.total),
      basis: runway.breakdown.note ?? DURATION_COPY.runway,
    },
    floorPlan: packFloorPlan(floorPlanRaw),
    area,
  };

  return <PackBuilder base={base} onBranding={setBranding} />;
}
