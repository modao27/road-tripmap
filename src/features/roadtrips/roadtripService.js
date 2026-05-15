/**
 * @fileoverview Service roadtrips — CRUD Supabase avec miroir localStorage.
 * Supabase est la source de vérité ; localStorage sert de cache et fallback.
 *
 * @typedef {import('../../shared/types/index.js').Roadtrip} Roadtrip
 */

import { supabase }                              from '../../shared/lib/supabaseClient.js';
import { storageGet, storageSet, generateUUID }  from '../../shared/utils/storage.js';

const LOCAL_KEY = 'roadtrips';

// ── Helpers localStorage ──────────────────────────────────────────────────────

/** @returns {Roadtrip[]} */
function localList() { return storageGet(LOCAL_KEY, []); }

/** @param {Roadtrip[]} list */
function localSave(list) { storageSet(LOCAL_KEY, list); }

function localUpsert(trip) {
  const list = localList();
  const idx  = list.findIndex(r => r.id === trip.id);
  if (idx >= 0) list[idx] = trip; else list.unshift(trip);
  localSave(list);
}

function localDelete(id) {
  localSave(localList().filter(r => r.id !== id));
  const prefix = `rt:${id}:`;
  Object.keys(localStorage).filter(k => k.startsWith(prefix))
    .forEach(k => localStorage.removeItem(k));
}

// ── Lecture ───────────────────────────────────────────────────────────────────

/**
 * Charge les roadtrips de l'utilisateur connecté.
 * Tente Supabase en premier, repli sur localStorage.
 * @param {string} [userId]
 * @returns {Promise<Roadtrip[]>}
 */
export async function listRoadtrips(userId) {
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('roadtrips')
        .select('*')
        .eq('owner_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      localSave(data);
      return data;
    } catch { /* fall through */ }
  }
  return localList();
}

/**
 * @param {string} id
 * @returns {Promise<Roadtrip|null>}
 */
export async function getRoadtrip(id) {
  try {
    const { data, error } = await supabase
      .from('roadtrips').select('*').eq('id', id).single();
    if (error) throw error;
    localUpsert(data);
    return data;
  } catch {
    return localList().find(r => r.id === id) ?? null;
  }
}

// ── Écriture ──────────────────────────────────────────────────────────────────

/**
 * Crée un roadtrip dans Supabase + miroir localStorage.
 *
 * @param {{
 *   title:       string,
 *   description: string,
 *   startLabel:  string,
 *   startLat:    number|null,
 *   startLng:    number|null,
 *   userId:      string
 * }} params
 * @returns {Promise<Roadtrip>}
 */
export async function createRoadtrip({ title, description = '', startLabel = '', startLat = null, startLng = null, userId }) {
  const payload = {
    owner_id:     userId,
    title:        title.trim(),
    description:  description.trim(),
    start_label:  startLabel,
    start_lat:    startLat,
    start_lng:    startLng,
    center_lat:   startLat,
    center_lng:   startLng,
    default_zoom: startLat ? 12 : 10,
    visibility:   'private',
  };

  const { data, error } = await supabase
    .from('roadtrips')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  localUpsert(data);
  return data;
}

/**
 * @param {string}          id
 * @param {Partial<Roadtrip>} fields
 * @returns {Promise<Roadtrip>}
 */
export async function updateRoadtrip(id, fields) {
  const { data, error } = await supabase
    .from('roadtrips')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  localUpsert(data);
  return data;
}

/**
 * @param {string} id
 */
export async function deleteRoadtrip(id) {
  const { error } = await supabase.from('roadtrips').delete().eq('id', id);
  if (error) throw error;
  localDelete(id);
}

// ── Stats légères (localStorage seulement, pas de round-trip) ────────────────

/**
 * @param {string} id
 * @returns {{ pinCount: number, stepCount: number }}
 */
export function getRoadtripStats(id) {
  return {
    pinCount:  storageGet(`rt:${id}:pins`,       []).length,
    stepCount: storageGet(`rt:${id}:routeSteps`, []).length,
  };
}
