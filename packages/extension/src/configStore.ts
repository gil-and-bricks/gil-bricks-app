/**
 * chrome.storage.local-backed cache for the extractor remote config. Uses only
 * the "storage" permission. The side panel refreshes it from R2; the content
 * script reads it (falling back to the shipped copy).
 */
import type { ConfigStore, ExtractorConfig } from '@gil-bricks/core';

const KEY = 'gb:extractorConfig';

export const chromeConfigStore: ConfigStore = {
  async get(): Promise<ExtractorConfig | null> {
    try {
      const r = await chrome.storage.local.get(KEY);
      return (r?.[KEY] as ExtractorConfig) ?? null;
    } catch {
      return null;
    }
  },
  async set(config: ExtractorConfig): Promise<void> {
    try {
      await chrome.storage.local.set({ [KEY]: config });
    } catch {
      /* ignore quota/availability errors — the shipped fallback still works */
    }
  },
};
