/**
 * F1 — THE FLOOR PLAN SECTION on the analyser, and the ONLY place the rest of
 * the web app touches the floor-plan module.
 *
 * It is a thin wrapper on purpose: the module is hand-rolled DOM with no
 * framework of its own, so it is mounted into a ref rather than rewritten in
 * Preact. That keeps the module free of any dependency on how this app happens
 * to render today, which is what lets it be lifted out whole.
 *
 * THE BACKDROP IS THE AGENT'S, FROM THE AGENT'S SERVER. The extension carries
 * its URL over in the handoff (`fp`) with every other field, so it arrives at no
 * extra tap. Nothing here fetches it; the browser renders it exactly as the
 * listing page did. What is saved is geometry.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  FLOORPLAN_COPY as C, createChrome, createSurface, fromStorable, isDisplayableImageUrl,
  planFrom, printSheet, shareText, toStorable, type SavedPlan, type Surface,
} from '../../floorplan';
import { openWhatsApp } from '../../lib/share/whatsapp';
import { features } from '../../config/features';

const param = (k: string): string => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(k) ?? '';
};

export function FloorPlanCard({ areaSqm, areaSource, address }: {
  areaSqm: number | null;
  areaSource: string;
  address: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<Surface | null>(null);
  const [open, setOpen] = useState(false);
  const [backdropFailed, setBackdropFailed] = useState(false);
  const [note, setNote] = useState('');
  const [tick, setTick] = useState(0);

  const dealId = param('deal');
  const planUrl = param('fp');
  const hasBackdrop = isDisplayableImageUrl(planUrl);

  useEffect(() => {
    if (!open || host.current === null) return;
    const box = host.current;
    box.textContent = '';
    const known = areaSqm !== null && areaSqm > 0 && areaSource !== 'none' && areaSource !== 'floorplan'
      ? { sqm: areaSqm, source: areaSource }
      : null;

    let cancelled = false;
    const build = (initial: ReturnType<typeof fromStorable> | null): void => {
      if (cancelled) return;
      const surface = createSurface({
        imageUrl: hasBackdrop ? planUrl : '',
        known,
        initial,
        onChange: () => { chrome.sync(surface.state()); setTick((t) => t + 1); },
        onBackdropError: () => setBackdropFailed(true),
      });
      const chrome = createChrome(surface);
      surfaceRef.current = surface;
      box.append(surface.element, chrome.element);
    };

    // F1 — reopen whatever was saved for this deal. The backdrop is not needed
    // for it to render: every room is stored in its own coordinate space with
    // the scale beside it, which is the whole reason geometry is what we keep.
    if (dealId !== '') {
      fetch(`/api/deals/${dealId}/floorplan`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { plan?: string | null } | null) => {
          const raw = body?.plan ?? null;
          build(raw === null ? null : fromStorable(JSON.parse(raw) as SavedPlan, known));
        })
        .catch(() => build(null));
    } else {
      build(null);
    }
    return () => { cancelled = true; surfaceRef.current?.destroy(); surfaceRef.current = null; };
  }, [open, planUrl, dealId, areaSqm, areaSource]);

  if (!features.floorPlan) return null;

  const surface = surfaceRef.current;
  const plan = surface === null ? null : planFrom(surface.state());

  const save = async (): Promise<void> => {
    if (surface === null || dealId === '') return;
    setNote(C.saving);
    try {
      const res = await fetch(`/api/deals/${dealId}/floorplan`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ plan: JSON.stringify(toStorable(surface.state())) }),
      });
      setNote(res.ok ? C.saved : C.saveFailed);
    } catch {
      setNote(C.saveFailed);
    }
  };

  const share = (): void => {
    if (plan === null) return;
    openWhatsApp(shareText(plan, address));
  };

  return (
    <section class="glass card floorplan-card" id="sec-floorplan" aria-labelledby="fp-h">
      <h2 id="fp-h">{C.section}</h2>
      {!open && (
        <>
          <p class="hint">{C.intro}</p>
          {!hasBackdrop && <p class="hint">{C.noBackdrop}</p>}
          <button type="button" class="tp-btn tp-btn-primary" onClick={() => setOpen(true)}>{C.open}</button>
        </>
      )}
      {open && (
        <>
          {backdropFailed && <p class="hint" role="status">{C.backdropFailed}</p>}
          {!hasBackdrop && <p class="hint">{C.noBackdrop}</p>}
          <div ref={host} class="traceplan" />
          <div class="tp-accept">
            {dealId !== '' && <button type="button" class="tp-btn tp-btn-primary" onClick={() => { void save(); }} disabled={plan === null}>{C.result.save}</button>}
            <button type="button" class="tp-btn" onClick={() => window.print()} disabled={plan === null}>{C.print.open}</button>
            <button type="button" class="tp-btn" onClick={share} disabled={plan === null}>{C.share.button}</button>
            <button type="button" class="tp-btn tp-btn-quiet" onClick={() => setOpen(false)}>{C.close}</button>
          </div>
          {note !== '' && <p class="hint" role="status">{note}</p>}
          <p class="tp-caveat">{C.imageNote}</p>
          {plan !== null && <PrintSheet plan={surface} address={address} tick={tick} />}
        </>
      )}
    </section>
  );
}

/**
 * F1 — THE PRINT SHEET. Rendered from OUR geometry only: the agent's image is
 * not in it, cannot be in it, and a test asserts so. Hidden on screen and shown
 * only to the printer, so "Print" needs no second page and no round trip.
 */
function PrintSheet({ plan, address, tick }: { plan: Surface | null; address: string; tick: number }) {
  if (plan === null) return null;
  const sheet = printSheet(plan.state());
  if (sheet === null) return null;
  const when = new Date().toLocaleDateString('en-GB');
  const one = (n: number): string => n.toFixed(1);
  return (
    <div class="fp-print" aria-hidden="true" data-tick={tick}>
      <h1 class="fp-print-title">{C.print.title}</h1>
      <p class="fp-print-sub">{address}</p>
      <p class="fp-print-sub">{C.print.dated(when)} · {C.print.totalLine(one(sheet.totalSqm))}</p>
      {sheet.levels.map((level) => {
        const xs = level.rooms.flatMap((r) => r.points.map((p) => p.x));
        const ys = level.rooms.flatMap((r) => r.points.map((p) => p.y));
        const minX = Math.min(...xs); const maxX = Math.max(...xs);
        const minY = Math.min(...ys); const maxY = Math.max(...ys);
        const w = Math.max(maxX - minX, 1); const h = Math.max(maxY - minY, 1);
        return (
          <section class="fp-print-level" key={level.name}>
            <h2 class="fp-print-level-name">{C.print.levelHeading(level.name)}</h2>
            <p class="fp-print-sub">{C.print.totalLine(one(level.totalSqm))}</p>
            <svg class="fp-print-svg" viewBox={`${minX - 8} ${minY - 8} ${w + 16} ${h + 16}`} role="img" aria-label={level.name}>
              {level.rooms.map((room) => (
                <g key={room.name}>
                  <polygon class="fp-print-room" points={room.points.map((p) => `${p.x},${p.y}`).join(' ')} />
                  <text
                    class="fp-print-label"
                    x={room.points.reduce((a, p) => a + p.x, 0) / room.points.length}
                    y={room.points.reduce((a, p) => a + p.y, 0) / room.points.length}
                    text-anchor="middle"
                  >
                    {room.name} · {one(room.areaSqm)} m²
                  </text>
                </g>
              ))}
            </svg>
          </section>
        );
      })}
      <p class="fp-print-caveat">{C.print.caveat}</p>
    </div>
  );
}
