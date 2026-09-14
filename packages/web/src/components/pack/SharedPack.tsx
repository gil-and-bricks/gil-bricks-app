/**
 * DP4 — the read-only pack behind a share link.
 *
 * It renders the SAME `PackDocument` the builder previews, from the contents
 * saved against the deal, with no chrome passed — so the investor gets the
 * document and none of the builder's furniture, by construction rather than by
 * stripping.
 */
import { useEffect, useState } from 'preact/hooks';
import { PACK_COPY } from '../../config/pack';
import { PackDocument, type PackModel } from './PackDocument';

export function SharedPack() {
  const [model, setModel] = useState<PackModel | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = location.pathname.replace(/^\/p\//, '').replace(/\/$/, '');
    if (token === '') { setFailed(true); return; }
    let live = true;
    void fetch(`/api/pack/shared/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('gone'))))
      .then((body) => { if (live) setModel(body as PackModel); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed) return <p class="pk-shared-msg">{PACK_COPY.shared.gone}</p>;
  if (model === null) return <p class="pk-shared-msg">{PACK_COPY.shared.loading}</p>;
  return <div class="pk-shared"><PackDocument model={model} /></div>;
}
