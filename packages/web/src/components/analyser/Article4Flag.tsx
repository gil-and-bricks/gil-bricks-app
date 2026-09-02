/** Article 4 verdict flag for the HMO analyser (S7.2). Honest by construction —
 * see src/lib/map/article4.ts. Never claims certainty; always points at the council. */
import { useEffect, useState } from 'preact/hooks';
import { article4Flag, fetchArticle4AtPoint, type Article4Flag as Flag } from '../../lib/map/article4';

export function Article4Flag({ lat, lng, country }: { lat: number; lng: number; country: string }) {
  const [flag, setFlag] = useState<Flag | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (country === 'W92000004') {
      setFlag(article4Flag({ areas: [], ok: true }, country));
      return;
    }
    setFlag(null);
    void fetchArticle4AtPoint(lat, lng).then((r) => !cancelled && setFlag(article4Flag(r, country)));
    return () => {
      cancelled = true;
    };
  }, [lat, lng, country]);

  if (!flag) {
    return (
      <div class="a4-card">
        <div class="skeleton sk-line" />
      </div>
    );
  }
  const tone = flag.state === 'inside' ? (flag.mentionsHmo ? 'a4-warn' : 'a4-note') : 'a4-clear';
  return (
    <div class={`a4-card ${tone}`} role="status">
      <p class="a4-headline">
        <span aria-hidden="true">{flag.state === 'inside' ? '⚠︎ ' : ''}</span>
        {flag.headline}
      </p>
      <p class="field-hint">
        {flag.detail}{' '}
        <a href="https://www.gov.uk/find-local-council" target="_blank" rel="noopener">
          Find the council<span class="sr-only"> (opens in a new tab)</span> ↗
        </a>
      </p>
    </div>
  );
}
