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

/**
 * @param {string} mapId
 * @returns {Promise<Pin[]>} Pins avec le flag UI `userCreated` normalisé
 *   depuis la colonne `user_created` (l'UI teste le camelCase).
 */
export async function fetchPinsRemote(mapId) {
  const { data, error } = await supabase
    .from('user_pins').select('*').eq('map_id', mapId);
  if (error) throw error;
  return data.map(row => ({ ...row, userCreated: row.user_created ?? true }));
}

/** @param {string} mapId @param {Pin} pin */
export async function upsertPinRemote(mapId, pin) {
  const { error } = await supabase.from('user_pins').upsert({
    id: pin.id, map_id: mapId, name: pin.name, category: pin.category,
    lat: pin.lat, lng: pin.lng,
    description: pin.description ?? '', tip: pin.tip ?? '',
    interest: pin.interest ?? '', mood: pin.mood ?? '',
    user_created: pin.user_created ?? pin.userCreated ?? true,
  });
  if (error) throw error;
}

/** @param {string} mapId @param {string} pinId */
export async function deletePinRemote(mapId, pinId) {
  const { error } = await supabase.from('user_pins').delete()
    .eq('id', pinId).eq('map_id', mapId);
  if (error) throw error;
}

// ── Éditeur carte (map.html) — table `pins`, session utilisateur ─────────────
// Variantes utilisées par la carte Leaflet : filtre status=active, création
// via la RPC create_pin (bypasse le schema cache PostgREST pour 'category').

// UUID toutes versions (les ids non-UUID sont des pins temporaires locaux)
function isAnyUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/** @param {string} roadtripId @returns {Promise<RoadtripPin[]>} */
export async function fetchRoadtripPins(roadtripId) {
  const { data, error } = await supabase
    .from('pins')
    .select('*')
    .eq('roadtrip_id', roadtripId)
    .eq('status', 'active')
    .order('order_index', { ascending: true });
  if (error) throw error;
  return data;
}

async function rpcCreatePin(roadtripId, pin, id) {
  const { error } = await supabase.rpc('create_pin', {
    p_id:          id,
    p_roadtrip_id: roadtripId,
    p_title:       pin.name,
    p_category:    pin.category || 'base',
    p_lat:         pin.lat,
    p_lng:         pin.lng,
    p_description: pin.description || '',
    p_type:        pin.type || 'stop',
    p_status:      'active',
    p_order_index: pin.order_index ?? 0,
  });
  if (error) throw error;
}

/**
 * @param {string} roadtripId
 * @param {{ id?: string, name: string, category?: string, lat: number, lng: number,
 *           description?: string, type?: string, order_index?: number }} pin
 */
export async function createRoadtripPin(roadtripId, pin) {
  const id = isAnyUUID(pin.id) ? pin.id : generateUUID();
  await rpcCreatePin(roadtripId, pin, id);
  return { id, title: pin.name, category: pin.category || 'nature',
           lat: pin.lat, lng: pin.lng };
}

/** pin.id UUID → mise à jour, sinon → création via RPC (fin de liste) */
export async function upsertRoadtripPin(roadtripId, pin) {
  if (isAnyUUID(pin.id)) {
    const { error } = await supabase
      .from('pins')
      .update({
        title:       pin.name,
        category:    pin.category,
        lat:         pin.lat,
        lng:         pin.lng,
        description: pin.description || '',
        updated_at:  new Date().toISOString(),
      })
      .eq('id', pin.id);
    if (error) throw error;
  } else {
    await rpcCreatePin(roadtripId, { ...pin, order_index: 999 }, generateUUID());
  }
}

/**
 * Met à jour l'order_index — et la journée si fournie — de chaque pin
 * (parallèle, UUID seulement). Les échecs individuels sont ignorés —
 * l'ordre sera resynchronisé au prochain drag & drop.
 * @param {string[]} pinIds
 * @param {number[]} [days] - journée de chaque pin, parallèle à pinIds
 */
export async function updatePinOrder(pinIds, days = null) {
  const rows = pinIds
    .map((id, i) => ({ id, order_index: i, day: days?.[i] ?? null }))
    .filter(r => isAnyUUID(r.id));
  if (!rows.length) return;
  await Promise.all(rows.map(({ id, order_index, day }) =>
    supabase.from('pins')
      .update(day === null ? { order_index } : { order_index, day })
      .eq('id', id)
  ));
}

/** @param {string} _roadtripId @param {string} pinId */
export async function deleteRoadtripPin(_roadtripId, pinId) {
  if (!isAnyUUID(pinId)) return; // pin temporaire jamais persisté
  const { error } = await supabase.from('pins').delete().eq('id', pinId);
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
