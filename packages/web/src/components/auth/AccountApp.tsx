/** /account island: profile, My deals, marketing-consent toggle, delete account. */
import { useEffect, useState } from 'preact/hooks';
import { ACCOUNT } from '../../config/account';
import { COPY } from '../../config/copy';
import { loadMe, me, openLoginWall } from '../../lib/auth/session';
import { strategies } from '@gil-bricks/core';
import { dealShareText } from '../../lib/deals/deal';
import { features } from '../../config/features';

interface Deal {
  id: string;
  strategy: string;
  title: string;
  url_params: string;
  key_figure: string;
  created_at: string;
}

const strategyBadge = (id: string): string =>
  id === 'comparables' ? ACCOUNT.deals.compsBadge : strategies.find((s) => s.id === id)?.shortName ?? id.toUpperCase();

const dealUrl = (d: Deal): string => {
  const route = strategies.find((s) => s.id === d.strategy)?.route;
  const base = route ? `${route}/analyser` : '/comparables';
  return d.url_params !== '' ? `${base}?${d.url_params}` : base;
};

const dateLabel = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function AccountApp() {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [deals, setDeals] = useState<Deal[] | null | 'error'>(null);
  const [confirmDelete, setConfirmDelete] = useState('');

  useEffect(() => {
    void loadMe().then((v) => {
      // Pipeline ON: deals live on the board (/deals), not this flat list — so
      // don't fetch it here. Flag OFF: exactly today's behaviour.
      if (v === null || features.dealPipeline) return;
      fetch('/api/deals')
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then((b: { deals: Deal[] }) => setDeals(b.deals))
        .catch(() => setDeals('error')); // an error must never look like "nothing saved" 
    });
  }, []);

  const shareDeal = async (d: Deal) => {
    const text = dealShareText(d.title, d.key_figure, `${location.origin}${dealUrl(d)}`);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* fall through */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const [dealNote, setDealNote] = useState('');
  const deleteDeal = async (d: Deal) => {
    const res = await fetch(`/api/deals/${d.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      setDeals((cur) => (Array.isArray(cur) ? cur.filter((x) => x.id !== d.id) : cur));
      setDealNote('');
    } else {
      setDealNote(ACCOUNT.deals.deleteFailed(d.title));
    }
    setConfirmDelete('');
  };

  const v = me.value;
  if (v === undefined) {
    return (
      <div class="glass card" aria-hidden="true">
        <div class="skeleton sk-title" />
        <div class="skeleton sk-line" />
      </div>
    );
  }
  if (v === null) {
    return (
      <div class="glass card">
        <h3 class="state-h">{ACCOUNT.signedOut.heading}</h3>
        <p class="hint">{COPY.account.signInToSave}</p>
        <button type="button" class="btn-primary" onClick={openLoginWall}>{ACCOUNT.signedOut.logIn}</button>
      </div>
    );
  }

  const toggleMarketing = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ marketing: !v.marketingConsent }),
      });
      if (res.ok) {
        me.value = { ...v, marketingConsent: !v.marketingConsent };
        setNote(!v.marketingConsent ? COPY.account.signedUp : ACCOUNT.profile.marketingOff);
      } else setNote(ACCOUNT.profile.saveFailed);
    } catch {
      setNote(ACCOUNT.profile.saveFailed);
    }
    setBusy(false);
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (res.ok) {
        location.href = '/';
        return;
      }
      setNote(ACCOUNT.deleteAccount.failed);
    } catch {
      setNote(ACCOUNT.deleteAccount.failed);
    }
    setBusy(false);
  };

  return (
    <>
      <div class="glass card">
        <h2>{ACCOUNT.profile.heading}</h2>
        <p>
          {v.avatar !== '' && <img class="auth-avatar" src={v.avatar} alt="" width="36" height="36" referrerpolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).hidden = true)} />}{' '}
          <strong>{v.name || v.email}</strong>
          <br />
          <span class="hint">{v.email}</span>
        </p>
        <label class="wall-check">
          <input type="checkbox" checked={v.marketingConsent} disabled={busy} onChange={toggleMarketing} />
          <span>{ACCOUNT.profile.marketing}</span>
        </label>
        {note !== '' && <p class="hint" role="status">{note}</p>}
        <form method="post" action="/auth/logout">
          <button type="submit" class="btn-secondary">{ACCOUNT.profile.logOut}</button>
        </form>
      </div>

      {features.dealPipeline ? (
        <div class="glass card">
          <h2>{ACCOUNT.pipeline.heading}</h2>
          <p class="hint">{ACCOUNT.pipeline.lead}{' '}<a href="/deals">{ACCOUNT.pipeline.link}</a>{' '}{ACCOUNT.pipeline.tail}</p>
          <a class="btn-primary" href="/deals">{ACCOUNT.pipeline.cta}</a>
        </div>
      ) : (
      <div class="glass card">
        <h2>{ACCOUNT.deals.heading}</h2>
        {dealNote !== '' && <p class="hint" role="alert">{dealNote}</p>}
        {deals === null ? (
          <div aria-hidden="true">
            <div class="skeleton sk-line" />
            <div class="skeleton sk-line short" />
          </div>
        ) : deals === 'error' ? (
          <p class="hint" role="alert">{ACCOUNT.deals.loadFailed}</p>
        ) : deals.length === 0 ? (
          <p class="hint">
            {ACCOUNT.deals.emptyLead}{' '}<a href="/">{ACCOUNT.deals.emptyLink}</a>{' '}{ACCOUNT.deals.emptyTail}
          </p>
        ) : (
          <ul class="deals-list">
            {deals.map((d) => (
              <li class="deal-row">
                <div class="deal-main">
                  <span class="pill pill-current deal-badge">{strategyBadge(d.strategy)}</span>
                  <div>
                    <strong>{d.title}</strong>
                    <p class="hint">
                      {dateLabel(d.created_at)}
                      {d.key_figure !== '' && <> · {d.key_figure}</>}
                    </p>
                  </div>
                </div>
                <div class="deal-actions">
                  <a class="btn-secondary" href={dealUrl(d)}>{ACCOUNT.deals.open}</a>
                  <button type="button" class="btn-secondary" onClick={() => void shareDeal(d)}>{ACCOUNT.deals.share}</button>
                  {confirmDelete === d.id ? (
                    <>
                      <button
                        type="button"
                        class="btn-secondary"
                        aria-label={ACCOUNT.deals.confirmAria(d.title)}
                        ref={(el) => el?.focus()}
                        onClick={() => void deleteDeal(d)}
                      >
                        {ACCOUNT.deals.confirm}
                      </button>
                      <button type="button" class="btn-secondary" aria-label={ACCOUNT.deals.keepAria(d.title)} onClick={() => setConfirmDelete('')}>{ACCOUNT.deals.keep}</button>
                    </>
                  ) : (
                    <button type="button" class="btn-secondary" aria-label={ACCOUNT.deals.deleteAria(d.title)} onClick={() => setConfirmDelete(d.id)}>{ACCOUNT.deals.delete}</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      <div class="glass card">
        <h2>{ACCOUNT.deleteAccount.heading}</h2>
        <p class="hint">{COPY.account.deleteWarning}</p>
        {!confirming ? (
          <button type="button" class="btn-secondary" onClick={() => setConfirming(true)}>{ACCOUNT.deleteAccount.start}</button>
        ) : (
          <>
            <p><strong>{ACCOUNT.deleteAccount.sureLead}</strong>{' '}{ACCOUNT.deleteAccount.sureTail}</p>
            <button type="button" class="btn-secondary" disabled={busy} onClick={deleteAccount}>{ACCOUNT.deleteAccount.confirm}</button>{' '}
            <button type="button" class="btn-secondary" onClick={() => setConfirming(false)}>{ACCOUNT.deleteAccount.cancel}</button>
          </>
        )}
      </div>
    </>
  );
}
