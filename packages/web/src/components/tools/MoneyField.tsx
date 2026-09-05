/**
 * The money input every tool uses (T2). ONE of these, sharing the same three
 * pure functions from @gil-bricks/core as the analyser and the extension, so a
 * typed price reads as money everywhere and the caret never jumps.
 */
import { fmtMoneyInput, moneyCaret, parseMoneyInput } from '@gil-bricks/core';

export function MoneyField({ id, value, onValue }: { id: string; value: string; onValue: (raw: string) => void }) {
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
        const next = moneyCaret(typed, caret, formatted);
        requestAnimationFrame(() => {
          if (el.value === formatted) el.setSelectionRange(next, next);
        });
      }}
    />
  );
}
