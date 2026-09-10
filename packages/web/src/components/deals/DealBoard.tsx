/**
 * The pipeline board (P3 + P4) at /deals, behind features.dealPipeline. It answers
 * "what do I need to do today?" and lets the operator ACT without leaving the page:
 *  - a today line names ONE deal + ONE action (board.todayLine).
 *  - every card shows its next step + how long it's waited, and ages stage-aware.
 *  - cards move by drag (desktop) or a native stage picker (keyboard + one-handed
 *    mobile), optimistically with an honest rollback; skipping is allowed.
 *  - quick actions: move, park/kill (one-chip reason), re-open the analyser.
 *  - auction deals surface the legal-pack warning unmissably at Offer in.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { COPY } from '../../config/copy';
import { loadMe, me, meUnknown, openLoginWall } from '../../lib/auth/session';
import { getSector, strategies, type SectorFile } from '@gil-bricks/core';
import { features } from '../../config/features';
import { dealHref } from '../../lib/deals/deal';
import { DealFacts } from './DealFacts';
import { applyFacts, factMoves, factNotes, factTypeFor, previousValueFor, type DealFact } from '../../lib/deals/facts';
import { cashIsNews, isNews, unseen, type DealChange } from '../../lib/deals/changes';
import { scoreMoveFor, sectorOf, type ScoreMove } from '../../lib/deals/scoreMoved';
import { DealChangeNote } from './DealChange';
import { ScoreHistory } from './ScoreHistory';
import { parseStoredEvidence, scoreFromParams } from '../../lib/deals/scoreFromParams';
import { fmtMoney } from '@gil-bricks/core';
import { evidenceInputsFor } from '../../lib/deals/evidenceFor';
import { EvidenceChips } from './EvidenceChips';
import { DealDates } from './DealDates';
import { CalendarButton } from './CalendarButton';
import { ChainRiskCard } from './ChainRisk';
import { RetradeRadar } from './RetradeRadar';
import { retradeFor } from '../../lib/deals/retrade';
import { buildIcs, eventsForDeal, hasExportableDate, icsFilename } from '../../lib/deals/ics';
import { siteConfig } from '../../site.config';
import { appendUnseen, auctionWarningDue, boardCounts, cardVerdict, chainRiskDue, counterLine, datesOf, dwellState, hasScoreHistory, isLive, nextStepLine, parkedDeals, stageColumns, stageMeta, type BoardDeal } from '../../lib/deals/board';
import { headstones, toDeath, type DealDeath, type DeathRowJson } from '../../lib/deals/graveyard';
import { Graveyard } from './Graveyard';
import { todayLine } from '../../lib/deals/urgency';
import { ALL_STAGES, AUCTION_FEES_FACT, BOARD_COPY, CALENDAR, CHANGE_COPY, DEAD_STAGE, GRAVEYARD_COPY, LIVE_CAP_MESSAGE, PARK_REASONS, PROGRESS_STAGES, SCORE_MOVED_COPY, TODAY_COPY, parkReason, statusForStage } from '../../config/pipeline';

const strategyBadge = (id: string): string =>
  id === 'comparables' ? BOARD_COPY.card.compsBadge : strategies.find((s) => s.id === id)?.shortName ?? id.toUpperCase();

const STAGE_ORDER = PROGRESS_STAGES.map((s) => s.key);
/** The stage a bought deal ends at — the one column that is a window (P11). */
const DONE_STAGE = PROGRESS_STAGES.filter((s) => statusForStage(s.key) === 'done').map((s) => s.key)[0] ?? '';

