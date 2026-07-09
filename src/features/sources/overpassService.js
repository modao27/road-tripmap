/**
 * @fileoverview Service Overpass OSM — recherche de POI géographiques.
 * Responsabilité : catégories/tags OSM, détection de catégorie,
 * construction et exécution des requêtes Overpass QL.
 * Ne touche pas au DOM ni à Leaflet.
 *
 * Source unique — consommé par la carte (../map/overpass.js)
 * et, à terme, par la page carte de la SPA.
 */

import { OVERPASS_URL } from '../../config/index.js';

// ── Catégories et tags OSM ────────────────────────────────────────────────────

export const OVERPASS_CATEGORIES = {
  bivouac: {
    label: 'Bivouac',
    icon:  '⛺',
    color: '#2f6f36',
    tags:  ['["tourism"="camp_site"]', '["tourism"="camp_pitch"]'],
  },
  shelter: {
    label: 'Refuge',
    icon:  '🏠',
    color: '#6f513f',
    tags:  ['["amenity"="shelter"]', '["tourism"="alpine_hut"]', '["tourism"="wilderness_hut"]'],
  },
  water: {
    label: 'Source',
    icon:  '💧',
    color: '#2477a6',
    tags:  ['["natural"="spring"]', '["amenity"="drinking_water"]'],
  },
  waterfall: {
    label: 'Cascade',
    icon:  '🌊',
    color: '#2477a6',
    tags:  ['["waterway"="waterfall"]'],
  },
  viewpoint: {
    label: 'Panorama',
    icon:  '🔭',
    color: '#d56b1d',
    tags:  ['["tourism"="viewpoint"]'],
  },
  via_ferrata: {
    label: 'Via ferrata',
    icon:  '🧗',
    color: '#912d2d',
    tags:  ['["climbing"="via_ferrata"]', '["sport"="via_ferrata"]'],
  },
  escalade: {
    label: 'Escalade',
    icon:  '🪨',
    color: '#7b4b2a',
    tags:  ['["leisure"="climbing"]', '["climbing"="crag"]'],
  },
  trailhead: {
    label: 'Départ rando',
    icon:  '🥾',
    color: '#6f513f',
    tags:  ['["tourism"="trailhead"]', '["hiking"="trailhead"]'],
  },
};

/** Mapping catégorie OSM → catégorie de l'app */
export const OSM_TO_APP_CAT = {
  bivouac:     'bivouac',
  shelter:     'bivouac',
  water:       'water',
  waterfall:   'water',
  viewpoint:   'hike',
  via_ferrata: 'via',
  escalade:    'escalade',
  trailhead:   'hike',
};

// ── Détection de catégorie depuis les tags OSM ────────────────────────────────

/**
 * @param {Record<string,string>} tags - Tags OSM du nœud
 * @returns {string} Clé de OVERPASS_CATEGORIES
 */
export function detectOsmCategory(tags) {
  if (tags.waterway === 'waterfall')  return 'waterfall';
  if (tags.natural === 'spring' || tags.amenity === 'drinking_water') return 'water';
  if (tags.tourism === 'viewpoint')   return 'viewpoint';
  if (tags.amenity === 'shelter' || tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut') return 'shelter';
  if (tags.climbing === 'via_ferrata' || tags.sport === 'via_ferrata') return 'via_ferrata';
  if (tags.leisure === 'climbing' || tags.climbing === 'crag') return 'escalade';
  if (tags.tourism === 'trailhead' || tags.hiking === 'trailhead') return 'trailhead';
  return 'bivouac';
}

// ── Requête Overpass QL avec filtre `around` ─────────────────────────────────

/**
 * Construit la requête Overpass QL (pure — testable sans réseau).
 * @param {string[]} selectedCats - Clés de OVERPASS_CATEGORIES
 * @param {{ lat: number, lng: number }} center
 * @param {number}   radiusMeters
 * @returns {string}
 */
export function buildOverpassQL(selectedCats, center, radiusMeters) {
  const around = `around:${Math.round(radiusMeters)},${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
  const lines = selectedCats.flatMap(cat =>
    (OVERPASS_CATEGORIES[cat]?.tags ?? []).map(tag => `  node${tag}(${around});`)
  ).join('\n');
  return `[out:json][timeout:30];\n(\n${lines}\n);\nout body;`;
}

/**
 * @param {string[]} selectedCats
 * @param {{ lat: number, lng: number }} center
 * @param {number}   radiusMeters
 * @returns {Promise<{ elements: any[] }>}
 */
export async function runOverpassQuery(selectedCats, center, radiusMeters) {
  const ql  = buildOverpassQL(selectedCats, center, radiusMeters);
  const res = await fetch(OVERPASS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'data=' + encodeURIComponent(ql),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}
