/**
 * The ONE map style (S7.1): Protomaps dark flavor, brand-tuned to the locked
 * gradient palette so the basemap recedes and the lime data layer owns the
 * map. Fully self-hosted: PMTiles on our R2 bucket, glyphs + sprites served
 * from our own /map/ assets — zero third-party tile or CDN calls.
 */
import { layers, namedFlavor } from '@protomaps/basemaps';
import { siteConfig } from '../../site.config';

/** R2 key of the England & Wales extract (docs/MAP_OPERATOR_NOTE.md). */
export const TILES_KEY = 'map/ew.pmtiles';

export const TILES_SOURCE_ID = 'protomaps';

/** Plain HTTPS URL of the archive — used for the persistent PMTiles instance. */
export function tilesHttpUrl(): string {
  return `${siteConfig.dataBaseUrl.replace(/\/+$/, '')}/${TILES_KEY}`;
}

export function tilesUrl(): string {
  return `pmtiles://${tilesHttpUrl()}`;
}

/**
 * Dark flavor with the brand ground: background toward #070014, water and
 * parks kept subtle, roads low-contrast, labels legible but quiet.
 */
export function brandFlavor(): ReturnType<typeof namedFlavor> {
  const f = { ...namedFlavor('dark') };
  Object.assign(f, {
    background: '#0b0318',
    earth: '#0d041c',
    water: '#080213',
    park_a: '#101026',
    park_b: '#101026',
    wood_a: '#0f0b22',
    wood_b: '#0f0b22',
    scrub_a: '#0e0820',
    scrub_b: '#0e0820',
    landcover: {
      grassland: '#0f0a24',
      barren: '#0e0620',
      urban_area: '#110826',
      farmland: '#0f0a24',
      glacier: '#0e0620',
      scrub: '#0f0a24',
      forest: '#0f0c26',
    },
    sand: '#140d24',
    beach: '#140d24',
    glacier: '#140d24',
    buildings: '#160b2c',
    pedestrian: '#12082a',
    hospital: '#130726',
    industrial: '#10051f',
    school: '#130726',
    zoo: '#101026',
    military: '#10051f',
    aerodrome: '#10051f',
    runway: '#1c1133',
    pier: '#1c1133',
    minor_service: '#1a0f30',
    minor_a: '#1c1133',
    minor_b: '#1c1133',
    link: '#221540',
    major: '#241745',
    highway: '#2d1d52',
    other: '#180d2c',
    railway: '#1e123a',
    boundaries: '#3a2a5e',
    city_label: 'rgba(255,255,255,0.72)',
    city_label_halo: '#0b0318',
    subplace_label: 'rgba(255,255,255,0.45)',
    subplace_label_halo: '#0b0318',
    state_label: 'rgba(255,255,255,0.3)',
    state_label_halo: '#0b0318',
    country_label: 'rgba(255,255,255,0.4)',
    roads_label_minor: 'rgba(255,255,255,0.38)',
    roads_label_minor_halo: '#0b0318',
    roads_label_major: 'rgba(255,255,255,0.5)',
    roads_label_major_halo: '#0b0318',
    ocean_label: 'rgba(255,255,255,0.3)',
    address_label: 'rgba(255,255,255,0.3)',
    address_label_halo: '#0b0318',
    // POI accents muted to lavender-greys — nothing competes with the lime data layer
    pois: {
      blue: '#6b6390',
      green: '#6b7a72',
      lapis: '#6b6390',
      pink: '#7d6b85',
      red: '#856b74',
      slategray: '#5f5b74',
      tangerine: '#82755f',
      turquoise: '#5f7478',
    },
  });
  return f;
}

export interface MapStyleSpec {
  version: 8;
  glyphs: string;
  sprite: string;
  sources: Record<string, unknown>;
  layers: unknown[];
}

/** Complete MapLibre style: brand-tuned basemap over our self-hosted assets. */
export function buildMapStyle(): MapStyleSpec {
  return {
    version: 8,
    // our own origin — never a third-party CDN (GDPR + self-hosting rule)
    glyphs: '/map/fonts/{fontstack}/{range}.pbf',
    sprite: `${siteConfig.liveUrl.replace(/\/+$/, '')}/map/sprites/v4/dark`,
    sources: {
      protomaps: {
        type: 'vector',
        url: tilesUrl(),
        attribution: '© OpenStreetMap contributors · Protomaps',
      },
    },
    layers: layers('protomaps', brandFlavor(), { lang: 'en' }),
  };
}
