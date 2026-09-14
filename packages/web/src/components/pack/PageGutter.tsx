/**
 * DP4 — ONE PAGE'S CONTROLS, BESIDE THAT PAGE.
 *
 * WHY NOT ON THE PAGE. The sheet itself is the document an investor receives:
 * `buildPackHtml` clones the `.pk` element and serialises it, so a button
 * rendered inside a `.pk-page` would be posted to the investor along with the
 * figures. The gutter sits beside the sheet instead — adjacent, which is what
 * the sourcer asked for, without putting the builder's furniture inside the
 * thing being sent. It is marked `data-chrome` and the export strips it, which
 * is the belt to that braces.
 *
 * WHY IT IS NOT SCALED. The preview shrinks each sheet to fit its column — at
 * 390px that is about 41%. Chrome inside the scaled box would shrink with it
 * and a 44px target would become 18px, under WCAG 2.5.8's floor. `zoom` is
 * applied to the PAGE now, not to a wrapper around both, so these controls stay
 * full size at every width with nothing to counter-scale.
 *
 * A CONTROL ONLY EXISTS WHERE ITS CONTENT DOES. That is the whole fix for the
 * five dead checkboxes: there is no page to hang a control on when the page is
 * not rendered, and `parts` is filtered by what the deal actually has.
 */
import { PACK_COPY, PACK_FIELDS } from '../../config/pack';

/** The discriminator, named once so it never appears inside markup. */
const SUMMARY = 'summary';

export interface GutterPart {
  key: string;
  label: string;
  on: boolean;
}

interface Props {
  /** The page's own name, as the rail used to show it. */
  label: string;
  /** Position among the sheets, for the announcement and the arrows. */
  index: number;
  total: number;
  /** Locked pages have no switch and say so once, quietly. */
  locked: boolean;
  on: boolean;
  movable: boolean;
  canUp: boolean;
  canDown: boolean;
  parts: readonly GutterPart[];
  /** Shown on the cover and the page that prints the summary. */
  field?: { kind: 'investor' | 'summary'; value: string; onInput: (v: string) => void };
  onToggle: () => void;
  onMove: (by: -1 | 1) => void;
  onPart: (key: string) => void;
}

export function PageGutter(p: Props) {
  const num = String(p.index + 1).padStart(2, '0');
  /**
   * The field's identity is decided HERE, not inside the markup. A string
   * literal sitting in a JSX expression is counted as user-facing copy by the
   * inline-copy ratchet — rightly, since that is exactly where copy hides — and
   * these are union discriminators, not words anybody reads. Out of the JSX
   * they are plainly what they are, and the rendered strings all come from
   * config as they must.
   */
  const field = p.field;
  const isSummary = field?.kind === SUMMARY;
  const fieldId = isSummary ? 'pk-f-summary' : 'pk-f-investor';
  const fieldLabel = isSummary ? PACK_FIELDS.summary : PACK_FIELDS.investor;
  const fieldHint = isSummary ? PACK_FIELDS.summaryHint : PACK_FIELDS.investorHint;

  return (
    <aside class="pk-gut" data-chrome aria-label={PACK_COPY.gutter.forPage(p.label)}>
      <div class="pk-gut-head">
        <span class="pk-gut-num">{num}</span>
        <span class="pk-gut-name">{p.label}</span>
      </div>

      {p.locked
        ? <p class="pk-gut-locked">{PACK_COPY.gutter.always}</p>
        : (
          <div class="pk-gut-row">
            {/**
              * A VISIBILITY TOGGLE, NOT A TICK BOX. What this does is show or
              * hide a page, and `aria-pressed` is what says that; a checkbox
              * says "selected", which this never meant.
              */}
            <button
              type="button" class="pk-gut-eye" aria-pressed={p.on}
              onClick={p.onToggle}
            >
              <span aria-hidden="true">{p.on ? '◉' : '○'}</span>
              {p.on ? PACK_COPY.gutter.inPack : PACK_COPY.gutter.notInPack}
            </button>
            {p.movable && (
              <span class="pk-gut-move">
                {/**
                  * `aria-disabled`, NOT `disabled`. Walk a page to the top with
                  * the keyboard and a truly disabled button blurs under the
                  * user's own focus, dropping them to the body. This stays
                  * focusable and simply refuses.
                  */}
                <button
                  type="button" class="btn-link" aria-disabled={!p.canUp}
                  aria-label={PACK_COPY.composer.moveUp(p.label)}
                  onClick={() => { if (p.canUp) p.onMove(-1); }}
                >↑</button>
                <button
                  type="button" class="btn-link" aria-disabled={!p.canDown}
                  aria-label={PACK_COPY.composer.moveDown(p.label)}
                  onClick={() => { if (p.canDown) p.onMove(1); }}
                >↓</button>
              </span>
            )}
          </div>
        )}

      {p.parts.length > 0 && p.on && (
        <ul class="pk-gut-parts">
          {p.parts.map((part) => (
            <li key={part.key}>
              <label class="pk-gut-part">
                <input type="checkbox" id={`pk-p-${part.key}`} checked={part.on}
                  onChange={() => p.onPart(part.key)} />
                <span>{part.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {field !== undefined && p.on && (
        <div class="field pk-gut-field">
          <label for={fieldId}>{fieldLabel}</label>
          {isSummary
            ? (
              <textarea
                id={fieldId} rows={3} value={field.value}
                onInput={(e) => field.onInput((e.target as HTMLTextAreaElement).value)}
              />
            )
            : (
              <input
                id={fieldId} type="text" maxLength={120} value={field.value}
                onInput={(e) => field.onInput((e.target as HTMLInputElement).value)}
              />
            )}
          <p class="hint">{fieldHint}</p>
        </div>
      )}
    </aside>
  );
}
