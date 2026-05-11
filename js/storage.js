// ── localStorage (sync, immédiat) ────────────────────────────────────────────

export function loadUserPins() {
  return JSON.parse(localStorage.getItem('userPins') || '[]');
}

export function saveUserPins(pins) {
  localStorage.setItem('userPins', JSON.stringify(pins));
}

export function loadOverrides() {
  return JSON.parse(localStorage.getItem('placeOverrides') || '{}');
}

export function saveOverrides(overrides) {
  localStorage.setItem('placeOverrides', JSON.stringify(overrides));
}

// ── Utilitaire UUID ───────────────────────────────────────────────────────────

export function isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

// ── Identifiant de carte personnel (UUID) ─────────────────────────────────────

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getMapIdFromUrl() {
  return new URLSearchParams(window.location.search).get('map') || null;
}

// ── Vue carte (centre + zoom) ─────────────────────────────────────────────────

export function saveMapView(lat, lng, zoom) {
  localStorage.setItem('mapView', JSON.stringify({ lat, lng, zoom }));
}

export function loadMapView() {
  try { return JSON.parse(localStorage.getItem('mapView')); }
  catch { return null; }
}

// ── Itinéraire ────────────────────────────────────────────────────────────────

export function loadRouteSteps() {
  return JSON.parse(localStorage.getItem('routeSteps') || '[]');
}

export function saveRouteSteps(steps) {
  localStorage.setItem('routeSteps', JSON.stringify(steps));
}

export function loadRouteMode() {
  return localStorage.getItem('routeMode') || 'driving';
}

export function saveRouteMode(mode) {
  localStorage.setItem('routeMode', mode);
}

export function getOrCreateMapId() {
  const fromUrl = getMapIdFromUrl();
  // Mémorise uniquement si c'est bien un UUID personnel (pas un slug partagé)
  if (fromUrl && isUUID(fromUrl)) {
    localStorage.setItem('mapId', fromUrl);
    return fromUrl;
  }
  let id = localStorage.getItem('mapId');
  if (!id) {
    id = generateId();
    localStorage.setItem('mapId', id);
  }
  return id;
}
