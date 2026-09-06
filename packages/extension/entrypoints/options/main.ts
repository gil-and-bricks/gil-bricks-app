/**
 * THE EXTENSION'S OWN SETTINGS PAGE (P10 review).
 *
 * The daily badge has to be switchable off "in one tap", and the side panel only
 * opens on a Rightmove or Zoopla page — so the panel alone would have meant
 * hunting for a listing before you could turn something off. This is the page
 * Chrome itself offers (right-click the icon → Options, or the Details screen),
 * and it carries the same one switch and the same honest sentence.
 *
 * No copy is written here: every word comes from src/attention.ts and coreConfig.
 */
import { coreConfig } from '@gil-bricks/core';
import { ATTENTION_COPY } from '../../src/attention';
import { getReminders, setReminders } from '../../src/store';

const app = document.getElementById('app')!;
document.title = `${coreConfig.siteName} — ${ATTENTION_COPY.settings}`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

async function render(): Promise<void> {
  app.textContent = '';
  const h1 = el('h1', undefined, coreConfig.siteName);
  const maker = el('p', 'maker', `by ${coreConfig.makerName}`);

  const row = el('div', 'row');
  const label = el('label', undefined, ATTENTION_COPY.settings);
  label.setAttribute('for', 'reminders');
  const box = el('input');
  box.id = 'reminders';
  box.type = 'checkbox';
  box.checked = await getReminders();

  const note = el('p', 'note', ATTENTION_COPY.reach);
  note.id = 'reach';
  box.setAttribute('aria-describedby', note.id);

  const said = el('p', 'saved');
  said.setAttribute('role', 'status');
  box.addEventListener('change', () => {
    void setReminders(box.checked).then(() => {
      // The background hears the change and clears the badge at once.
      said.textContent = box.checked ? ATTENTION_COPY.on : ATTENTION_COPY.off;
    });
  });

  row.append(label, box);
  app.append(h1, maker, row, note, said);
}

void render();
