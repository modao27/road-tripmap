/**
 * @fileoverview Service roadtrips — CRUD roadtrips en localStorage.
 * Structure préparée pour la sync Supabase future (champ userId présent).
 *
 * @typedef {import('../../shared/types/index.js').Roadtrip} Roadtrip
 */

import { storageGet, storageSet, generateUUID } from '../../shared/utils/storage.js';

const STORAGE_KEY = 'roadtrips';

// ── Lecture ───────────────────────────────────────────────────────────────────

/** @returns {Roadtrip[]} */
export function listRoadtrips() {
  return storageGet(STORAGE_KEY, []);
}

/**
 * @param {string} id
 * @returns {Roadtrip|null}
 */
export function getRoadtrip(id) {
  return listRoadtrips().find(r => r.id === id) ?? null;
}

// ── Écriture ──────────────────────────────────────────────────────────────────

/** @param {Roadtrip[]} list */
function persist(list) {
  storageSet(STORAGE_KEY, list);
}

/**
 * Crée un nouveau roadtrip.
 * @param {{ title: string, description?: string, userId?: string }} params
 * @returns {Roadtrip}
 */
export function createRoadtrip({ title, description = '', userId = null }) {
  const now  = new Date().toISOString();
  /** @type {Roadtrip} */
  const trip = {
    id:               generateUUID(),
    title:            title.trim(),
    description:      description.trim(),
    userId,
    showStaticPlaces: false,
    createdAt:        now,
    updatedAt:        now,
  };
  const list = listRoadtrips();
  list.unshift(trip);
  persist(list);
  return trip;
}

/**
 * Met à jour un roadtrip.
 * @param {string}          id
 * @param {Partial<Roadtrip>} fields
 * @returns {Roadtrip|null}
 */
export function updateRoadtrip(id, fields) {
  const list = listRoadtrips();
  const idx  = list.findIndex(r => r.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...fields, updatedAt: new Date().toISOString() };
  persist(list);
  return list[idx];
}

/**
 * Supprime un roadtrip et toutes ses données associées.
 * @param {string} id
 */
export function deleteRoadtrip(id) {
  persist(listRoadtrips().filter(r => r.id !== id));
  // Nettoie les clés scoped rt:{id}:*
  const prefix = `rt:${id}:`;
  Object.keys(localStorage)
    .filter(k => k.startsWith(prefix))
    .forEach(k => localStorage.removeItem(k));
}

/**
 * Renvoie des stats légères sans charger tous les pins.
 * @param {string} id
 * @returns {{ pinCount: number, stepCount: number }}
 */
export function getRoadtripStats(id) {
  const pins  = storageGet(`rt:${id}:pins`,       []);
  const steps = storageGet(`rt:${id}:routeSteps`, []);
  return { pinCount: pins.length, stepCount: steps.length };
}
