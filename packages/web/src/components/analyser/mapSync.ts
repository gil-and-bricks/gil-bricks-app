/** Table ⇄ map hover sync (S7.1): the hovered comp id, if any. */
import { signal } from '@preact/signals';

export const hoveredCompId = signal<string | null>(null);
