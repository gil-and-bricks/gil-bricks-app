/**
 * A money field: shows "£69,995" while you type, stores the digits (F1). The
 * formatting and the caret maths come from @gil-bricks/core, so every money
 * field in the app behaves identically. State and the URL only see raw digits.
 */
import { fmtMoneyInput, moneyCaret, parseMoneyInput } from '@gil-bricks/core';

export function MoneyInput({ id, value, onValue, onEdited }: {
  id: string;
  /** Raw digits, as held in state and in the URL. */
  value: string;
  onValue: (raw: string) => void;
  onEdited?: () => void;
}) {
  return (
    <input
      id={id}
      inputMode="numeric"
      autocomplete="off"
      value={fmtMoneyInput(value)}
      onInput={(e) => {
        const el = e.target as HTMLInputElement;
        const typed = el.value;
        const caret = el.selectionStart ?? typed.length;
        const raw = parseMoneyInput(typed);
        const formatted = fmtMoneyInput(raw);
        onValue(raw);
        onEdited?.();
        // keep the caret on the same DIGIT after the separators move
        const next = moneyCaret(typed, caret, formatted);
        requestAnimationFrame(() => {
          if (el.value === formatted) el.setSelectionRange(next, next);
        });
      }}
    />
  );
}
