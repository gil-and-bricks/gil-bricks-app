/**
 * Feature flags — the ONE place a user-facing feature is switched on or off
 * (CLAUDE.md → Reversibility charter). Flipping a flag here IS the rollback:
 * no code change, no migration, nothing to unpick. Every flag is documented in
 * docs/FEATURE_FLAGS.md (what it turns on, what happens when it's off) and a
 * test fails if a flag is added here without that doc entry.
 *
 * Rules: one boolean per user-facing feature; a flag never lives anywhere else
 * (never in site.config.ts, env vars or a component); a flag that's been ON in
 * production for months may be retired by DELETING it and its `if` — never by
 * leaving a dead flag behind.
 */
export interface FeatureFlags {
  /** The 0–10 Deal Score chip + "what's holding it back" note on every analyser
   * verdict. Off: the verdict banner and tiles still show; nothing is scored and
   * saved deals carry no score. */
  dealScore: boolean;
  /** The deal pipeline: the board at /deals, stage moves, park/kill, the today
   * line, and the save-to-pipeline mirror. Off: /deals redirects to /account,
   * which shows the flat saved-deals list; saving still works; pipeline API
   * routes answer 404. */
  dealPipeline: boolean;
  /** The sticky verdict bar on the analyser pages (N1): score + tier colour +
   * the verdict line pinned under the header, updating in place as inputs
   * change. Off: no bar; the verdict card is the only place the score shows and
   * its banner is the polite live region again. Needs dealScore. */
  stickyVerdict: boolean;
  /** The section overview strip on the analyser pages (N2): a scrollable row of
   * jump chips under the sticky bar, plus the "back to inputs" link and the
   * comparables module folded behind its one-line summary. Off: no strip, no
   * back link, the comparables module is open as it always was. The maths and
   * assumptions accordions stay collapsed either way — they always were. */
  sectionOverview: boolean;
  /** The four-strategy segmented switcher pinned in the analyser's sticky stack
   * (N3). Off: the switcher stays where it was — a row of pills inside the page,
   * above the verdict card. Either way it is ONE control, never two. */
  segmentedStrategy: boolean;
  /** Phone-first comparables (N3): a card per sale below 640px instead of the
   * 11-column table, and the filters folded into one "Filters" sheet with a
   * count of what is active. Off: the table and the open filter strip, as
   * before. The map stays load-on-demand either way. */
  compsMobile: boolean;
  /** The desktop analyser layout (N4): inputs and assumptions on the left, a
   * sticky results rail (verdict, figures, costs) on the right, and the section
   * overview as a vertical list beside the page. Pure CSS over the same DOM —
   * off means the single-column page at every width, exactly as before. */
  desktopSplit: boolean;
  /** The grouped header and the five-item bottom bar with a More sheet (N4).
   * Off: the flat header list (Area Data + four strategies) and the old
   * five-strategy bottom bar. The /tools and /bridging-finance pages exist either way. */
  navV2: boolean;
  /** The EPC register lookup (E1): the analyser's floor-area button asks the
   * real register through /api/epc. Off: it falls back to the sold-data match
   * it used before, and the button says what that is. */
  epcRegisterLookup: boolean;
  /** The bridging page's video slot (S1): a click-to-load video between the
   * explanation and the enquiry form. Off: the section is not rendered and the
   * explanation runs straight into the form, with no third-party markup. */
  bridgingVideo: boolean;
  /** The bridging finance enquiry page (F1) at /bridging-finance: the
   * explanation, the sign-in gate and the two-step form. Off: the route still
   * exists and explains what is coming, but no form renders and the API
   * answers 404 — nothing can be submitted. */
  bridgingFinance: boolean;
  /** The tools section (T1): the /tools index and the calculators listed in
   * config/tools.ts. Off: /tools shows nothing is switched on, and the tool
   * pages themselves render their explanation without the calculator. */
  toolsSection: boolean;

