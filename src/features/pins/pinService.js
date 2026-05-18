/**
 * @fileoverview Service pins — deux schémas coexistants.
 *
 * Nouveau schéma (table `pins`) — nouvelle architecture SPA :
 *   createPin / updatePin / deletePin / listPinsForRoadtrip
 *
 * Legacy (table `user_pins` + localStorage) — carte Leaflet existante :
 *   createLocalPin / updateLocalPin / deleteLocalPin
 *   loadPins / savePins / loadOverrides / saveOverrides
 *   fetchPinsRemote / upsertPinRemote / deletePinRemote
 *   fetchOverridesRemote / upsertOverrideRemote / deleteOverrideRemote
 *
 * @typedef {import('../../shared/types/index.js').Pin}            Pin
 * @typedef {import('../../shared/types/index.js').PinOverride}    PinOverride
 * @typedef {import('../../shared/types/index.js').PlaceOverrides} PlaceOverrides
 */

import { supabase }                                    from '../../shared/lib/supabaseClient.js';
import { storageGet, storageSet, generateUUID }        from '../../shared/utils/storage.js';

// ══════════════════════════════════════════════════════════════════════════════
// NOUVEAU SCHÉMA — table `pins` (nouvelle architecture SPA)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} RoadtripPin
 * @property {string}  id
 * @property {string}  roadtrip_id
 * @property {string}  [created_by]
 * @property {'start'|'stop'|'custom'|'poi'} type
 * @property {'active'|'archived'}           status
 * @property {string}  title
 * @property {string}  description
 * @property {number}  lat
 * @property {number}  lng
 * @property {string}  created_at
 * @property {string}  updated_at
 */

/**
 * Crée un pin dans la table `pins` (Supabase, nouveau schéma).
 * @param {{
 *   roadtripId:  string,
 *   type?:       'start'|'stop'|'custom'|'poi',
 *   title:       string,
 *   description?: string,
 *   lat:         number,
 *   lng:         number,
 *   createdBy:   string
 * }} params
 * @returns {Promise<RoadtripPin>}
 */
export async function createPin({ roadtripId, type = 'custom', title, description = '', lat, lng, createdBy }) {
  const { data, error } = await supabase
    .from('pins')
    .insert({
      roadtrip_id: roadtripId,
      created_by:  createdBy,
      type,
      status:      'active',
      title:       title.trim(),
      description: description.trim(),
      lat,
      lng,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * @param {string} roadtripId
 * @returns {Promise<RoadtripPin[]>}
 */
export async function listPinsForRoadtrip(roadtripId) {
  const { data, error } = await supabase
    .from('pins')
    .select('*')
    .eq('roadtrip_id', roadtripId)
    .order('order_index', { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * @param {string}               id
 * @param {Partial<RoadtripPin>} fields
 * @returns {Promise<RoadtripPin>}
 */
export async function updatePin(id, fields) {
  const { data, error } = await supabase
    .from('pins').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/**
 * @param {string} id
 */
export async function deletePin(id) {
  const { error } = await supabase.from('pins').delete().eq('id', id);
  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════════════════════
// LEGACY — localStorage + table `user_pins` (carte Leaflet existante)
// ══════════════════════════════════════════════════════════════════════════════

const PINS_KEY      = 'userPins';
const OVERRIDES_KEY = 'placeOverrides';

// ── Persistance locale ────────────────────────────────────────────────────────

/** @returns {Pin[]} */
export function loadPins() { return storageGet(PINS_KEY, []); }

/** @param {Pin[]} pins */
export function savePins(pins) { storageSet(PINS_KEY, pins); }

/** @returns {PlaceOverrides} */
export function loadOverrides() { return storageGet(OVERRIDES_KEY, {}); }

/** @param {PlaceOverrides} overrides */
export function saveOverrides(overrides) { storageSet(OVERRIDES_KEY, overrides); }

// ── CRUD local ────────────────────────────────────────────────────────────────

/**
 * Crée un pin en localStorage (usage carte Leaflet legacy).
 * @param {{ name: string, category: string, lat: number, lng: number, description?: string }} params
 * @param {Pin[]} pinsRef
 * @returns {Pin}
 */
export function createLocalPin(params, pinsRef) {
  /** @type {Pin} */
  const pin = {
    id:           generateUUID(),
    name:         params.name,
    category:     params.category,
    lat:          params.lat,
    lng:          params.lng,
    description:  params.description ?? '',
    tip:          '',
    interest:     '',
    mood:         '',
    userCreated:  true,
    user_created: true,
  };
  pinsRef.push(pin);
  savePins(pinsRef);
  return pin;
}

/**
 * Met à jour un pin localStorage.
 * @param {string}       id
 * @param {Partial<Pin>} fields
 * @param {Pin[]}        pinsRef
 * @returns {Pin|null}
 */
export function updateLocalPin(id, fields, pinsRef) {
  const pin = pinsRef.find(p => p.id === id);
  if (!pin) return null;
  Object.assign(pin, fields);
  savePins(pinsRef);
  return pin;
}

/**
 * Supprime un pin localStorage.
 * @param {string} id
 * @param {Pin[]}  pinsRef
 * @returns {boolean}
 */
export function deleteLocalPin(id, pinsRef) {
  const idx = pinsRef.findIndex(p => p.id === id);
  if (idx === -1) return false;
  pinsRef.splice(idx, 1);
  savePins(pinsRef);
  return true;
}

// ── Sync Supabase legacy (table `user_pins`) ──────────────────────────────────

/** @param {string} mapId @returns {Promise<Pin[]>} */
export async function fetchPinsRemote(mapId) {
  const { data, error } = await supabase
    .from('user_pins').select('*').eq('map_id', mapId);
  if (error) throw error;
  return data;
}

/** @param {string} mapId @param {Pin} pin */
export async function upsertPinRemote(mapId, pin) {
  const { error } = await supabase.from('user_pins').upsert({
    id: pin.id, map_id: mapId, name: pin.name, category: pin.category,
    lat: pin.lat, lng: pin.lng,
    description: pin.description ?? '', tip: pin.tip ?? '',
    interest: pin.interest ?? '', mood: pin.mood ?? '',
  });
  if (error) throw error;
}

/** @param {string} mapId @param {string} pinId */
export async function deletePinRemote(mapId, pinId) {
  const { error } = await supabase.from('user_pins').delete()
    .eq('id', pinId).eq('map_id', mapId);
  if (error) throw error;
}

// ── Overrides Supabase legacy ─────────────────────────────────────────────────

/** @param {string} mapId @returns {Promise<PlaceOverrides>} */
export async function fetchOverridesRemote(mapId) {
  const { data, error } = await supabase
    .from('place_overrides').select('*').eq('map_id', mapId);
  if (error) throw error;
  return Object.fromEntries(
    data.map(({ place_id, map_id, updated_at, ...f }) => [place_id, f])
  );
}

/** @param {string} mapId @param {string} placeId @param {PinOverride} override */
export async function upsertOverrideRemote(mapId, placeId, override) {
  const { error } = await supabase.from('place_overrides').upsert({
    ...override, place_id: placeId, map_id: mapId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** @param {string} mapId @param {string} placeId */
export async function deleteOverrideRemote(mapId, placeId) {
  const { error } = await supabase.from('place_overrides').delete()
    .eq('place_id', placeId).eq('map_id', mapId);
  if (error) throw error;
}
