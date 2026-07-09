/**
 * @fileoverview Service d'itinéraire — OSRM, distances, optimisation, GPX.
 * Logique pure : pas de DOM, pas de Leaflet, pas d'état.
 * Le rendu (polylines, liste des étapes, drag & drop) reste dans
 * src/features/map/routePlanner.js.
 */

import { OSRM_URL, AVG_SPEED_KMH } from '../../config/index.js';

// Le serveur public OSRM ne supporte que le profil driving de façon fiable.
// Pour vélo et marche, on récupère la géométrie (driving) mais on corrige
// la durée avec des vitesses moyennes réalistes (AVG_SPEED_KMH).
export const OSRM_PROFILE = { driving: 'driving', cycling: 'driving', walking: 'driving' };

/**
 * Durée estimée hors OSRM (null pour driving : OSRM fait foi).
 * @param {number} distanceMeters
 * @param {'driving'|'cycling'|'walking'} mode
 * @returns {number|null} secondes
 */
export function estimateDuration(distanceMeters, mode) {
  const kmh = AVG_SPEED_KMH[mode];
  if (!kmh) return null;
  return Math.round((distanceMeters / 1000 / kmh) * 3600);
}

/** @param {number} m @returns {string} ex : "850 m" ou "12.4 km" */
export function formatDistance(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** @param {number} s @returns {string} ex : "45 min" ou "2h05" */
export function formatDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

/**
 * Distance haversine à vol d'oiseau.
 * @returns {number} mètres
 */
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ordonne les lieux par plus proche voisin (départ = premier élément).
 * Ne modifie pas le tableau d'entrée.
 * @template {{ lat: number, lng: number }} P
 * @param {P[]} places
 * @returns {P[]}
 */
export function nearestNeighborOrder(places) {
  if (places.length < 3) return [...places];
  const pool   = [...places];
  const result = [pool.shift()];
  while (pool.length > 0) {
    const last = result[result.length - 1];
    let ni = 0, nd = Infinity;
    pool.forEach((p, i) => {
      const d = haversine(last.lat, last.lng, p.lat, p.lng);
      if (d < nd) { nd = d; ni = i; }
    });
    result.push(pool.splice(ni, 1)[0]);
  }
  return result;
}

/**
 * Calcule l'itinéraire OSRM entre les lieux (dans l'ordre donné).
 * legs[i] relie places[i] à places[i+1] — permet les statistiques par
 * tronçon (planning par jour).
 * @param {Array<{ lat: number, lng: number }>} places - Au moins 2 lieux
 * @param {'driving'|'cycling'|'walking'} mode
 * @returns {Promise<{ distance: number, duration: number, geometry: Object,
 *                     legs: Array<{ distance: number, duration: number }> }>}
 * @throws {Error} si OSRM est indisponible ou ne trouve pas de route
 */
export async function fetchOsrmRoute(places, mode) {
  const coords  = places.map(p => `${p.lng},${p.lat}`).join(';');
  const profile = OSRM_PROFILE[mode] || 'driving';
  const url     = `${OSRM_URL}/${profile}/${coords}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (!data.routes?.[0]) throw new Error('No route');

  const route = data.routes[0];
  return {
    distance: route.distance,
    duration: estimateDuration(route.distance, mode) ?? route.duration,
    geometry: route.geometry,
    legs: (route.legs ?? []).map(leg => ({
      distance: leg.distance,
      duration: estimateDuration(leg.distance, mode) ?? leg.duration,
    })),
  };
}

// ── Export GPX ────────────────────────────────────────────────────────────────

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Construit le document GPX : waypoints + route, et tracé <trk> si une
 * géométrie OSRM (GeoJSON LineString) est fournie.
 * @param {Array<{ lat: number, lng: number, name: string }>} places
 * @param {{ coordinates: Array<[number, number]> }|null} [geometry]
 * @param {string} [name]
 * @returns {string}
 */
export function buildGpx(places, geometry = null, name = 'Road Trip Jura') {
  const wpts = places.map((p, i) => `  <wpt lat="${p.lat}" lon="${p.lng}">
    <name>${escapeXml(p.name)}</name>
    <desc>Étape ${i + 1}</desc>
  </wpt>`).join('\n');

  const rtePoints = places.map(p =>
    `    <rtept lat="${p.lat}" lon="${p.lng}"><name>${escapeXml(p.name)}</name></rtept>`
  ).join('\n');

  const trkPoints = geometry?.coordinates
    ? geometry.coordinates
        .map(([lng, lat]) => `    <trkpt lat="${lat}" lon="${lng}"/>`)
        .join('\n')
    : '';
  const trk = trkPoints
    ? `  <trk><name>Tracé Road Trip</name><trkseg>\n${trkPoints}\n  </trkseg></trk>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${escapeXml(name)}" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}
  <rte>
    <name>${escapeXml(name)}</name>
${rtePoints}
  </rte>
${trk}
</gpx>`;
}
