/**
 * The strategy switcher, pinned in the sticky stack (N3, features.segmentedStrategy).
 * ONE control for all four strategies, mounted once on the shared analyser
 * template — it shares the pinned row with the section chips so the whole stack
 * stays under 120px on a 390px screen.
 *
 * These are four LINKS to four URLs, not a tablist: each strategy is its own
 * page, so a tablist role would tell a screen reader there are panels here that
 * do not exist, and would cost Cmd-click / open-in-new-tab. Arrow keys move
 * between the segments the way a tablist does, and the current one is marked
 * aria-current="page". Every shared subject and comparables input rides across
 * in the query string (toQuery), so the other side re-scores the SAME property.
 */
import { strategies } from '@gil-bricks/core';
import { features } from '../../config/features';
import { STRATEGY_SWITCHER } from '../../config/analyserSections';
import { state, strategyParams, toQuery } from './state';

export function StrategySegments({ currentId }: { currentId: string | null }) {
  if (!features.segmentedStrategy) return null;
  // Other strategies get the SHARED inputs only (their own assumptions start
  // from their config defaults). The strategy you are already on keeps its own
  // too — and does not navigate at all, so tapping it can never wipe your work.
  const query = toQuery(state.value, {});
  const currentQuery = toQuery(state.value, strategyParams.value);

  const onKey = (e: KeyboardEvent): void => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-seg]'));
    const here = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (here === -1 || links.length === 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0
      : e.key === 'End' ? links.length - 1
      : e.key === 'ArrowRight' ? (here + 1) % links.length
      : (here - 1 + links.length) % links.length;
    links[next].focus();
  };

  return (
    <nav class="strategy-seg" aria-label={STRATEGY_SWITCHER.navLabel} onKeyDown={onKey}>
      {strategies.map((s) => (
        <a
          key={s.id}
          data-seg={s.id}
          class={s.id === currentId ? 'seg seg-current' : 'seg'}
          href={`${s.route}/analyser${s.id === currentId ? currentQuery : query}`}
          aria-current={s.id === currentId ? 'page' : undefined}
          onClick={s.id === currentId ? (e: Event) => e.preventDefault() : undefined}
        >
          {s.shortName ?? s.name}
          {s.id === currentId && <span class="sr-only"> ({STRATEGY_SWITCHER.currentHint})</span>}
        </a>
      ))}
    </nav>
  );
}
