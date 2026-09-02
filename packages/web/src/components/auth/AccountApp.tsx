/** /account island: profile, My deals, marketing-consent toggle, delete account. */
import { useEffect, useState } from 'preact/hooks';
import { loadMe, me, openLoginWall } from '../../lib/auth/session';
import { strategies } from '@gil-bricks/core';
import { dealShareText } from '../../lib/deals/deal';

interface Deal {
  id: string;
  strategy: string;
  title: string;
  url_params: string;
  key_figure: string;
  created_at: string;
}

const strategyBadge = (id: string): string =>
  id === 'comparables' ? 'Comps' : strategies.find((s) => s.id === id)?.shortName ?? id.toUpperCase();

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
      if (v === null) return;
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
      setDealNote(`Couldn't delete "${d.title}" — please try again.`);
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
        <h3 class="state-h">Sign in to see your deals</h3>
        <p class="hint">Your saved deals live here once you’re signed in — it’s free and takes one tap with Google.</p>
        <button type="button" class="btn-primary" onClick={openLoginWall}>Log in</button>
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
        setNote(!v.marketingConsent ? 'You’re on the list — we’ll email you when there’s something worth sending. Untick any time.' : 'Marketing emails off.');
      } else setNote('That did not save — please try again.');
    } catch {
      setNote('That did not save — please try again.');
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
      setNote('Delete failed — please try again.');
    } catch {
      setNote('Delete failed — please try again.');
    }
    setBusy(false);
  };

  return (
    <>
      <div class="glass card">
        <h2>Your account</h2>
        <p>
          {v.avatar !== '' && <img class="auth-avatar" src={v.avatar} alt="" width="36" height="36" referrerpolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).hidden = true)} />}{' '}
          <strong>{v.name || v.email}</strong>
          <br />
          <span class="hint">{v.email}</span>
        </p>
        <label class="wall-check">
          <input type="checkbox" checked={v.marketingConsent} disabled={busy} onChange={toggleMarketing} />
          <span>Send me property deals &amp; updates by email</span>
        </label>
        {note !== '' && <p class="hint" role="status">{note}</p>}
        <form method="post" action="/auth/logout">
          <button type="submit" class="btn-secondary">Log out</button>
        </form>
      </div>

      <div class="glass card">
        <h2>My deals</h2>
        {dealNote !== '' && <p class="hint" role="alert">{dealNote}</p>}
        {deals === null ? (
          <div aria-hidden="true">
            <div class="skeleton sk-line" />
            <div class="skeleton sk-line short" />
          </div>
        ) : deals === 'error' ? (
          <p class="hint" role="alert">Couldn't load your deals just now — refresh the page to retry.</p>
        ) : deals.length === 0 ? (
          <p class="hint">
            Nothing saved yet. Run a property through any <a href="/">analyser</a> and press Save — it'll appear here.
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
                  <a class="btn-secondary" href={dealUrl(d)}>Open</a>
                  <button type="button" class="btn-secondary" onClick={() => void shareDeal(d)}>Share</button>
                  {confirmDelete === d.id ? (
                    <>
                      <button
                        type="button"
                        class="btn-secondary"
                        aria-label={`Yes, delete ${d.title}`}
                        ref={(el) => el?.focus()}
                        onClick={() => void deleteDeal(d)}
                      >
                        Sure?
                      </button>
                      <button type="button" class="btn-secondary" aria-label={`Keep ${d.title}`} onClick={() => setConfirmDelete('')}>Keep</button>
                    </>
                  ) : (
                    <button type="button" class="btn-secondary" aria-label={`Delete ${d.title}`} onClick={() => setConfirmDelete(d.id)}>Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div class="glass card">
        <h2>Delete my account</h2>
        <p class="hint">Removes your account and saved deals, and queues an unsubscribe to our email provider. This cannot be undone.</p>
        {!confirming ? (
          <button type="button" class="btn-secondary" onClick={() => setConfirming(true)}>Delete my account</button>
        ) : (
          <>
            <p><strong>Are you sure?</strong> This deletes everything.</p>
            <button type="button" class="btn-secondary" disabled={busy} onClick={deleteAccount}>Yes — delete everything</button>{' '}
            <button type="button" class="btn-secondary" onClick={() => setConfirming(false)}>Keep my account</button>
          </>
        )}
      </div>
    </>
  );
}
