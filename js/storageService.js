/**
 * storageService.js
 * Service de persistance multi-roadtrips.
 * Toutes les données par roadtrip sont préfixées rt:{id}:*
 * L'interface est identique que le backend soit localStorage, Supabase ou Cloudflare KV.
 */

const ROADTRIPS_KEY = 'roadtrips';
const P = (id, suffix) => `rt:${id}:${suffix}`;

function generateId() {
  return crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Liste des roadtrips ───────────────────────────────────────────────────────

export function listRoadtrips() {
  try { return JSON.parse(localStorage.getItem(ROADTRIPS_KEY) || '[]'); }
  catch { return []; }
}

function persistList(list) {
  localStorage.setItem(ROADTRIPS_KEY, JSON.stringify(list));
}

export function createRoadtrip({ title = 'Nouveau road trip', description = '', showStaticPlaces = false } = {}) {
  const id = generateId();
  return createRoadtripWithId(id, title, description, showStaticPlaces);
}

export function createRoadtripWithId(id, title = 'Road trip', description = '', showStaticPlaces = true) {
  const list = listRoadtrips();
  if (list.find(r => r.id === id)) return list.find(r => r.id === id);
  const now = new Date().toISOString();
  const trip = { id, title, description, showStaticPlaces, createdAt: now, updatedAt: now };
  list.unshift(trip);
  persistList(list);
  return trip;
}

export function getRoadtrip(id) {
  return listRoadtrips().find(r => r.id === id) ?? null;
}

export function updateRoadtrip(id, fields) {
  const list = listRoadtrips();
  const idx  = list.findIndex(r => r.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...fields, updatedAt: new Date().toISOString() };
  persistList(list);
  return list[idx];
}

export function deleteRoadtrip(id) {
  persistList(listRoadtrips().filter(r => r.id !== id));
  // Supprime toutes les clés scoped
  const prefix = `rt:${id}:`;
  Object.keys(localStorage)
    .filter(k => k.startsWith(prefix))
    .forEach(k => localStorage.removeItem(k));
}

export function duplicateRoadtrip(id) {
  const source = getRoadtrip(id);
  if (!source) return null;
  const copy = createRoadtrip({ title: `${source.title} (copie)`, description: source.description });
  // Copie toutes les données scoped
  const prefix = `rt:${id}:`;
  Object.keys(localStorage)
    .filter(k => k.startsWith(prefix))
    .forEach(k => {
      const suffix = k.slice(prefix.length);
      localStorage.setItem(`rt:${copy.id}:${suffix}`, localStorage.getItem(k));
    });
  return copy;
}

// ── Touch (met à jour updatedAt) ──────────────────────────────────────────────
function touch(id) { updateRoadtrip(id, {}); }

// ── Données par roadtrip ──────────────────────────────────────────────────────

export function loadPins(id) {
  return JSON.parse(localStorage.getItem(P(id, 'pins')) || '[]');
}
export function savePins(id, pins) {
  localStorage.setItem(P(id, 'pins'), JSON.stringify(pins));
  touch(id);
}

export function loadOverrides(id) {
  try { return JSON.parse(localStorage.getItem(P(id, 'overrides')) || '{}'); }
  catch { return {}; }
}
export function saveOverrides(id, overrides) {
  localStorage.setItem(P(id, 'overrides'), JSON.stringify(overrides));
  touch(id);
}

export function loadMapView(id) {
  try { return JSON.parse(localStorage.getItem(P(id, 'mapView'))); }
  catch { return null; }
}
export function saveMapView(id, lat, lng, zoom) {
  localStorage.setItem(P(id, 'mapView'), JSON.stringify({ lat, lng, zoom }));
}

export function loadBaseLayer(id) {
  return localStorage.getItem(P(id, 'baseLayer')) || 'osm';
}
export function saveBaseLayer(id, layerKey) {
  localStorage.setItem(P(id, 'baseLayer'), layerKey);
}

export function loadActiveFilters(id) {
  try { return JSON.parse(localStorage.getItem(P(id, 'filters'))); }
  catch { return null; }
}
export function saveActiveFilters(id, categories) {
  localStorage.setItem(P(id, 'filters'), JSON.stringify([...categories]));
}

export function loadRouteSteps(id) {
  return JSON.parse(localStorage.getItem(P(id, 'routeSteps')) || '[]');
}
export function saveRouteSteps(id, steps) {
  localStorage.setItem(P(id, 'routeSteps'), JSON.stringify(steps));
  touch(id);
}

export function loadRouteMode(id) {
  return localStorage.getItem(P(id, 'routeMode')) || 'driving';
}
export function saveRouteMode(id, mode) {
  localStorage.setItem(P(id, 'routeMode'), mode);
}

// ── Résumé pour la homepage ───────────────────────────────────────────────────
export function getRoadtripSummary(id) {
  return {
    pinCount:  loadPins(id).length,
    stepCount: loadRouteSteps(id).length,
  };
}
