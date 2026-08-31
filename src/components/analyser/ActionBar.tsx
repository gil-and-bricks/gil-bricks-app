import { useEffect, useState } from 'preact/hooks';
import { loadMe, me, openLoginWall } from '../../lib/auth/session';
import { fmtMoney } from '../../lib/maths/format';
import type { ComparablesResult } from '../../lib/comparables/engine';
import type { Valuation } from '../../lib/valuation/engine';

export function ActionBar({ valuation, comps }: { valuation: Valuation | null; comps: ComparablesResult | null }) {
  const [copied, setCopied] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  useEffect(() => {
    void loadMe();
  }, []);

  const summary = () => {
    const bits: string[] = [];
    if (comps) bits.push(`${comps.subject.postcode}`);
    if (valuation) bits.push(`est ${fmtMoney(valuation.estimate)} (${valuation.range.label})`);
    if (comps && comps.stats.typicalPrice !== null) bits.push(`${comps.stats.count} comps, typical ${fmtMoney(comps.stats.typicalPrice)}`);
    return bits.join(' — ');
  };

  const share = async () => {
    const text = `${summary()} ${location.href}`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* fall through */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div class="action-bar">
      <button type="button" class="btn-primary" onClick={share}>Share on WhatsApp</button>
      <button type="button" class="btn-secondary" onClick={copyLink}>{copied ? 'Copied ✓' : 'Copy link'}</button>
      <button
        type="button"
        class="btn-secondary"
        onClick={() => {
          // me may still be loading on a fast click — resolve it, then act
          void loadMe().then((v) => {
            if (v === null) openLoginWall();
            else setSaveNote('Saving arrives in the next sprint — your analysis is safe in this link.');
          });
        }}
      >
        Save
      </button>
      <button type="button" class="btn-secondary" disabled aria-describedby="pdf-soon">PDF</button>
      <span id="pdf-soon" class="hint" role="status">{saveNote !== '' ? saveNote : 'PDF export — coming soon.'}</span>
    </div>
  );
}
