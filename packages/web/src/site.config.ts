/**
 * Single source of truth for site identity (CLAUDE.md golden rule 4).
 * Every user-facing name, domain, tagline, social link and as-of date
 * reads from here. Never hardcode these anywhere else.
 */
import { coreConfig } from '@gil-bricks/core';

export interface SocialLinks {
  instagram: string;
  youtube: string;
}

export interface SiteConfig {
  /** PRODUCT name (PropLaunch) — from coreConfig; the brand users see. */
  siteName: string;
  /** MAKER credit (Gil & Bricks) — shown as a quiet secondary "by …". */
  makerName: string;
  tagline: string;
  /** Locked product domain (proplaunch.ai) — NOT yet live; liveUrl stays workers.dev. */
  domain: string;
  liveUrl: string;
  socials: SocialLinks;
  /** Chrome Web Store listing URL — EMPTY until the listing is live; the landing
   * page shows a "coming soon" state while empty (paste the URL here, no code change). */
  chromeStoreUrl: string;
  /** Public base URL of the R2 data bucket (r2.dev development URL for now). */
  dataBaseUrl: string;
  /** NEVER hand-set: manifest.json is the single as-of source (DATA_SCHEMA.md); display fallback only. */
  dataAsOf: string;
  /** Google OAuth client ID — PUBLIC by design (visible in every auth redirect). */
  googleClientId: string;
  /** Turnstile site key — PUBLIC by design (rendered into the login wall). */
  turnstileSiteKey: string;
  /** Current version of the T&C/consent text; bump when legal copy changes (S9). */
  consentVersion: string;
  /** UI feature flags. `dealPipeline` gates the P1 pipeline — OFF until its UI ships (P-series); the flat saved-deals path stays untouched while false. */
  features: { dealScore: boolean; dealPipeline: boolean };
}

export const siteConfig: SiteConfig = {
  // Product + maker names come from coreConfig so the web app and the panel read
  // the SAME names (one source — golden rules 2 & 4).
  siteName: coreConfig.siteName,
  makerName: coreConfig.makerName,
  tagline: 'Real UK sold-price data for property investors — free.',
  // Locked future domain; the site still serves from liveUrl (workers.dev) for now.
  domain: 'proplaunch.ai',
  liveUrl: 'https://gil-bricks-app.gil-782.workers.dev',
  // Chrome Web Store URL — paste it here once the listing is live (placeholder for now).
  chromeStoreUrl: '',
  // Socials come from coreConfig so the web app and the panel read the SAME
  // links (one source — golden rules 2 & 4). The per-strategy YouTube links also
  // live in coreConfig and are read via youtubeFor(id) — no duplicate here.
  socials: coreConfig.socials,
  dataBaseUrl: coreConfig.dataBaseUrl,
  dataAsOf: '',
  googleClientId: '548405055261-7h7g1bsbc6ouoa04470ohr3ifigjbbfp.apps.googleusercontent.com',
  turnstileSiteKey: '0x4AAAAAAEjDnxbmFpl9_C_M',
  consentVersion: '2026-08-31.2-placeholder',
  features: { dealScore: true, dealPipeline: true },
};
