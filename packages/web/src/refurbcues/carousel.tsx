/**
 * R3 — THE LISTING'S PHOTOS, ONE AT A TIME, with the costs underneath.
 *
 * WHY THIS SHAPE. People assess a refurb by scrolling the photos and adding up
 * what they see. The itemised list is unchanged and always one tap away — this
 * is a second way to reach the same checkboxes, not a replacement.
 *
 * THE IMAGE IS THE PORTAL'S. `<img src>` at their own server, carried over in
 * the handoff as an address. Never fetched by us, never stored, never drawn to
 * a canvas — the same position F1 established for the floor plan, tested the
 * same way.
 *
 * NOTHING IS DETECTED. The user taps which room a photo shows. We cannot look
 * at a photograph and must never imply we have.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { REFURB_PHOTOS as P, REFURB_ITEMS } from '../config/refurb';
import { REGULATIONS } from './library';
import { nextCue, exhausted } from './select';
import { CUE_ROOMS, type CueRoom, type RefurbCue } from './types';

export interface CarouselProps {
  /** Portal URLs, from the handoff. Never bytes. */
  photos: readonly string[];
  /** What this person has already been shown, read once for the session. */
  seen: ReadonlySet<string>;
  /** Called when a pointer is shown, so the session can batch it at the end. */
  onCueShown: (key: string) => void;
  /** Tick the cost item a pointer implicates. */
  onTickItem: (itemKey: string) => void;
  /** Which cost items are ticked, so a pointer can say so. */
  tickedItems: ReadonlySet<string>;
}

const itemLabel = (key: string): string => REFURB_ITEMS.find((i) => i.key === key)?.label ?? key;

export function PhotoCarousel({ photos, seen, onCueShown, onTickItem, tickedItems }: CarouselProps) {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const [rooms, setRooms] = useState<Record<number, CueRoom>>({});
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  /** Cues shown on THIS property, so one photo never repeats another's. */
  const shownHere = useRef<Set<string>>(new Set());
  /** The cue chosen for each photo, held so it does not reshuffle on re-render. */
  const chosen = useRef<Map<number, RefurbCue | null>>(new Map());

  const room = rooms[index] ?? null;
  const key = `${index}:${room ?? ''}`;
  const cached = chosen.current.get(index);
  const cue = cached !== undefined && cached?.room === (room ?? cached?.room)
    ? cached
    : nextCue(room, seen, shownHere.current);

  useEffect(() => {
    if (cue === null) return;
    if (chosen.current.get(index)?.key === cue.key) return;
    chosen.current.set(index, cue);
    shownHere.current.add(cue.key);
    onCueShown(cue.key);
  }, [key, cue?.key]);

  if (photos.length === 0) {
    return <p class="hint rc-none">{P.none}</p>;
  }

  const go = (d: number): void => setIndex((i) => Math.min(Math.max(i + d, 0), photos.length - 1));

  return (
    <section class="rc" aria-labelledby="rc-h">
      <div class="rc-head">
        <h4 id="rc-h">{P.heading}</h4>
        <button type="button" class="tp-btn tp-btn-quiet" aria-expanded={open} aria-controls="rc-body"
          onClick={() => setOpen(!open)}>{open ? P.hide : P.show}</button>
      </div>
      {/* Said ONCE, where the photos are. The whole honesty position. */}
      <p class="rc-caveat">{P.caveat}</p>

      <div id="rc-body" hidden={!open}>
        <div class="rc-stage">
          <button type="button" class="rc-arrow" aria-label={P.prev} disabled={index === 0} onClick={() => go(-1)}>‹</button>
          {failed[index] === true
            ? <p class="hint rc-failed">{P.failed}</p>
            : (
              <img
                class="rc-photo"
                src={photos[index]}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setFailed((f) => ({ ...f, [index]: true }))}
              />
            )}
          <button type="button" class="rc-arrow" aria-label={P.next} disabled={index >= photos.length - 1} onClick={() => go(1)}>›</button>
        </div>
        <p class="rc-counter" role="status">{P.counter(index + 1, photos.length)}</p>

        {/* The room is TAPPED. Nothing is detected, and the copy says so. */}
        <fieldset class="rc-rooms">
          <legend class="rc-legend">{P.roomLabel}</legend>
          {CUE_ROOMS.map((r) => (
            <button
              key={r}
              type="button"
              class={`rc-room${room === r ? ' is-on' : ''}`}
              aria-pressed={room === r}
              onClick={() => { chosen.current.delete(index); setRooms((m) => ({ ...m, [index]: r })); }}
            >{P.roomNames[r]}</button>
          ))}
        </fieldset>

        <div class="rc-tip" role="region" aria-label={P.tip.heading}>
          {cue === null
            ? <p class="hint">{exhausted(room, seen) ? P.tip.exhausted : P.tip.none}</p>
            : (
              <>
                <p class="rc-tip-conf">{P.tip.confidence[cue.confidence]}</p>
                <p class="rc-tip-look">{cue.look}</p>
                <p class="rc-tip-means">{cue.means}</p>
                <p class="rc-tip-caveat"><strong>{P.tip.caveatLabel}:</strong> {cue.caveat}</p>
                {REGULATIONS[cue.regulation] && (
                  <p class="rc-tip-reg">{P.tip.regulation(REGULATIONS[cue.regulation].name, REGULATIONS[cue.regulation].lastChecked)}</p>
                )}
                {/* THE LOOP: you see it, you tick it, the total moves, the deal re-scores. */}
                <button
                  type="button"
                  class="tp-btn tp-btn-primary rc-tick"
                  disabled={tickedItems.has(cue.costItem)}
                  onClick={() => onTickItem(cue.costItem)}
                >
                  {tickedItems.has(cue.costItem) ? P.tip.ticked(itemLabel(cue.costItem)) : P.tip.tick(itemLabel(cue.costItem))}
                </button>
              </>
            )}
        </div>
      </div>
    </section>
  );
}
