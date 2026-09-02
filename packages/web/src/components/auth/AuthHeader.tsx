/** Header auth state: "Log in" → login wall; signed in → avatar + My deals. */
import { useEffect } from 'preact/hooks';
import { loadMe, me, openLoginWall } from '../../lib/auth/session';

export function AuthHeader() {
  useEffect(() => {
    void loadMe();
  }, []);

  const v = me.value;
  if (v === undefined) return <span class="auth-slot" aria-hidden="true" />;
  if (v === null) {
    return (
      <button type="button" class="btn-secondary auth-login" onClick={openLoginWall}>
        Log in
      </button>
    );
  }
  return (
    <a class="auth-me" href="/account">
      {v.avatar !== '' && <img class="auth-avatar" src={v.avatar} alt="" width="28" height="28" referrerpolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).hidden = true)} />}
      <span>My deals</span>
    </a>
  );
}
