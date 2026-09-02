/**
 * Offline floor-plan OCR (E9). Runs entirely in the SIDE PANEL page — never the
 * service worker, never a network call beyond the floor-plan image the user's
 * own browser already loaded. Tesseract.js + its wasm core + the English
 * traineddata are BUNDLED under public/tesseract and referenced via
 * chrome.runtime.getURL, so nothing is fetched from a CDN at runtime. The image
 * is drawn to a local canvas, preprocessed, and recognised in-place; the pixels
 * never leave the machine. Tesseract is lazy-imported so the verdict renders
 * first and OCR only loads when the floor-plan section runs.
 */
import { parseFloorPlan, type FloorPlanRead } from '@gil-bricks/core';

export type OcrStage = 'loading-image' | 'preparing' | 'loading-engine' | 'reading' | 'done';
export interface OcrProgress { stage: OcrStage; pct: number }
export type OcrProgressFn = (p: OcrProgress) => void;

export class OcrError extends Error {
  constructor(
    readonly code: 'load' | 'taint' | 'empty' | 'engine',
    message: string,
  ) {
    super(message);
    this.name = 'OcrError';
  }
}

/** getURL that works in the panel and degrades to a plain path in tests. */
function asset(path: string): string {
  const c = (globalThis as { chrome?: { runtime?: { getURL?: (p: string) => string } } }).chrome;
  return c?.runtime?.getURL ? c.runtime.getURL(path) : `/${path}`;
}

/** Load the already-shown floor-plan image; CORS-clean so the canvas isn't tainted. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // read pixels only if the CDN allows it
    img.onload = () => resolve(img);
    img.onerror = () => reject(new OcrError('load', 'The floor-plan image couldn’t be loaded.'));
    img.src = url;
  });
}

/**
 * Preprocess for low-contrast agent plans: upscale small images, greyscale, a
 * contrast stretch, then an adaptive threshold to black-on-white. Reading the
 * pixels throws on a tainted (non-CORS) canvas — surfaced as OcrError('taint').
 */
export function preprocess(img: HTMLImageElement): HTMLCanvasElement {
  const longest = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height) || 1;
  const scale = Math.min(2.5, Math.max(1, 1800 / longest)); // upscale small plans, cap the work
  const w = Math.round((img.naturalWidth || img.width) * scale);
  const h = Math.round((img.naturalHeight || img.height) * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  let px: ImageData;
  try {
    px = ctx.getImageData(0, 0, w, h);
  } catch {
    throw new OcrError('taint', 'This floor-plan image can’t be read here (the site didn’t allow it) — type the area instead.');
  }
  const d = px.data;
  // greyscale + running mean for an adaptive threshold
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = d[i + 1] = d[i + 2] = g;
    sum += g;
  }
  const mean = sum / (d.length / 4);
  const cut = mean * 0.82; // text is darker than the page mean
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] < cut ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(px, 0, 0);
  return canvas;
}

/**
 * OCR a floor-plan image URL fully offline and return honestly-graded rooms.
 * Throws OcrError (load/taint/empty/engine) so the panel can offer manual entry
 * — it NEVER returns a guessed number.
 */
export async function ocrFloorPlan(url: string, onProgress: OcrProgressFn = () => {}): Promise<FloorPlanRead> {
  onProgress({ stage: 'loading-image', pct: 5 });
  const img = await loadImage(url);
  onProgress({ stage: 'preparing', pct: 15 });
  const canvas = preprocess(img);

  onProgress({ stage: 'loading-engine', pct: 25 });
  let worker: { setParameters: (p: Record<string, unknown>) => Promise<unknown>; recognize: (c: unknown) => Promise<{ data: { text: string; confidence: number } }>; terminate: () => Promise<unknown> };
  try {
    const { createWorker } = await import('tesseract.js');
    worker = (await createWorker('eng', 1, {
      workerPath: asset('tesseract/worker.min.js'),
      corePath: asset('tesseract/'),
      langPath: asset('tesseract/'),
      gzip: true,
      logger: (m: { status?: string; progress?: number }) => {
        if (m.status === 'recognizing text') onProgress({ stage: 'reading', pct: 40 + Math.round((m.progress ?? 0) * 55) });
      },
    })) as never;
  } catch (e) {
    throw new OcrError('engine', `The reader couldn’t start (${(e as Error).message}).`);
  }

  try {
    // Digits + the dimension punctuation AND the alphabet — room-name letters must
    // survive so the HMO room-size feed can identify named bedrooms (E9 review).
    // Sparse-text mode (11) since labels are scattered across the plan.
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,mftx×\'"’” ',
      tessedit_pageseg_mode: '11',
    });
    const { data } = await worker.recognize(canvas);
    onProgress({ stage: 'done', pct: 100 });
    const read = parseFloorPlan(data.text ?? '', data.confidence);
    if (read.rooms.length === 0) throw new OcrError('empty', 'We couldn’t read any room dimensions from this plan — type the area instead.');
    return read;
  } finally {
    void worker.terminate();
  }
}
