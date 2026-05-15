/**
 * @fileoverview Service Overpass OSM — recherche de POI géographiques.
 * Responsabilité : construire et exécuter des requêtes Overpass QL.
 * Ne touche pas au DOM ni à Leaflet.
 *
 * @typedef {import('../../shared/types/index.js').Pin} Pin
 */

import { OVERPASS_URL } from '../../config/index.js';

// ── Catégories et tags OSM ────────────────────────────────────────────────────

export const OVERPASS_CATEGORIES = {
  bivouac: {
    label: 'Bivouac',   icon: '⛺', color: '#2f6f36',
    tags:  ['["tourism"="camp_site"]', '["tourism"="camp_pitch"]'],
  },
  shelter: {
    label: 'Refuges',   icon: '🏠', color: '#6f513f',
    tags:  ['["amenity"="shelter"]', '["tourism"="alpine_hut"]', '["tourism"="wilderness_hut"]'],
  },
  water: {
    label: 'Sources',   icon: '💧', color: '#2477a6',
    tags:  ['["natural"="spring"]', '["amenity"="drinking_water"]'],
  },
  waterfall: {
    label: 'Cascades',  icon: '🌊', color: '#2477a6',
    tags:  ['["waterway"="waterfall"]'],
  },
  viewpoint: {
    label: 'Panoramas', icon: '🔭', color: '#d56b1d',
    tags:  ['["tourism"="viewpoint"]'],
  },
  via_ferrata: {
    label: 'Via ferrata', icon: '🧗', color: '#912d2d',
    tags:  ['["climbing"="via_ferrata"]', '["sport"="via_ferrata"]'],
  },
  trailhead: {
    label: 'Départs rando', icon: '🥾', color: '#6f513f',
    tags:  ['["tourism"="trailhead"]', '["hiking"="trailhead"]'],
  },
};

/** Mapping catégorie OSM → catégorie app */
export const OSM_TO_APP_CAT = {
  bivouac:     'bivouac',
  shelter:     'bivouac',
  water:       'water',
  waterfall:   'water',
  viewpoint:   'hike',
  via_ferrata: 'via',
  trailhead:   'hike',
};

// ── Géométrie ─────────────────────────────────────────────────────────────────

/**
 * Calcule la bbox autour d'un point.
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm
 * @returns {string} "lat_sw,lng_sw,lat_ne,lng_ne"
 */
export function bboxFromRadius(lat, lng, radiusKm) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
  return [lat - dLat, lng - dLng, lat + dLat, lng + dLng].map(n => n.toFixed(4)).join(',');
}

// ── Requête ───────────────────────────────────────────────────────────────────

/**
 * @param {string[]}  selectedCats - Clés de OVERPASS_CATEGORIES
 * @param {string}    bbox
 * @returns {Promise<{ elements: any[] }>}
 */
export async function runOverpassQuery(selectedCats, bbox) {
  const lines = selectedCats.flatMap(cat =>
    (OVERPASS_CATEGORIES[cat]?.tags ?? []).map(tag => `  node${tag}(${bbox});`)
  ).join('\n');

  const ql  = `[out:json][timeout:25];\n(\n${lines}\n);\nout body;`;
  const res = await fetch(OVERPASS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'data=' + encodeURIComponent(ql),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

// ── Détection de catégorie ────────────────────────────────────────────────────

/**
 * @param {Record<string,string>} tags - Tags OSM du nœud
 * @returns {string} Clé de OVERPASS_CATEGORIES
 */
export function detectOsmCategory(tags) {
  if (tags.waterway === 'waterfall')                                           return 'waterfall';
  if (tags.natural === 'spring' || tags.amenity === 'drinking_water')         return 'water';
  if (tags.tourism === 'viewpoint')                                            return 'viewpoint';
  if (tags.amenity === 'shelter' || tags.tourism === 'alpine_hut'
      || tags.tourism === 'wilderness_hut')                                    return 'shelter';
  if (tags.climbing || tags.sport === 'via_ferrata')                          return 'via_ferrata';
  if (tags.tourism === 'trailhead' || tags.hiking === 'trailhead')            return 'trailhead';
  return 'bivouac';
}

/**
 * Résout le nom d'un nœud OSM (priorité : name, name:fr, official_name, note, label catégorie).
 * @param {Record<string,string>} tags
 * @param {string}                catLabel - Label de fallback
 * @returns {string}
 */
export function resolveOsmName(tags, catLabel) {
  return tags.name ?? tags['name:fr'] ?? tags.official_name
      ?? tags.alt_name ?? tags.loc_name ?? tags.note ?? catLabel;
}
