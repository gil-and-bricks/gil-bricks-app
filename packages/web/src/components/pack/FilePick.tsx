/**
 * DP3 — A FILE PICKER THAT LOOKS LIKE THE REST OF THE APP.
 *
 * The builder had two raw `<input type="file">` controls on it, which render as
 * the operating system's own grey "Choose File — No file chosen" widget: a
 * different font, a different corner radius and a different grey from every
 * other control on the site. On a screen whose whole job is to persuade a
 * sourcer that this product is worth sending to an investor, it was the single
 * most obviously unfinished thing on the page.
 *
 * THE INPUT IS STILL A REAL FILE INPUT. It is visually hidden, not replaced —
 * the label is its label, so a click, a tap, a tab-and-space and a screen
 * reader all behave exactly as the platform intends. Nothing here reimplements
 * what a file input already does.
 */
import { useRef, useState } from 'preact/hooks';

interface Props {
  id: string;
  accept: string;
  label: string;
  multiple?: boolean;
  onFiles: (files: FileList | null) => void;
}

export function FilePick({ id, accept, label, multiple = false, onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState(0);

  return (
    <span class="pk-filepick">
      <input
        ref={input} id={id} type="file" accept={accept} multiple={multiple} class="sr-only"
        onChange={(e) => {
          const files = (e.target as HTMLInputElement).files;
          setChosen(files?.length ?? 0);
          onFiles(files);
          // Picking the same file twice in a row must fire onChange twice.
          (e.target as HTMLInputElement).value = '';
        }}
      />
      <label class="btn-secondary pk-filepick-btn" for={id}>{label}</label>
      {chosen > 0 && <span class="sr-only" role="status">{chosen}</span>}
    </span>
  );
}
