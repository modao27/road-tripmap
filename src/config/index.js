/**
 * @fileoverview Configuration centrale de l'application.
 * Toutes les constantes applicatives sont définies ici.
 * Les modules ne doivent pas avoir de magic numbers en dur.
 *
 * @typedef {import('../shared/types/index.js').MapConfig} MapConfig
 */

/** @type {MapConfig} */
export const MAP_CONFIG = {
  defaultCenter:   [46.709, 5.646],
  defaultZoom:     10,
  focusZoom:       13,
  clusterRadius:   50,
  geocodeLimit:    5,
  geocodeDebounce: 350,
  sidebarDefault:  390,
  sidebarMin:      240,
  sidebarMax:      720,
};

export const NOMINATIM_URL    = 'https://nominatim.openstreetmap.org/search';
export const OVERPASS_URL     = 'https://overpass-api.de/api/interpreter';
export const OSRM_URL         = 'https://router.project-osrm.org/route/v1';
export const CAMPTOCAMP_URL   = 'https://api.camptocamp.org/search';
export const REFUGES_URL      = 'https://www.refuges.info/api/bbox';
export const ENRICHMENT_TIMEOUT_MS = 6000;

/** Vitesses moyennes pour le calcul de durée hors OSRM */
export const AVG_SPEED_KMH = {
  driving: null,   // OSRM gère
  cycling: 16,
  walking: 4,
};
