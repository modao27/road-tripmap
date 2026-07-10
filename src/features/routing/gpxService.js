/**
 * @fileoverview Import GPX — parsing pur (DOMParser), pas de Leaflet.
 * L'export vit dans routingService.js (buildGpx) ; ce module fait le
 * chemin inverse : fichier GPX → waypoints + tracé exploitables par la
 * carte (src/features/map/gpxImport.js pour le rendu).
 */

import { haversine } from './routingService.js';

/**
 * @typedef {{ name: string, lat: number, lng: number, desc: string }} GpxWaypoint
 * @typedef {{ waypoints: GpxWaypoint[], track: Array<[number, number]> }} GpxData
 */

/**
 * Parse un document GPX (1.0 / 1.1).
 * @param {string} xml
 * @returns {GpxData} track : points <trkpt> concaténés (repli <rtept>)
 * @throws {Error} si le document n'est pas un GPX valide
 */
export function parseGpx(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('GPX invalide (XML mal formé)');
  if (doc.documentElement?.nodeName.toLowerCase() !== 'gpx') {
    throw new Error('Pas un fichier GPX');
  }

  const coord = (el) => {
    const lat = parseFloat(el.getAttribute('lat'));
    const lng = parseFloat(el.getAttribute('lon'));
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  };

  const waypoints = [...doc.querySelectorAll('wpt')].flatMap((el, i) => {
    const c = coord(el);
    if (!c) return []; // waypoint sans coordonnées : ignoré
    return [{
      name: el.querySelector('name')?.textContent.trim() || `Waypoint ${i + 1}`,
      lat:  c[0],
      lng:  c[1],
      desc: el.querySelector('desc')?.textContent.trim() || '',
    }];
  });

  let track = [...doc.querySelectorAll('trkpt')].map(coord).filter(Boolean);
  if (!track.length) {
    track = [...doc.querySelectorAll('rtept')].map(coord).filter(Boolean);
  }

  return { waypoints, track };
}

/** @param {Array<[number, number]>} track @returns {number} mètres */
export function trackLengthMeters(track) {
  let total = 0;
  for (let i = 1; i < track.length; i++) {
    total += haversine(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1]);
  }
  return total;
}