  /** Facts and re-scoring on a saved deal (P5): the deal learns a builder's
   * quote, a survey finding, a down-valuation, and re-runs the SAME maths the
   * analyser runs. Off: no fact control, no fact list, no /api/deals/:id/facts,
   * and a deal keeps the score it was saved with. */
  dealFacts: boolean;

  /** Verdict-change messaging and the score history (P6): when a fact moves a
   * deal's score across a meaningful threshold, the deal says so in the user's
   * own voice and keeps saying so until they dismiss it. Off: facts still
   * re-score exactly as they do today, but nothing announces it, no change is
   * stored and the score history does not open. */
  verdictChanges: boolean;

  /** Evidence chips (P7): the small strip under a Deal Score saying which inputs
   * are evidenced, which are assumed and which are unknown, plus one line naming
   * the weakest. Shown on the deal card, the analyser verdict and the extension
   * panel from ONE shared source. Off: no strip and no line anywhere; every
   * score, verdict and fact behaves exactly as it does today. */
  evidenceChips: boolean;

  /** Dated deadlines and the urgency ranking they feed (P8): a chase date on any
   * deal, an auction date on an auction deal, an exchange date once the offer is
   * accepted. Off: no date controls, `POST /api/deals/:id/date` is 404, and the
   * today line simply ranks without its top tier. Dates already set stay in the
   * database and are never shown. */
  dealDates: boolean;

  /** The dead-deal graveyard (P9): killing a deal captures one reason chip, an
   * optional note and a FROZEN snapshot of the card as it died, and the board
   * gains a collapsed "Deals you killed" view with a sparse-safe pattern line
   * and a way to bring a deal back. Off: the board keeps P4's plain parked list,
   * no note is captured, no pattern is shown and `POST /api/deals/:id/revive`
   * answers 404. Deaths are still recorded, so switching it on shows the lot. */
  dealGraveyard: boolean;

  /** Calendar export (P10): an "Add to calendar" control on any deal carrying a
   * date, which builds a .ics file in the browser — a VEVENT per date, with the
   * deal's link in the description, the cash needed on an auction, and an alarm
   * request their calendar app may or may not honour. Off: no button anywhere and
   * no file is ever built; the dates themselves are untouched. */
  calendarExport: boolean;

  /** The chain-risk card (P11): a fixed, honest note when a deal reaches offer
   * accepted — around four in ten agreed sales never complete, most wobbles are
   * in the first four weeks, and here is what kills them. Once per deal,
   * dismissible (`deals.chain_ack_at`). Off: no card, nothing stored, and the
   * ack route answers 404. */
  chainRisk: boolean;

  /** The re-trade radar (P11): when a survey finding or a down-valuation moves a
   * live deal, the card shows the reverse-solved new maximum offer and a message
   * you can copy to the agent. Copy only — nothing is ever sent. Off: no radar
   * anywhere; facts, scores and change messages are untouched. */
  retradeRadar: boolean;

  /** The broker's fact-find (F2): after a bridging enquiry QUALIFIES, the third
   * step that collects what the broker needs to go and get quotes — name, date
   * of birth, address, ownership, experience, credit answer and where the
   * deposit comes from. Stored in D1, never in Kit, and delivered to him as a
   * single-use expiring link. Off: a qualified enquiry ends exactly where F1
   * ended it, `POST /api/bridging/factfind` is 404 and the broker's own page is
   * 404. Anything already collected stays in D1 until retention deletes it. */
  brokerFactFind: boolean;

  /** The post-answer capture path on the tools (T3): the offer to email the
   * breakdown, by Google sign-in or a typed address. It NEVER gates the answer;
   * off = no offer block at all, and the tools make no server call. Each tool
   * also needs its own Kit tag and a live automation (src/config/capture.ts),
   * without which its offer stays hidden even with this flag on. */
  toolCapture: boolean;

  /** The credit page (T3) at /credit — the one paid partnership, disclosure
   * first. Off: /credit redirects home and the link leaves the nav and the
   * bridging page. The affiliate URL is separate: with it empty the page still
   * teaches the insight and shows no button (src/config/credit.ts). */
  creditPage: boolean;

