// ── localStorage (sync, immédiat) ────────────────────────────────────────────
// Clés métier de la carte. Primitives et UUID : src/shared/utils/storage.js
// (source unique, partagée avec la SPA).

import { storageGet, storageSet, generateUUID, isUUID } from '../../shared/utils/storage.js';

export { isUUID };

export function loadUserPins() {
  return storageGet('userPins', []);
}

export function saveUserPins(pins) {
  storageSet('userPins', pins);
}

export function loadOverrides() {
  return storageGet('placeOverrides', {});
}

export function saveOverrides(overrides) {
  storageSet('placeOverrides', overrides);
}

// ── Identifiant de carte personnel (UUID) ─────────────────────────────────────

export function getMapIdFromUrl() {
  return new URLSearchParams(window.location.search).get('map') || null;
}

// ── Vue carte (centre + zoom) ─────────────────────────────────────────────────

export function saveMapView(lat, lng, zoom) {
  storageSet('mapView', { lat, lng, zoom });
}

export function loadMapView() {
  return storageGet('mapView', null);
}

// ── Itinéraire ────────────────────────────────────────────────────────────────

export function loadRouteSteps() {
  return storageGet('routeSteps', []);
}

export function saveRouteSteps(steps) {
  storageSet('routeSteps', steps);
}

// routeMode et mapId sont stockés en chaîne brute (pas JSON) — ne pas
// migrer vers storageGet/Set sans convertir les valeurs existantes.

export function loadRouteMode() {
  return localStorage.getItem('routeMode') || 'driving';
}

export function saveRouteMode(mode) {
  localStorage.setItem('routeMode', mode);
}

export function getOrCreateMapId(fromUrl = getMapIdFromUrl()) {
  // Mémorise uniquement si c'est bien un UUID personnel (pas un slug partagé)
  if (fromUrl && isUUID(fromUrl)) {
    localStorage.setItem('mapId', fromUrl);
    return fromUrl;
  }
  let id = localStorage.getItem('mapId');
  if (!id) {
    id = generateUUID();
    localStorage.setItem('mapId', id);
  }
  return id;
}
