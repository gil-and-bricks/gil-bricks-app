/**
 * The verdict card shows two config-owned sentences: the binding constraint
 * (what is holding the deal back) and the lever (the change that would fix it).
 * On most strategies the binding note ENDS with the lever's own figures, so the
 * page said the same fix twice, back to back (D1). On Flip they are different
 * numbers — the score's threshold and the strategy's Green threshold — and both
 * are worth reading.
 *
 * So: hide the lever only when the note already names every figure it does.
 * This compares text; it never computes a figure (all maths is in core).
 */
const FIGURES = /£[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%/g;

export function leverIsRedundant(lever: string | null | undefined, note: string | null | undefined): boolean {
  if (!lever) return true;
  if (!note) return false;
  const inLever = lever.match(FIGURES) ?? [];
  if (inLever.length === 0) return false;
  return inLever.every((f) => note.includes(f));
}
