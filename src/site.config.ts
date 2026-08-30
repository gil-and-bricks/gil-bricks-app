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
  /** Data as-of date; populated from manifest.json once the pipeline exists (Phase 2). */
  dataAsOf: string;
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
  dataAsOf: '',
};
