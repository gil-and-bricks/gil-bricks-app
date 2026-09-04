/** 'i' tooltip: hover + focus + tap, aria-describedby, dismissible
 * (Esc anywhere, tap outside, pointer-leave of the whole bubble). */
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { pinnedStackPx } from '../../lib/analyserSections';

export function Tooltip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Bubbles open upward by default; near the top of the screen there is no room
  // (the sticky verdict bar paints above every card), so they flip downward.
  const [below, setBelow] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) {
      setBelow(false);
      return;
    }
    const el = bubbleRef.current;
    if (!el) return;
    setBelow(el.getBoundingClientRect().top < pinnedStackPx());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onDocClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onDocClick);
    };
  }, [open]);

  return (
    <span
      class="tip-wrap"
      ref={wrapRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        class="tip-btn"
        aria-label="What does this mean?"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
      >
        i
      </button>
      {open && (
        <span role="tooltip" id={id} ref={bubbleRef} class={below ? 'tip-bubble tip-below' : 'tip-bubble'}>
          {text}
        </span>
      )}
    </span>
  );
}
