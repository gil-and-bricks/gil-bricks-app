/** The viewport width as a signal-ish hook: one listener, so a layout that
 * depends on width (the comparables cards, N3) re-renders when the phone turns.
 * SSR gets 0 — callers must treat that as "not narrow" and never guess. */
import { useEffect, useState } from 'preact/hooks';

export function useViewportWidth(): number {
  const [width, setWidth] = useState(typeof window === 'undefined' ? 0 : window.innerWidth);
  useEffect(() => {
    const update = (): void => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return width;
}
