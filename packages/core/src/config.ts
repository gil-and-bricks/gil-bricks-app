/**
 * Core configuration shared by both products (web app + future Chrome
 * extension). The R2 data bucket is a public URL and identical for both, so
 * it lives here rather than in either product's own config.
 */
export const coreConfig = {
  /** Public base URL of the R2 data bucket (sector JSON, manifest, ukhpi, etc.). */
  dataBaseUrl: 'https://pub-ed7263f454104eb1a02055393ee15800.r2.dev',
} as const;