export function DealBoard() {
  const [deals, setDeals] = useState<BoardDeal[] | null | 'error'>(null);
  const [cap, setCap] = useState(100);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const [parkingId, setParkingId] = useState('');
  const [dragId, setDragId] = useState('');
  const [dropStage, setDropStage] = useState('');
  // How many writes are in flight PER DEAL. A count, not a flag: a card with two
  // overlapping writes must stay locked until the last one lands (P5 review).
  const [pending, setPending] = useState<Record<string, number>>({});
  const [showParked, setShowParked] = useState(false);
  /** P5: every fact on every deal, applied in the browser before re-scoring. */
  const [facts, setFacts] = useState<DealFact[]>([]);
  /** P6: the verdict changes nobody has seen yet. They outlive the tab. */
  const [changes, setChanges] = useState<DealChange[]>([]);
  /** D4 — sector files for the score-moved check, fetched once each. */
  const sectorCache = useRef<Map<string, SectorFile | null>>(new Map());
  const [movesTick, setMovesTick] = useState(0);
  const movedMemo = useRef<Map<string, ScoreMove | null>>(new Map());
  /** P9: the deaths — each one a frozen card, kept as the memory. */
  const [deaths, setDeaths] = useState<DealDeath[]>([]);
  /**
   * P11 — the TRUE totals, counted in the database. The board holds every live
   * deal but only a window of the bought and the killed, so a count taken from
   * the rows on screen would be a lie the moment somebody kills their 21st deal.
   */
  const [counts, setCounts] = useState<{ live: number; done: number; dead: number } | null>(null);
  const [more, setMore] = useState<{ done: boolean; dead: boolean }>({ done: false, dead: false });
  const [loadingMore, setLoadingMore] = useState(false);
  /** The optional line typed while killing a deal. Never required. */
  const [killNote, setKillNote] = useState('');
  /**
   * P12 — an evidence chip was pressed. Which deal, and which fact it asked for.
   * One-shot: DealFacts opens on it and clears it, so it can never re-open.
   */
  const [fixFor, setFixFor] = useState<{ dealId: string; factType: string } | null>(null);
  /** Said back after a kill or a revival, where the deal has just GONE — the card
   * that carried the message is no longer on the board (P9). */
  const [boardNote, setBoardNote] = useState('');
  const isBusy = (id: string): boolean => (pending[id] ?? 0) > 0;
  const setBusy = (id: string, on: boolean): void =>
    setPending((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + (on ? 1 : -1)) }));

  const loadBoard = (first: boolean): void => {
    fetch('/api/deals')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((b: {
        deals: BoardDeal[]; cap: number; facts?: DealFact[]; changes?: DealChange[]; deaths?: DeathRowJson[];
        counts?: { live: number; done: number; dead: number }; more?: { done: boolean; dead: boolean };
      }) => {
        setDeals(b.deals);
        setCap(b.cap);
        setFacts(b.facts ?? []);
        setChanges(b.changes ?? []);
        setDeaths((b.deaths ?? []).map(toDeath));
        if (b.counts) setCounts(b.counts);
        setMore(b.more ?? { done: false, dead: false });
      })
      .catch(() => { if (first) setDeals('error'); });
  };

  useEffect(() => {
    void loadMe().then((v) => {
      if (v === null) return;
      loadBoard(true);
    });
    // A deal can change in the OTHER tab — the analyser saves, folds facts in and
    // moves the numbers. Coming back to this tab re-reads the board, so it can
    // never re-score from params the deal no longer has (P6 review).
    if (typeof document === 'undefined') return undefined;
    const onShow = (): void => {
      if (document.visibilityState === 'visible' && me.value) loadBoard(false);
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);

  /**
   * A reverse solve is a search: about ten scorings per deal. Running it inside
   * the render would put that on the main thread before the board had painted,
   * on every card carrying a survey (P11 review). It runs here instead — after
   * the paint — and each answer is kept until the deal, its numbers or its facts
   * change, which is exactly when it stops being true.
   */
  useEffect(() => {
    if (!features.retradeRadar || !Array.isArray(deals)) return;
    let found = false;
    for (const d of deals) {
      if (d.status !== 'live') continue;
      const key = retradeKey(d);
      if (retradeMemo.current.has(key)) continue;
      retradeMemo.current.set(key, retradeFor(d, factsFor(d.id), evidenceFor(d), d.room_size_failures ?? null));
      found = true;
    }
    if (found) setRadarTick((n) => n + 1);
  }, [deals, facts]);

  /**
   * D4 — which saved scores no longer match what their own inputs produce.
   *
   * Runs AFTER the board has painted and fetches nothing the board needed to
   * render: one sector file per distinct sector, deduped and cached by core, and
   * only for live scored deals. A sector that will not load simply produces no
   * note — a missing note is honest, a guessed one is not.
   */
  useEffect(() => {
    if (!features.scoreMovedNote || !Array.isArray(deals)) return;
    let live = true;
    const wanted = new Set<string>();
    for (const d of deals) {
      if (d.status !== 'live' || d.current_score === null) continue;
      const sec = sectorOf(d);
      if (sec !== null && !sectorCache.current.has(sec)) wanted.add(sec);
    }
    if (wanted.size === 0) { setMovesTick((n) => n + 1); return undefined; }
    void Promise.all([...wanted].map((sec) => getSector(sec)
      .then((f) => sectorCache.current.set(sec, f))
      .catch(() => sectorCache.current.set(sec, null))))
      .then(() => { if (live) setMovesTick((n) => n + 1); });
    return () => { live = false; };
  }, [deals, facts]);

  /**
   * The move on one deal. MEMOISED exactly like the re-trade radar: this runs a
   * full scoreDeal, and doing that for every card on every render is the cost
   * the radar was memoised to avoid (D4 review). The key carries everything the
   * answer depends on, so it recomputes when — and only when — one changes.
   */
  const moveFor = (deal: BoardDeal): ScoreMove | null => {
    if (!features.scoreMovedNote) return null;
    void movesTick; // a sector landing invalidates nothing, but does re-render
    const sec = sectorOf(deal);
    if (sec === null) return null;
    const file = sectorCache.current.get(sec) ?? null;
    const key = `${retradeKey(deal)}|${deal.current_score ?? ''}|${file === null ? 'x' : sec}`;
    const hit = movedMemo.current.get(key);
    if (hit !== undefined) return hit;
    const mv = scoreMoveFor(deal, factsFor(deal.id), file);
    movedMemo.current.set(key, mv);
    return mv;
  };

  /** Take the new score. Nothing is written until they ask for it. */
  const acceptMove = async (deal: BoardDeal, move: ScoreMove): Promise<void> => {
    if (isBusy(deal.id)) return;
    setBusy(deal.id, true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/score`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(move.body),
      });
      if (!res.ok) { setNote({ id: deal.id, text: SCORE_MOVED_COPY.failed }); return; }
      setDeals((cur) => (Array.isArray(cur)
        ? cur.map((d) => (d.id === deal.id
          ? { ...d, current_score: move.body.score as number, verdict_line: move.body.verdict_line as string,
              headline_figure: move.body.headline_figure as string, sold_evidence: move.body.sold_evidence as string }
          : d))
        : cur));
    } catch {
      setNote({ id: deal.id, text: SCORE_MOVED_COPY.failed });
    } finally {
      setBusy(deal.id, false);
    }
  };

  // ---- optimistic move + honest rollback ----
  // Updates are FUNCTIONAL and keyed by id: they touch only the one deal, so an
  // overlapping move/park on another card can never be clobbered, and a rollback
  // restores exactly that deal's prior stage — nothing else. One write per deal
  // at a time (a card is locked while its write is in flight).
  const moveTo = async (deal: BoardDeal, toStage: string) => {
    if (deal.stage === toStage || !Array.isArray(deals) || isBusy(deal.id)) return;
    const before = { stage: deal.stage, status: deal.status, stage_since: deal.stage_since };
    const stageSince = new Date().toISOString();
    const fromIdx = STAGE_ORDER.indexOf(deal.stage);
    const toIdx = STAGE_ORDER.indexOf(toStage);
    const skipped = fromIdx >= 0 && toIdx > fromIdx + 1;
    setBusy(deal.id, true);
    setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, stage: toStage, status: statusForStage(toStage), stage_since: stageSince } : d)) : cur));
    setNote(skipped ? { id: deal.id, text: BOARD_COPY.card.skippedStage } : null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/stage`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage: toStage }),
      });
      if (!res.ok) throw new Error();
      // The card jumps to another column, so say what happened and take the
      // person to it — otherwise the tap looks like nothing at all (D1).
      // Moving to (or off) a terminal stage moves a deal between the counts.
      const wasLive = before.status === 'live';
      const nowLive = statusForStage(toStage) === 'live';
      if (wasLive !== nowLive) {
        setCounts((c) => (c ? {
          ...c,
          live: Math.max(0, c.live + (nowLive ? 1 : -1)),
          done: Math.max(0, c.done + (nowLive ? -1 : 1)),
        } : c));
      }
      const label = ALL_STAGES.find((st) => st.key === toStage)?.label ?? toStage;
      setNote(skipped ? { id: deal.id, text: BOARD_COPY.card.skippedStage } : { id: deal.id, text: BOARD_COPY.card.moved(label) });
      requestAnimationFrame(() => document.getElementById(`deal-${deal.id}`)?.scrollIntoView({ block: 'center' }));
    } catch {
      setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, ...before } : d)) : cur));
      setNote({ id: deal.id, text: BOARD_COPY.card.moveFailed });
    } finally {
      setBusy(deal.id, false);
    }
  };

  /** Take the person to the board's own message: it sits at the top of the
   * graveyard, and they may be far down the list of headstones. */
  const seeBoardNote = (): void => {
    requestAnimationFrame(() => document.getElementById('graveyard')?.scrollIntoView({ block: 'start' }));
  };

  /**
   * P9 — KILL A DEAL. One reason key, one optional line, and the server freezes
   * the card as it died. The confirmation goes to the BOARD, not the card: the
   * card has just left the board for the graveyard, so a note on it would be a
   * message nobody can read.
   */
  const kill = async (deal: BoardDeal, reasonKey: string, note: string) => {
    if (!Array.isArray(deals) || isBusy(deal.id)) return;
    const before = { stage: deal.stage, status: deal.status, stage_since: deal.stage_since };
    setParkingId('');
    setBusy(deal.id, true);
    setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, stage: DEAD_STAGE.key, status: 'dead', stage_since: new Date().toISOString() } : d)) : cur));
    try {
      const res = await fetch(`/api/deals/${deal.id}/dead`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason_key: reasonKey, note }),
      });
      if (!res.ok) throw new Error();
      const { death } = (await res.json()) as { death?: DeathRowJson };
      // The snapshot comes back from the write that made it, so the headstone is
      // the card the server froze — never a second guess at it here.
      if (death) setDeaths((cur) => [toDeath(death), ...cur]);
      // The counts are the database's, so they have to move with it — otherwise
      // the deal you just killed is counted nowhere (P11 review).
      setCounts((c) => (c ? { ...c, live: Math.max(0, c.live - 1), dead: c.dead + 1 } : c));
      setKillNote('');
      setBoardNote(BOARD_COPY.card.parked(parkReason(reasonKey)?.label ?? ''));
      requestAnimationFrame(() => document.getElementById('graveyard')?.scrollIntoView({ block: 'center' }));
    } catch {
      // Put the deal back AND the sheet back, with the line they typed still in
      // it — losing somebody's words to a dropped connection is unforgivable.
      setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, ...before } : d)) : cur));
      setParkingId(deal.id);
      setNote({ id: deal.id, text: BOARD_COPY.card.parkFailed });
    } finally {
      setBusy(deal.id, false);
    }
  };

  /**
   * P9 — A DEAD DEAL COMES BACK. Sellers return and chains re-form. It goes back
   * to the stage it died at, the death is kept as history, and it is re-scored
   * against TODAY's rules — by the same core call every other re-score uses.
   */
  const revive = async (deal: BoardDeal) => {
    if (!Array.isArray(deals) || isBusy(deal.id)) return;
    setBusy(deal.id, true);
    try {
      const body = rescoreBody(deal, factsFor(deal.id));
      const res = await fetch(`/api/deals/${deal.id}/revive`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
      });
      // A revived deal is a live deal again, so a full board says so plainly.
      if (res.status === 409) { setBoardNote(LIVE_CAP_MESSAGE); seeBoardNote(); return; }
      if (!res.ok) throw new Error();
      const { stage } = (await res.json()) as { stage?: string };
      const to = stage ?? deal.stage;
      setDeals((cur) => (Array.isArray(cur)
        ? cur.map((d) => (d.id === deal.id ? { ...d, stage: to, status: 'live', stage_since: new Date().toISOString() } : d))
        : cur));
      setDeaths((cur) => cur.filter((x) => x.deal_id !== deal.id));
      setCounts((c) => (c ? { ...c, live: c.live + 1, dead: Math.max(0, c.dead - 1) } : c));
      applyScore(deal.id, body);
      setBoardNote(GRAVEYARD_COPY.revived(stageMeta(to).label));
      requestAnimationFrame(() => document.getElementById(`deal-${deal.id}`)?.scrollIntoView({ block: 'center' }));
    } catch {
      setBoardNote(GRAVEYARD_COPY.reviveFailed);
      seeBoardNote();
    } finally {
      setBusy(deal.id, false);
    }
  };

  /**
   * P11 — more of the graveyard. The board loads a window; this asks for the
   * next one, from the last row it holds, so nothing repeats and nothing is
   * skipped. The COUNT never comes from here — it comes from the database.
   */
  const loadMore = async (status: 'dead' | 'done'): Promise<void> => {
    if (!Array.isArray(deals) || loadingMore) return;
    const held = deals.filter((d) => d.status === status);
    const last = held[held.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/deals/${status}?before=${encodeURIComponent(last.page_at ?? last.updated_at)}&beforeId=${encodeURIComponent(last.id)}`);
      if (!res.ok) throw new Error();
      const body = (await res.json()) as {
        deals: BoardDeal[]; deaths?: DeathRowJson[]; facts?: DealFact[]; more?: boolean;
        counts?: { live: number; done: number; dead: number };
      };
      // DE-DUPE AGAINST THE ARRAY WE ARE ACTUALLY APPENDING TO, not the one this
      // closure captured before the fetch. A board reload (visibilitychange, when
      // the operator comes back from the analyser tab) lands DURING this await and
      // replaces `deals` wholesale; a page filtered against the pre-fetch list then
      // appended a deal the reload had already put back — the same deal twice in
      // the array, and so the same card in two places (P12).
      setDeals((cur) => (Array.isArray(cur) ? appendUnseen(cur, body.deals) : cur));
      setDeaths((cur) => appendUnseen(cur, (body.deaths ?? []).map(toDeath)));
      setFacts((cur) => appendUnseen(cur, body.facts ?? []));
      setMore((cur) => ({ ...cur, [status]: body.more === true }));
      if (body.counts) setCounts(body.counts);
    } catch {
      setBoardNote(BOARD_COPY.card.moreFailed);
    } finally {
      setLoadingMore(false);
    }
  };

  /** The facts on one deal, oldest first. */
  const factsFor = (dealId: string): DealFact[] => facts.filter((f) => f.deal_id === dealId);

  /**
   * The sold-price band the SAVED score was judged against (P5.1). Re-scoring with
   * it means a fact moves the score for the fact's own reason and nothing else.
   */
  const evidenceFor = (deal: BoardDeal) => parseStoredEvidence(deal.sold_evidence);

  /**
   * A deal saved before we stored the band. A re-score cannot use what the saved
   * score used, so the card says so — and keeps saying so until the deal is saved
   * again, because the drift does not go away when the fact that exposed it does.
   */
  const evidenceUnknown = (deal: BoardDeal): boolean =>
    // ...and only where the strategy actually scores sold prices. An HMO has no
    // such component, so it has nothing to have lost (P6 review).
    (deal.sold_evidence === null || deal.sold_evidence === undefined)
    && (strategies.find((s) => s.id === deal.strategy)?.score ?? []).some((c) => c.key === 'evidence');

  /** The newest fact these params include, so a save folds in only what was here. */
  const factsAsOf = (dealId: string): string | undefined => {
    const applied = factsFor(dealId).filter((f) => f.folded_at === null || f.folded_at === undefined);
    return applied.length === 0 ? undefined : applied.map((f) => f.entered_at).sort().slice(-1)[0];
  };

  /** The deal's params AS THE FACTS LEAVE THEM — this is the truth from now on. */
  const paramsFor = (deal: BoardDeal): string => applyFacts(deal.strategy, deal.url_params, factsFor(deal.id));

  /**
   * P5 — the re-score, run in the BROWSER with @gil-bricks/core. No maths happens
   * here: scoreFromParams makes the same engine calls the analyser makes. It
   * returns what to send WITH the fact, so the fact and the score it caused are
   * one write — a card can never show a score the database does not hold.
   */
  const rescoreBody = (deal: BoardDeal, dealFacts: DealFact[]): Record<string, unknown> | null => {
    const params = applyFacts(deal.strategy, deal.url_params, dealFacts);
    try {
      const scored = scoreFromParams(deal.strategy, params, evidenceFor(deal), deal.room_size_failures ?? null);
      return {
        score: scored.score,
        verdict_line: scored.verdict,
        headline_figure: scored.figure,
        // The snapshot P6 reads: what it was judged against, and what was known.
        // `source` tells P6 which shape this is: a save writes thresholds and
        // assumptions, a fact re-score writes the params it scored.
        criteria_json: JSON.stringify({ source: 'fact-rescore', params }),
        evidence_json: JSON.stringify({ facts: dealFacts.map((f) => ({ type: f.fact_type, value: f.value, at: f.entered_at })) }),
        // D4 — carried out so the change line can name it. Not persisted on the
        // deal; the announcement row holds it.
        cash_needed: scored.cashNeeded,
      };
    } catch {
      return null; // not enough inputs to score — the card keeps saying so
    }
  };

  /** Put the re-scored figures on the card, once the server has stored them. */
  const applyScore = (dealId: string, body: Record<string, unknown> | null): void => {
    if (!body) return;
    setDeals((cur) => (Array.isArray(cur)
      ? cur.map((d) => (d.id === dealId
        ? {
            ...d,
            current_score: body.score as number,
            headline_figure: body.headline_figure as string,
            verdict_line: body.verdict_line as string,
            // A re-score WRITES A VERDICT ROW, so the history just gained a
            // point. Counting it here is what lets the score-history control
            // appear at the moment there is finally something to show; without
            // it the control stayed hidden until the next full page load (P12).
            score_points: (d.score_points ?? 0) + 1,
          }
        : d))
      : cur));
  };

  const addFact = async (deal: BoardDeal, factType: string, value: number | null, note: string): Promise<boolean> => {
    if (isBusy(deal.id)) return false; // one write per deal at a time
    setBusy(deal.id, true);
    try {
      const moves = factMoves(factType, deal.strategy);
      // The fact we are about to add, scored the way the analyser would score it.
      const provisional: DealFact = { id: 'pending', deal_id: deal.id, fact_type: factType, value, note, entered_at: new Date().toISOString() };
      const body = moves ? rescoreBody(deal, [...factsFor(deal.id), provisional]) : null;
      // P6 — is the move NEWS? The rules live in config; this only asks them.
      const from = deal.current_score;
      const to = body ? (body.score as number) : null;
      // D4 — and what you must find up front, either side of the fact. A quote
      // that leaves the score alone can still change this by tens of thousands.
      const fromCash = cashNeededFor(deal);
      const toCash = body ? ((body.cash_needed as number | null) ?? null) : null;
      const announce = features.verdictChanges && body !== null && from !== null && to !== null
        && (isNews(from, to) || (features.cashNeededChange && cashIsNews(fromCash, toCash)))
        ? {
          from_score: from,
          to_score: to,
          previous_value: value === null ? null : previousValueFor(deal.strategy, deal.url_params, factType),
          to_verdict_line: body.verdict_line as string,
          from_cash: features.cashNeededChange ? fromCash : null,
          to_cash: features.cashNeededChange ? toCash : null,
        }
        : null;
      const res = await fetch(`/api/deals/${deal.id}/facts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fact_type: factType, value, note, ...(body ?? {}), ...(announce ? { change: announce } : {}) }),
      });
      if (!res.ok) return false;
      const { id, changeId, entered_at: enteredAt } = (await res.json()) as { id: string; changeId?: string; entered_at?: string };
      // the SERVER's time, never this browser's: the fold window is built from it
      setFacts((cur) => [...cur, { ...provisional, id, entered_at: enteredAt ?? provisional.entered_at }]);
      applyScore(deal.id, body);
      if (announce && changeId) {
        setChanges((cur) => [{
          id: changeId, deal_id: deal.id, fact_type: factType, fact_value: value,
          previous_value: announce.previous_value, from_score: announce.from_score, to_score: announce.to_score,
          to_verdict_line: announce.to_verdict_line, from_cash: announce.from_cash, to_cash: announce.to_cash,
          at: new Date().toISOString(), acknowledged_at: null,
        }, ...cur]);
      }
      const label = factTypeFor(factType)?.label ?? factType;
      // P7 — the card must not say the same thing twice. When the change block is
      // about to announce this fact, it says it better, so the one-line note is
      // left off. Every other note (including every failure) is untouched.
      if (!(announce && changeId)) {
        setNote({ id: deal.id, text: body ? BOARD_COPY.card.factAdded(label) : BOARD_COPY.card.factFlagged(label) });
      }
      return true;
    } catch {
      return false;
    } finally {
      setBusy(deal.id, false);
    }
  };

  const removeFact = async (deal: BoardDeal, factId: string): Promise<boolean> => {
    if (isBusy(deal.id)) return false;
    setBusy(deal.id, true);
    try {
      const gone = factsFor(deal.id).find((f) => f.id === factId);
      const left = factsFor(deal.id).filter((f) => f.id !== factId);
      // A fact that moved nothing put no score out of place, so removing it
      // re-scores nothing and never claims it did.
      const moved = gone !== undefined && factMoves(gone.fact_type, deal.strategy);
      const body = moved ? rescoreBody(deal, left) : null;
      const res = await fetch(`/api/deals/${deal.id}/facts/${factId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) return false;
      setFacts((cur) => cur.filter((f) => f.id !== factId));
      applyScore(deal.id, body);
      setNote({ id: deal.id, text: body ? BOARD_COPY.card.factRemoved : BOARD_COPY.card.factDropped });
      return true;
    } catch {
      return false;
    } finally {
      setBusy(deal.id, false);
    }
  };

  /**
   * P11 — the re-trade radar. The decision is pure (lib/deals/retrade.ts); this
   * only remembers the answer, because a reverse solve is a search and cards
   * re-render for reasons that have nothing to do with it.
   */
  const retradeMemo = useRef(new Map<string, ReturnType<typeof retradeFor>>());
  const [, setRadarTick] = useState(0);
  /** What a radar's answer belongs to: this deal, these numbers, these facts. */
  const retradeKey = (deal: BoardDeal): string =>
    `${deal.id}|${deal.status}|${paramsFor(deal)}|${factsFor(deal.id).map((f) => `${f.id}${f.folded_at ?? ''}`).join(',')}`;
  const retradeOn = (deal: BoardDeal): ReturnType<typeof retradeFor> =>
    (features.retradeRadar ? retradeMemo.current.get(retradeKey(deal)) ?? null : null);

  /**
   * P10 — the deal's dates as a calendar file. Built only when somebody asks for
   * it, from the SAME rules the card uses to decide which dates apply.
   *
   * The cash needed rides along on an AUCTION event only, and only when the deal
   * really holds the analysis behind it — a score it was actually given. Nothing
   * is estimated into a calendar entry; the copy says whose figures they are.
   */
  /** What this deal needs up front on TODAY's facts, or null when it cannot be
   *  scored from its own params. Used by the calendar entry and by the D4 cash
   *  change line, so the two can never quote different figures. */
  const cashNeededFor = (deal: BoardDeal): number | null => {
    if (deal.current_score === null) return null;
    try {
      return scoreFromParams(deal.strategy, paramsFor(deal), evidenceFor(deal), deal.room_size_failures ?? null).cashNeeded;
    } catch {
      return null; // not scoreable from its params — then we say nothing at all
    }
  };

  const icsFor = (deal: BoardDeal): string => {
    const cash = cashNeededFor(deal);
    const events = eventsForDeal(deal, {
      // The SAME link the card carries, fold window and all: opening the deal
      // from a calendar entry must not fold facts that were never in these
      // numbers (the P6 review's fix, which this link had dropped).
      url: `${siteConfig.liveUrl}${dealHref(deal.strategy, paramsFor(deal), undefined, deal.id, factsAsOf(deal.id), factsFor(deal.id).map((f) => f.fact_type))}`,
      host: new URL(siteConfig.liveUrl).host,
      cashNeeded: cash,
      auctionFeesIn: factsFor(deal.id).some((f) => f.fact_type === AUCTION_FEES_FACT),
    });
    return buildIcs(events, Date.now(), CALENDAR.prodId(siteConfig.siteName));
  };

  /**
   * P8 — a date the person set. Stored at once, because the whole point of it is
   * that the board still knows tomorrow.
   */
  const setDate = async (deal: BoardDeal, key: string, value: string): Promise<void> => {
    setBusy(deal.id, true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/date`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date_key: key, value }),
      });
      if (!res.ok) throw new Error();
      setDeals((cur) => (Array.isArray(cur)
        ? cur.map((d) => (d.id === deal.id ? { ...d, [key]: value === '' ? null : value } : d))
        : cur));
      setNote({ id: deal.id, text: TODAY_COPY.dateSaved });
    } catch {
      setNote({ id: deal.id, text: TODAY_COPY.dateFailed });
    } finally {
      setBusy(deal.id, false);
    }
  };

  /**
   * P11 — the chain-risk card has been read. Stored, so it does not come back on
   * the next load; optimistic, because reading something is not a risky write.
   */
  const dismissChainRisk = async (deal: BoardDeal): Promise<void> => {
    const at = new Date().toISOString();
    setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, chain_ack_at: at } : d)) : cur));
    await fetch(`/api/deals/${deal.id}/chain-ack`, { method: 'POST' }).catch(() => undefined);
  };

  /** P6 — the person has seen it. Marked on the server, so a reload agrees. */
  const dismissChange = async (deal: BoardDeal, changeId: string): Promise<void> => {
    setChanges((cur) => cur.filter((c) => c.id !== changeId));
    await fetch(`/api/deals/${deal.id}/changes/${changeId}/ack`, { method: 'POST' }).catch(() => undefined);
  };

  /**
   * P6 — the deal has fallen below walk-away and the person has TAPPED to park
   * it. Nothing here happens on its own: this runs from their tap, with the
   * reason the numbers already gave.
   */
  const parkKilled = async (deal: BoardDeal, changeId: string): Promise<void> => {
    await dismissChange(deal, changeId);
    // ONE TAP: the reason the numbers already gave, captured like any other kill
    // — same chip, same frozen snapshot, straight into the graveyard.
    await kill(deal, CHANGE_COPY.killReasonKey, '');
  };

  const now = Date.now();
  const v = me.value;

  // Identity FIRST: a signed-out visitor never loads deals, so testing the data
  // before the person left them on a skeleton that could never finish (D1).
  // Every whole-board state is KEYED, and the skeletons carry NO aria-hidden.
  // Astro server-renders this island in its loading state, and Preact's hydration
  // adopts that DOM without diffing its attributes — so an `aria-hidden="true"`
  // on a skeleton stayed on the node the sign-in card was then rendered into,
  // hiding the only thing on the page from a screen reader (P11 review, caught by
  // Lighthouse). The skeleton is two empty divs: there is nothing to announce and
  // nothing to focus, so the attribute was buying nothing and costing that.
  if (v === undefined) {
    return (
      <div key="board-loading" class="glass card">
        <div class="skeleton sk-title" />
        <div class="skeleton sk-line" />
      </div>
    );
  }
  if (v === null && meUnknown.value) {
    // We could not reach /api/me. Their deals are fine; telling them to sign in
    // to see deals they are already signed in for is the lie D3 came for.
    return (
      <div key="board-unknown" class="glass card">
        <h2 class="state-h">{COPY.account.sessionUnknownHeading}</h2>
        <p class="hint">{COPY.account.sessionUnknown}</p>
      </div>
    );
  }
  if (v === null) {
    return (
      <div key="board-signin" class="glass card">
        <h2 class="state-h">{BOARD_COPY.screen.signInHeading}</h2>
        <p class="hint">{COPY.account.dealsSignIn}</p>
        <button type="button" class="btn-primary" onClick={openLoginWall}>{BOARD_COPY.screen.signInButton}</button>
      </div>
    );
  }
  if (deals === null) {
    return (
      <div key="board-skeleton" class="glass card">
        <div class="skeleton sk-title" />
        <div class="skeleton sk-line" />
      </div>
    );
  }
  if (deals === 'error') {
    return <p key="board-error" class="hint" role="alert">{BOARD_COPY.screen.loadFailed}</p>;
  }
  if (deals.length === 0) {
    return (
      <div key="board-empty" class="glass card board-empty">
        <h2 class="state-h">{BOARD_COPY.screen.emptyHeading}</h2>
        <p class="hint">{COPY.account.dealsEmpty}</p>
        {/* D6 — the ONE thing to do here was an underlined link in a hint
            paragraph, which read as a footnote. Same words, same href, given the
            weight of the only action on the screen. */}
        {/* D7 — both ways a deal can arrive, because a stranger knows neither. */}
        <p class="state-cta">
          <a class="btn-primary" href="/buy-to-let/analyser">{COPY.account.dealsEmptyCta}</a>
          <a class="btn-secondary" href="/extension">{COPY.account.dealsEmptyExtension}</a>
        </p>
      </div>
    );
  }

  const columns = stageColumns(deals);
  const parked = parkedDeals(deals);
  // The database's own counts when we have them; the rows on screen only as a
  // fallback for a board that answered before P11 shipped.
  const tallies = counts ?? boardCounts(deals);
  // P8 — the one thing that needs you, ranked over dates, unread changes,
  // stage-aware staleness and a decision resting on a guess.
  const today = todayLine({ deals, facts, changes, now });

  // Card is a render HELPER, invoked as Card({ d }) (not <Card/>), so it doesn't
  // create a child component whose identity changes every render — that would
  // unmount/remount every card on any state change, dropping keyboard focus mid-park
  // and aborting an in-progress drag. Called inline, its DOM is diffed and preserved.
  const Card = ({ d }: { d: BoardDeal }) => {
    const age = dwellState(d, now);
    const verdict = cardVerdict(d);
    const step = nextStepLine(d, now);
    const auctionWarn = auctionWarningDue(d);
    const busy = isBusy(d.id);
    return (
      <div
        key={d.id}
        id={`deal-${d.id}`}
        class={`deal-card glass age-${age}${dragId === d.id ? ' dragging' : ''}`}
        draggable={d.status === 'live' && !busy}
        onDragStart={(e) => { setDragId(d.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDragId(''); setDropStage(''); }}
      >
        {/* The link carries the FACT-CORRECTED params: once a quote exists, the
            analyser opens on the quote, not the original guess (P5). */}
        <a class="dc-title" href={dealHref(d.strategy, paramsFor(d), verdict.action === 'score' ? d.id : undefined, d.id, factsAsOf(d.id), factsFor(d.id).map((f) => f.fact_type))}>{d.title}</a>
        <span class="dc-meta">
          {verdict.scored && (
            <span class={`board-score ${verdict.cls}`} aria-label={BOARD_COPY.card.scoreLabel((d.current_score as number).toFixed(1))}>
              <span class="bs-dot" aria-hidden="true">●</span>
              <strong>{(d.current_score as number).toFixed(1)}</strong>
            </span>
          )}
          <span class="pill pill-current dc-strat">{strategyBadge(d.strategy)}</span>
        </span>

        {/* The VERDICT: is it good, and why — the analyser's own line, or an honest
            reason it can't be scored. Never a bare dash. */}
        <p class={`dc-verdict ${verdict.scored ? 'v-' + verdict.cls : 'v-unscored'}`}>{verdict.line}</p>

        {/* P7 — what that score rests on. Quiet, and never a second number. */}
        {features.evidenceChips && verdict.scored && (
          <EvidenceChips
            strategy={d.strategy}
            inputs={evidenceInputsFor({ ...d, url_params: paramsFor(d) }, factsFor(d.id))}
            score={(d.current_score as number).toFixed(1)}
            /* Pressable ONLY where the fact could actually be recorded: the facts
               feature on, and a deal still live. A bought or dead deal takes no
               new facts, so its chips stay inert rather than offering a door
               that is shut (P12). */
            onFix={features.dealFacts && isLive(d)
              ? (factType) => setFixFor({ dealId: d.id, factType })
              : undefined}
          />
        )}

        {auctionWarn && (
          <p class="dc-auction" role="note">⚠ {COPY.account.auctionWarning}</p>
        )}

        {step !== '' && <p class={`dc-step step-${age}`}>{step}</p>}

        {note && note.id === d.id && <p class="dc-note" role="status">{note.text}</p>}

        {/* P6 — the answer changed. It stays until it has been seen, and it is
            the first thing on the card after the verdict itself. */}
        {features.verdictChanges && unseen(changes, d.id).map((c) => (
          <DealChangeNote
            change={c}
            dealTitle={d.title}
            busy={busy}
            onDismiss={() => void dismissChange(d, c.id)}
            onPark={() => void parkKilled(d, c.id)}
          />
        ))}

        {/* D4 — the sold-price rule changed under a saved score. Say what it was
            and what it is now; never move the number without being asked. */}
        {(() => {
          const mv = moveFor(d);
          return mv === null ? null : (
            <div class="dc-moved" role="status">
              <p class="dc-moved-h">{SCORE_MOVED_COPY.heading}</p>
              <p class="dc-moved-line">{SCORE_MOVED_COPY.line(mv.from.toFixed(1), mv.to.toFixed(1))}</p>
              <p class="hint">{SCORE_MOVED_COPY.why}</p>
              <button
                type="button"
                class="btn-secondary"
                disabled={busy}
                aria-label={SCORE_MOVED_COPY.acceptLabel(d.title)}
                onClick={() => void acceptMove(d, mv)}
              >
                {busy ? SCORE_MOVED_COPY.busy : SCORE_MOVED_COPY.accept}
              </button>
            </div>
          );
        })()}

        {/* P11 — accepted is not safe. Once per deal, at the stage where deals
            actually die, and gone as soon as it has been read. */}
        {chainRiskDue(d) && (
          <ChainRiskCard dealTitle={d.title} busy={busy} onDismiss={() => void dismissChainRisk(d)} />
        )}

        {/* P11 — what it is worth NOW, and the words to ask for it. */}
        {(() => {
          const rt = retradeOn(d);
          return rt === null ? null : (
            <RetradeRadar
              maxOffer={rt.maxOffer === null ? null : fmtMoney(rt.maxOffer)}
              message={rt.message}
              busy={busy}
            />
          );
        })()}

        {/* Only a LIVE deal takes NEW facts: the pipeline ends at purchase, and a
            bought deal's score is the record of what you bought on. The facts
            already recorded are that record, so the list always stays — only the
            add and remove controls go (D3). */}
        {features.dealFacts && (
          <DealFacts
            dealId={d.id}
            dealTitle={d.title}
            strategy={d.strategy}
            facts={factsFor(d.id)}
            busy={busy}
            canAdd={isLive(d)}
            openWith={fixFor?.dealId === d.id ? fixFor.factType : ''}
            onOpened={() => setFixFor(null)}
            onAdd={(t, val, n) => addFact(d, t, val, n)}
            onRemove={(id) => removeFact(d, id)}
          />
        )}

        {features.dealDates && isLive(d) && (
          <DealDates
            dealId={d.id}
            dealTitle={d.title}
            stage={d.stage}
            isAuction={d.is_auction}
            dates={datesOf(d)}
            busy={busy}
            onSet={(key, value) => void setDate(d, key, value)}
          />
        )}

        {/* P10 — the dates, in the calendar they already check. Only offered when
            the deal actually holds one, and never promising the reminder. */}
        {features.calendarExport && features.dealDates && hasExportableDate(d) && (
          <CalendarButton
            dealTitle={d.title}
            build={() => icsFor(d)}
            filename={icsFilename(d.title)}
            busy={busy}
            onDone={(ok) => setNote({ id: d.id, text: ok ? CALENDAR.saved : CALENDAR.failed })}
          />
        )}

        {features.verdictChanges && verdict.scored && hasScoreHistory(d) && <ScoreHistory dealId={d.id} dealTitle={d.title} />}

        {/* A fact that cannot move this strategy's maths says why, and never
            invents a cost (P5). */}
        {features.dealFacts && evidenceUnknown(d) && d.current_score !== null && (
          <p class="dc-fact-note" role="note">{BOARD_COPY.card.factNoEvidence}</p>
        )}
        {features.dealFacts && factNotes(d.strategy, factsFor(d.id)).map((n) => (
          <p class="dc-fact-note" role="note">{n.label}: {n.note}</p>
        ))}

        {d.status === 'live' && (
          <>
            <div class="dc-actions">
              <label class="dc-move">
                <span class="sr-only">{BOARD_COPY.card.moveLabel(d.title)}</span>
                <select value={d.stage} disabled={busy} onChange={(e) => void moveTo(d, (e.target as HTMLSelectElement).value)}>
                  {PROGRESS_STAGES.map((s) => <option value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <button type="button" class="btn-link dc-park" disabled={busy} onClick={() => { setKillNote(''); setParkingId(parkingId === d.id ? '' : d.id); }}>{BOARD_COPY.card.park}</button>
            </div>
            {parkingId === d.id && (
              <div class="dc-park-reasons" role="group" aria-label={BOARD_COPY.card.parkReasonsLabel(d.title)}>
                {/* P9 — the note is OPTIONAL and above the chips, because a chip
                    IS the kill: tap one and it is done. Two taps, no essay. */}
                {features.dealGraveyard && (
                  <label class="dc-kill-note">
                    <span>{GRAVEYARD_COPY.noteLabel}</span>
                    <input
                      type="text"
                      maxLength={200}
                      value={killNote}
                      disabled={busy}
                      onInput={(e) => setKillNote((e.target as HTMLInputElement).value)}
                    />
                  </label>
                )}
                {PARK_REASONS.map((r) => (
                  <button type="button" class="chip" disabled={busy} onClick={() => void kill(d, r.key, killNote)}>{r.label}</button>
                ))}
                <button type="button" class="chip chip-cancel" onClick={() => setParkingId('')}>{BOARD_COPY.card.keepIt}</button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div class="board">
      {/* P12 — the heading, the attention line and the two quiet facts are ONE
          block with one rhythm; the gap below it is what separates the top of
          the page from the board. They used to be three things stacked up. */}
      <div class="board-head">
        <p class={`today-line${today.dealId ? ' today-act' : ''}`} role="status">{today.text}</p>
        {/* P8 rule 6 — the board can only say this when you open it. Nothing here
            reaches anybody: the app sends no email and runs nothing on your phone. */}
        <p class="today-only-here">{TODAY_COPY.onlyHere}</p>
        <p class="board-count">{counterLine(tallies, cap)}</p>
      </div>

      <div class="board-stages">
        {columns.map((col) => (
          <section
            key={col.stage.key}
            class={`board-col${dropStage === col.stage.key ? ' drop-target' : ''}`}
            aria-labelledby={`col-${col.stage.key}`}
            onDragOver={(e) => { if (dragId !== '') { e.preventDefault(); setDropStage(col.stage.key); } }}
            onDragLeave={() => setDropStage('')}
            onDrop={(e) => {
              e.preventDefault();
              const d = deals.find((x) => x.id === dragId);
              setDropStage('');
              if (d) void moveTo(d, col.stage.key);
            }}
          >
            <h2 class="board-col-h" id={`col-${col.stage.key}`}>
              {col.stage.label} <span class="board-col-n">{col.deals.length}</span>
            </h2>
            <div class="board-col-cards">
              {col.deals.map((d) => Card({ d }))}
            </div>
            {/* Bought deals are kept for ever too, so this column is a window as
                well — and says so rather than truncating quietly (P11 review). */}
            {col.stage.key === DONE_STAGE && more.done && (
              <button type="button" class="btn-link gy-more" disabled={loadingMore} onClick={() => void loadMore('done')}>
                {loadingMore ? BOARD_COPY.card.moreLoading : BOARD_COPY.card.more}
              </button>
            )}
          </section>
        ))}
      </div>

      {/* P9 — DEALS YOU KILLED. Reachable from the board in one tap, never
          cluttering it: it is collapsed until you ask for it, and dead deals
          have never counted against the 100 live cap. */}
      {features.dealGraveyard ? (
        <div id="graveyard">
          <Graveyard
            stones={headstones(deals, deaths)}
            total={tallies.dead}
            hasMore={more.dead}
            loadingMore={loadingMore}
            onMore={() => void loadMore('dead')}
            open={showParked}
            onToggle={() => setShowParked(!showParked)}
            note={boardNote}
            busy={isBusy}
            onRevive={(d) => void revive(d)}
          />
        </div>
      ) : parked.length > 0 && (
        <section class="board-parked">
          {boardNote !== '' && <p class="board-note" role="status">{boardNote}</p>}
          <button type="button" class="board-parked-toggle" aria-expanded={showParked} onClick={() => setShowParked(!showParked)}>
            {DEAD_STAGE.label} <span class="board-col-n">{Math.max(tallies.dead, parked.length)}</span>
            <span class="board-parked-caret" aria-hidden="true">{showParked ? '▾' : '▸'}</span>
          </button>
          {showParked && (
            <div class="board-col-cards board-parked-cards">
              {parked.map((d) => Card({ d }))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
