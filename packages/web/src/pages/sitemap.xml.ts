/**
 * sitemap.xml (A1) — generated from config, never hand-written, so it cannot go
 * stale the day a strategy or a tool is added. See src/config/sitemap.ts.
 */
import type { APIRoute } from 'astro';
import { siteConfig } from '../site.config';
import { absoluteUrl, sitemapPaths } from '../config/sitemap';

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = () => {
  const urls = sitemapPaths()
    .map((p) => `  <url><loc>${escapeXml(absoluteUrl(siteConfig.liveUrl, p))}</loc></url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
