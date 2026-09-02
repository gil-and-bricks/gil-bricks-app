/**
 * The current analysis's headline figure, published by whichever verdict is
 * mounted so the Save flow can store it (S6.2). Cleared by AnalyserApp when
 * inputs change; '' = no verdict yet.
 */
import { signal } from '@preact/signals';

export const keyFigure = signal('');