  /** The score-moved note (D4): when a saved score no longer matches what the
   * deal's own inputs produce — because D4 changed which sold evidence every
   * surface reads — the card says what it was, what it is now, and offers to
   * take the new one. Nothing is ever rewritten without a tap. Off: the stored
   * score stands silently and no sector files are fetched on the board at all.
   * Threshold: SCORE_MOVED.minPoints. */
  scoreMovedNote: boolean;

  /** The criteria handoff (D4): "Send to my analyser" carries the minimums the
   * person set in the extension, so the analyser judges by their bar and says
   * whose it is — instead of quietly reverting to the strategy's defaults. Off:
   * the params are ignored and every analyser judges by config, exactly as
   * before; the extension still sends them and they simply do nothing. */
  criteriaHandoff: boolean;

  /** The measurement handoff (D4): room sizes measured on the floor plan in the
   * extension survive "Send to my analyser" instead of dying at the click. Off:
   * the analyser reads only rooms typed into its own accordion. */
  measurementHandoff: boolean;

  /** The cash-needed change line (D4): a fact that moves what you must find up
   * front is announced even when the Deal Score does not move at all. Off: the
   * change block behaves exactly as P6 left it (score moves only) and no cash
   * figures are written to a change row. Threshold: CHANGE_RULES.minCashChange. */
  cashNeededChange: boolean;

  /** The valuation's type caveat (D4): when the subject's kind of home is not
   * what this sector's sold evidence is about, say so BESIDE the estimate, and
   * past a stated multiple lead with it and demote the figure. Off: the estimate
   * and its existing "less certain" line are exactly as they were — the number
   * itself never changes either way. Ratios: VALUATION_TYPE_CHECK. */
  valuationTypeCaveat: boolean;

  /** The desktop header's More menu (A1). The bottom bar only exists under
   * 640px, so above it the More-sheet pages had no link in the header at all —
   * /comparables only from pages nothing links to. Reads the SAME config list as
   * the phone sheet, minus what the desktop already shows. Off: the header is
   * Analyse, Area Data, Tools, Bridging finance, then Deals, then the socials
   * and the account control — and /comparables and /credit go back to being
   * reachable on a desktop only by URL. */
  desktopMore: boolean;

  /** PDF export of a result (D1). Off: no PDF button and no "coming soon"
   * caption anywhere — an unbuilt feature is hidden, never shown disabled. */
  pdfExport: boolean;
  /** The honest note beside the footer's as-of date when the monthly data
   * refresh has plainly stopped running (older than
   * `DATA_FRESHNESS.staleAfterDays`). Off: the as-of date still shows, exactly
   * as it always did, and nothing says whether it is current. */
  staleDataNote: boolean;
}

export const features: FeatureFlags = {
  dealScore: true,
  dealPipeline: true,
  stickyVerdict: true,
  sectionOverview: true,
  segmentedStrategy: true,
  compsMobile: true,
  desktopSplit: true,
  navV2: true,
  bridgingFinance: true,
  bridgingVideo: true,
  epcRegisterLookup: true,
  brokerFactFind: true,
  dealFacts: true,
  verdictChanges: true,
  evidenceChips: true,
  dealDates: true,
  dealGraveyard: true,
  calendarExport: true,
  chainRisk: true,
  retradeRadar: true,
  toolsSection: true,
  toolCapture: true,
  creditPage: true,
  scoreMovedNote: true,
  criteriaHandoff: true,
  measurementHandoff: true,
  cashNeededChange: true,
  valuationTypeCaveat: true,
  desktopMore: true,
  pdfExport: false,
  staleDataNote: true,
};

/** The sticky bar can only show a Deal Score, so it is live only when BOTH flags
 * are on — one helper, so no component re-derives (and mis-derives) this. */
export function stickyVerdictActive(): boolean {
  return features.stickyVerdict && features.dealScore;
}
