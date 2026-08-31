/** /account island: profile, marketing-consent toggle, delete account. */
import { useEffect, useState } from 'preact/hooks';
import { loadMe, me, openLoginWall } from '../../lib/auth/session';

export function AccountApp() {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    void loadMe();
  }, []);

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
        <p>You're not signed in.</p>
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
        setNote(!v.marketingConsent ? 'You are on the list — emails start with the next sprint of the build.' : 'Marketing emails off.');
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
        <h2>Saved deals</h2>
        <p class="hint">Nothing saved yet — saving arrives in the next sprint. Your analyses live safely in their links meanwhile.</p>
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
