/** 'i' tooltip: hover + focus + tap, aria-describedby, dismissible
 * (Esc anywhere, tap outside, pointer-leave of the whole bubble). */
import { useEffect, useId, useRef, useState } from 'preact/hooks';

export function Tooltip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

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
        <span role="tooltip" id={id} class="tip-bubble">
          {text}
        </span>
      )}
    </span>
  );
}
