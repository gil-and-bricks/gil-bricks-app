/**
 * The in-page opener (D1) — the closest thing Chrome permits to "the panel
 * opens itself".
 *
 * WHAT CHROME ALLOWS. `chrome.sidePanel.open()` "may only be called in response
 * to a user action" (Chrome docs), and the valid actions are: an action-icon
 * click, a keyboard shortcut, a context-menu selection, or a gesture on an
 * extension page OR A CONTENT SCRIPT — e.g. clicking a button we put on the
 * page. There is NO way to open a side panel on page load. So the panel cannot
 * open itself, but the listing page can carry one obvious button that opens it,
 * and the toolbar icon can wear a badge the moment a listing is detected.
 *
 * This module is the page half: a small chip, bottom-right, on LISTING pages
 * only. It carries the product's name so it never passes for the portal's own
 * UI, it disappears once the panel is open, "Hide" is remembered, and it adds
 * no permission — the content script already runs on these two hosts.
 */
export const OPEN_PANEL_MESSAGE = 'gb:open-panel' as const;
/** Sent by the panel itself when it loads: the button has nothing left to do. */
export const PANEL_OPEN_MESSAGE = 'gb:panel-open' as const;

/** Every word the chip can say, in one place. The product NAME is not here:
 *  it is passed in from coreConfig, so renaming the product is one edit. */
export const OPENER_COPY = {
  label: 'Analyse this deal',
  /** Said only if Chrome refuses the open (older Chrome, no gesture). */
  fallback: 'Click the toolbar icon to open',
  dismiss: 'Hide',
  dismissLabel: 'Hide this button',
  title: 'Open the deal analyser panel',
} as const;

const CHIP_ID = 'gb-open-panel';
/** Dismissed in this document. The durable half is the caller's onHide. */
let dismissed = false;
/** The panel is already open for this page, so the button is redundant. */
let panelOpen = false;

export interface OpenerDeps {
  /** Sends the open request to the service worker; resolves false if refused. */
  requestOpen: () => Promise<boolean>;
  doc: Document;
  /** Remembers a dismissal past this page — "Hide" has to mean hide. */
  onHide?: () => void;
  /** The product's name, from config — never typed in here (golden rule 4). */
  brand: string;
}

export function mountOpener({ requestOpen, doc, onHide, brand }: OpenerDeps): HTMLElement | null {
  if (dismissed || panelOpen || doc.getElementById(CHIP_ID) !== null) return null;

  const chip = doc.createElement('div');
  chip.id = CHIP_ID;
  chip.setAttribute('role', 'complementary');
  chip.setAttribute('aria-label', OPENER_COPY.title);

  const mark = doc.createElement('span');
  mark.className = 'gb-mark';
  mark.textContent = brand;

  const open = doc.createElement('button');
  open.type = 'button';
  open.className = 'gb-open';
  open.textContent = OPENER_COPY.label;
  open.title = OPENER_COPY.title;

  const hide = doc.createElement('button');
  hide.type = 'button';
  hide.className = 'gb-hide';
  hide.textContent = OPENER_COPY.dismiss;
  hide.setAttribute('aria-label', OPENER_COPY.dismissLabel);

  open.addEventListener('click', () => {
    void requestOpen().then((ok) => {
      // Opened: the button has done its job, so it gets out of the way.
      if (ok) { retireOpener(doc); return; }
      // Chrome refused (no gesture forwarded, or an older build): say what to
      // do instead rather than looking broken.
      open.textContent = OPENER_COPY.fallback;
    });
  });
  hide.addEventListener('click', () => {
    dismissed = true;
    chip.remove();
    onHide?.();
  });

  chip.append(mark, open, hide);
  doc.body.append(chip);
  return chip;
}

/**
 * The panel is open (however it was opened — our button or the toolbar icon),
 * so the button goes away for this page. It is not a dismissal: reload or open
 * another listing and it is offered again.
 */
export function retireOpener(doc: Document): void {
  doc.getElementById(CHIP_ID)?.remove();
  panelOpen = true;
}

/** Exported for tests: forget the dismissal. */
export function _resetOpener(): void {
  dismissed = false;
  panelOpen = false;
}

/** The chip's styles, scoped by id so nothing on the portal page is touched. */
export const OPENER_CSS = `
#${CHIP_ID} {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
  display: flex; align-items: center; gap: 8px;
  padding: 8px 8px 8px 12px; border-radius: 999px;
  background: #0d0018; border: 1px solid #dcff00;
  box-shadow: 0 6px 20px rgba(0,0,0,0.35);
  font: 600 14px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
}
#${CHIP_ID} .gb-open {
  all: unset; cursor: pointer; padding: 8px 14px; border-radius: 999px;
  background: #dcff00; color: #070014; font: inherit; min-height: 24px;
}
#${CHIP_ID} .gb-mark {
  color: #dcff00; font: 700 11px/1 system-ui, sans-serif;
  letter-spacing: 0.04em; text-transform: uppercase;
}
#${CHIP_ID} .gb-hide {
  all: unset; cursor: pointer; padding: 8px; border-radius: 999px;
  color: rgba(255,255,255,0.7); font: 500 13px/1.2 system-ui, sans-serif;
}
#${CHIP_ID} .gb-open:focus-visible, #${CHIP_ID} .gb-hide:focus-visible {
  outline: 2px solid #dcff00; outline-offset: 2px;
}
@media (max-width: 480px) { #${CHIP_ID} { right: 12px; bottom: 12px; } }
`;
