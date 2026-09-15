/**
 * X2 — WHAT THE LISTING SAID, AND DID NOT SAY, on the deal's own page.
 *
 * The same findings the extension put on the portal's page, carried over in the
 * handoff as codes and rendered here from the CURRENT wording — so a deal saved
 * three months ago shows today's words rather than the phrasing that happened to
 * be current on the day.
 *
 * TWO GROUPS, PLAINLY NAMED. "What might kill it" and "What to ask the agent".
 * There is room here that there was not on somebody else's page, so each one
 * carries its line of why — but it is still one line, not a paragraph.
 *
 * THE CAP DOES NOT APPLY HERE. Four is a rule about a page we do not own, where
 * an alert nobody reads is worse than no alert. This is the deal's own page: the
 * person came here to read it.
 */
import { FINDING_COPY, FINDINGS_COPY, FINDING_TONE, findingsFromCodes, type FindingCode, type FindingKind } from '@gil-bricks/core';

const RISK: FindingKind = 'risk';
const GAP: FindingKind = 'gap';

/** Codes are risks or gaps; the split is by prefix, which the codes encode. */
const GAPS = new Set<FindingCode>(['NOPLAN', 'NOEPC', 'NOAREA', 'NOTEN', 'NOCT', 'NOLEASE', 'NOGR', 'NOSC']);

export interface DealFindingsProps {
  /** The raw `finds` parameter as saved with the deal. */
  codes: string | null | undefined;
}

export function DealFindings({ codes }: DealFindingsProps) {
  const all = findingsFromCodes(codes);
  const risks = all.filter((c) => !GAPS.has(c));
  const gaps = all.filter((c) => GAPS.has(c));

  if (all.length === 0) {
    return (
      <section class="df">
        <p class="df-none">{FINDINGS_COPY.none}</p>
        {/* Silence is not an all clear, and it says so — the same law as the panel. */}
        <p class="df-none-why">{FINDINGS_COPY.noneWhy}</p>
      </section>
    );
  }

  // The tone name comes from core's own table, never retyped here: the chips on
  // the portal's page and this page must colour the two kinds the same way.
  const group = (heading: string, list: FindingCode[], kind: FindingKind) =>
    list.length === 0 ? null : (
      <div class={`df-group df-${FINDING_TONE[kind]}`}>
        <h3 class="df-head">{heading}</h3>
        <ul class="df-list">
          {list.map((code) => (
            <li class="df-item" key={code}>
              <span class="df-label">{FINDING_COPY[code].label}</span>
              <span class="df-why">{FINDING_COPY[code].why}</span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <section class="df">
      {group(FINDINGS_COPY.riskHeading, risks, RISK)}
      {group(FINDINGS_COPY.gapHeading, gaps, GAP)}
    </section>
  );
}
