/**
 * Single source of truth for site identity (CLAUDE.md golden rule 4).
 * Every user-facing name, domain, tagline, social link and as-of date
 * reads from here. Never hardcode these anywhere else.
 */
export interface SocialLinks {
  instagram: string;
  youtube: string;
}

export interface SiteConfig {
  /** Placeholder — the final site name is TBD. */
  siteName: string;
  tagline: string;
  /** Final domain, empty until launch (Phase 11). */
  domain: string;
  liveUrl: string;
  socials: SocialLinks;
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
}

export const siteConfig: SiteConfig = {
  siteName: 'Gil & Bricks',
  tagline: 'Real UK sold-price data for property investors — free.',
  domain: '',
  liveUrl: 'https://gil-bricks-app.gil-782.workers.dev',
  socials: {
    instagram: 'https://www.instagram.com/gil_and_bricks/',
    youtube: 'https://www.youtube.com/@gil_and_bricks',
  },
  dataBaseUrl: 'https://pub-ed7263f454104eb1a02055393ee15800.r2.dev',
  dataAsOf: '',
  googleClientId: '548405055261-7h7g1bsbc6ouoa04470ohr3ifigjbbfp.apps.googleusercontent.com',
  turnstileSiteKey: '0x4AAAAAAEjDnxbmFpl9_C_M',
  consentVersion: '2026-08-31-placeholder',
};
