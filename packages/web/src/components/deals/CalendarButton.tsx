/**
 * ADD TO CALENDAR (P10).
 *
 * The board can only tell you something when you open it. A viewing three weeks
 * out belongs in the calendar you already check, so this hands the dates over as
 * a .ics file — built in the browser, saved by the browser, no server anywhere
 * in the path.
 *
 * The copy is careful on purpose: the EVENT is ours to give, the REMINDER is
 * their calendar app's to honour. We never promise a reminder we cannot make.
 */
import { CALENDAR } from '../../config/pipeline';

export interface CalendarButtonProps {
  dealTitle: string;
  /** Builds the file on demand — nothing is generated until it is asked for. */
  build: () => string;
  filename: string;
  busy: boolean;
  onDone: (ok: boolean) => void;
}

export function CalendarButton({ dealTitle, build, filename, busy, onDone }: CalendarButtonProps) {
  const save = (): void => {
    let url = '';
    try {
      const text = build();
      if (text === '') { onDone(false); return; }
      url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
      onDone(true);
    } catch {
      onDone(false);
    } finally {
      // Always released, even if the click threw. On the next tick, because
      // Safari needs the object alive past the click (P10 review).
      if (url !== '') setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  };
  return (
    <div class="dc-cal">
      <button type="button" class="btn-link dc-cal-add" disabled={busy} onClick={save}>
        {CALENDAR.add}
        <span class="sr-only">{CALENDAR.addFor(dealTitle)}</span>
      </button>
      <span class="dc-cal-note">{CALENDAR.note}</span>
    </div>
  );
}
