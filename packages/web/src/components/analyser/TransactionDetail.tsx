/** Render-on-demand transaction detail. Compliant links only:
 * Land Registry primary; portal LANDING pages, never internal URLs. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { COPY } from '../../config/copy';
import { COMPARABLES } from '../../config/comparables';
import { fmtMoney } from '@gil-bricks/core';
import { getTransaction, type TransactionDetail as Tx, OGL_ATTRIBUTION } from '@gil-bricks/core';
import { compLinks } from '@gil-bricks/core';
import { geocodePostcode } from '@gil-bricks/core';
import type { MapHandle } from './mapImpl';

/** Small non-interactive locator map — one lime pin, no gestures (S7.1). */
function MiniMap({ postcode }: { postcode: string }) {
  const el = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([geocodePostcode(postcode), import('./mapImpl')])
      .then(([geo, m]) => {
        if (cancelled || !el.current) return;
        handle.current = m.mountMap(
          el.current,
          { subject: { lat: geo.lat, lng: geo.lng }, radiusMiles: 0, comps: [], selectedId: null },
          { interactive: false, onBlank: () => !cancelled && setGone(true) },
        );
      })
      .catch(() => setGone(true));
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
  }, [postcode]);
  if (gone) return null;
  return <div class="mini-map" ref={el} aria-hidden="true" />;
}

const TYPE_LABEL: Record<string, string> = COMPARABLES.propertyTypes;

export function TransactionDetail() {
  const [tx, setTx] = useState<Tx | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { setErr('missing'); return; }
    getTransaction(id).then(setTx).catch(() => setErr('failed'));
  }, []);

  if (err) {
    const msg =
      err === 'missing'
        ? COPY.transaction.noId
        : COPY.transaction.failed;
    return (
      <section class="glass card">
        <h3 class="state-h">{COPY.transaction.failedTitle}</h3>
        <p class="field-error" role="alert">{msg}</p>
      </section>
    );
  }
  if (!tx) {
    return (
      <section class="glass card" aria-hidden="true">
        <div class="skeleton sk-title" /><div class="skeleton sk-line" /><div class="skeleton sk-line short" />
      </section>
    );
  }
  const links = compLinks(tx.transactionId);
  const addr = [tx.address.saon, tx.address.paon, tx.address.street].filter(Boolean).join(' ');
  return (
    <section class="glass card">
      <h2>{addr}</h2>
      <p class="page-sub">{tx.address.town} {tx.address.postcode}</p>
      <MiniMap postcode={tx.address.postcode} />
      <p class="big-figure">{fmtMoney(tx.price)}</p>
      <p>
        {COMPARABLES.transaction.sold} {tx.date} · {TYPE_LABEL[tx.propertyType] ?? tx.propertyType} · {tx.estateType || COMPARABLES.card.unknown} ·{' '}
        {tx.newBuild ? COMPARABLES.transaction.newBuild : COMPARABLES.transaction.existing} {tx.category === 'B' ? COMPARABLES.transaction.nonStandardSale : ''}
      </p>
      <div class="action-bar">
        <a class="btn-primary" href={links.landRegistry} rel="noopener" target="_blank">{COMPARABLES.transaction.landRegistryLink}</a>
        <a class="btn-secondary" href={links.zooplaHousePrices} rel="noopener" target="_blank">{COMPARABLES.transaction.zooplaLink}</a>
        <a class="btn-secondary" href={links.rightmoveHousePrices} rel="noopener" target="_blank">{COMPARABLES.transaction.rightmoveLink}</a>
      </div>
      <p class="hint">{OGL_ATTRIBUTION}</p>
    </section>
  );
}
