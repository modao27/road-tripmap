/**
 * @fileoverview Service roadtrips — CRUD Supabase avec miroir localStorage.
 * Supabase est la source de vérité ; localStorage sert de cache offline.
 *
 * RLS Supabase filtre automatiquement les lignes accessibles :
 *   - roadtrips de l'utilisateur (owner)
 *   - roadtrips dont il est membre
 *   - roadtrips publics/partagés
 * Donc listRoadtrips() n'a PAS besoin de filtrer côté client.
 *
 * @typedef {import('../../shared/types/index.js').Roadtrip} Roadtrip
 */

import { supabase }                             from '../../shared/lib/supabaseClient.js';
import { storageGet, storageSet } from '../../shared/utils/storage.js';

const LOCAL_KEY = 'roadtrips';

// ── Cache localStorage ────────────────────────────────────────────────────────

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

function localRemove(id) {
  localSave(localList().filter(r => r.id !== id));
  const prefix = `rt:${id}:`;
  Object.keys(localStorage).filter(k => k.startsWith(prefix))
    .forEach(k => localStorage.removeItem(k));
}

// ── Lecture ───────────────────────────────────────────────────────────────────

/**
 * Liste tous les roadtrips accessibles par l'utilisateur courant.
 * Le filtre est appliqué par RLS côté Supabase — aucun userId requis.
 * Inclut : roadtrips possédés + roadtrips où l'utilisateur est membre.
 * Repli sur localStorage si Supabase indisponible.
 * @returns {Promise<Roadtrip[]>}
 */
export async function listRoadtrips() {
  try {
    const { data, error } = await supabase
      .from('roadtrips')
      .select('*, pins(count)')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    // Normalise : extrait le compte de pins et le met à plat sur l'objet
    const trips = (data ?? []).map(({ pins, ...t }) => ({
      ...t,
      pin_count: pins?.[0]?.count ?? 0,
    }));
    localSave(trips);
    return trips;
  } catch {
    return localList();
  }
}

/**
 * Charge un roadtrip par son UUID.
 * @param {string} id
 * @returns {Promise<Roadtrip|null>}
 */
export async function getRoadtrip(id) {
  try {
    const { data, error } = await supabase
      .from('roadtrips')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (data) localUpsert(data);
    return data;
  } catch {
    return localList().find(r => r.id === id) ?? null;
  }
}

/**
 * Charge un roadtrip par son slug (partage).
 * Accessible même sans authentification si visibility = 'public'|'shared'.
 * @param {string} slug
 * @returns {Promise<Roadtrip|null>}
 */
export async function getRoadtripBySlug(slug) {
  const { data, error } = await supabase
    .from('roadtrips')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ── Création ──────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   title:       string,
 *   description?: string,
 *   startLabel?:  string,
 *   startLat?:    number|null,
 *   startLng?:    number|null,
 *   userId:       string,
 *   coverColor?:  string,
 * }} params
 * @returns {Promise<Roadtrip>}
 */
export async function createRoadtrip({
  title, description = '', startLabel = '',
  startLat = null, startLng = null,
  userId, coverColor = '#1f5f43',
}) {
  const { data, error } = await supabase
    .from('roadtrips')
    .insert({
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
      cover_color:  coverColor,
    })
    .select()
    .single();
  if (error) throw error;
  localUpsert(data);
  return data;
}

// ── Mise à jour ───────────────────────────────────────────────────────────────

/**
 * @param {string}           id
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
 * Génère un slug unique et publie le roadtrip en 'shared'.
 * @param {string} id
 * @param {string} [baseSlug] - Si absent, dérivé du titre
 * @returns {Promise<Roadtrip>}
 */
export async function publishRoadtrip(id, baseSlug) {
  const roadtrip = await getRoadtrip(id);
  if (!roadtrip) throw new Error('Roadtrip introuvable.');

  const slug = await generateUniqueSlug(baseSlug ?? slugify(roadtrip.title));
  return updateRoadtrip(id, { visibility: 'shared', slug });
}

/**
 * Repasse le roadtrip en 'private' et efface le slug.
 * @param {string} id
 * @returns {Promise<Roadtrip>}
 */
export async function unpublishRoadtrip(id) {
  return updateRoadtrip(id, { visibility: 'private', slug: null });
}

// ── Suppression ───────────────────────────────────────────────────────────────

/**
 * @param {string} id
 */
export async function deleteRoadtrip(id) {
  const { error } = await supabase.from('roadtrips').delete().eq('id', id);
  if (error) throw error;
  localRemove(id);
}

// ── Collaboration ─────────────────────────────────────────────────────────────

/**
 * Invite un utilisateur comme membre d'un roadtrip.
 * @param {string} roadtripId
 * @param {string} email
 * @param {'editor'|'viewer'} [role='editor']
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function inviteMember(roadtripId, email, role = 'editor') {
  // Cherche le profil par email via la fonction RPC
  const { data: profiles, error: lookupErr } = await supabase
    .rpc('get_profile_by_email', { p_email: email });
  if (lookupErr) throw lookupErr;
  if (!profiles?.length) return { ok: false, message: 'Aucun compte trouvé pour cet email.' };

  const userId = profiles[0].id;
  const { error } = await supabase
    .from('roadtrip_members')
    .upsert({ roadtrip_id: roadtripId, user_id: userId, role },
             { onConflict: 'roadtrip_id,user_id' });
  if (error) throw error;
  return { ok: true, message: `${profiles[0].display_name || email} a rejoint le roadtrip.` };
}

/**
 * Liste les membres d'un roadtrip.
 * @param {string} roadtripId
 */
export async function listMembers(roadtripId) {
  const { data, error } = await supabase
    .from('roadtrip_members')
    .select('user_id, role, profiles(display_name, email)')
    .eq('roadtrip_id', roadtripId);
  if (error) throw error;
  return data ?? [];
}

/**
 * Retire un membre d'un roadtrip.
 * @param {string} roadtripId
 * @param {string} userId
 */
export async function removeMember(roadtripId, userId) {
  const { error } = await supabase
    .from('roadtrip_members')
    .delete()
    .eq('roadtrip_id', roadtripId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ── Helpers slug ──────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // supprime les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function generateUniqueSlug(base) {
  let slug = base;
  let i    = 2;
  while (true) {
    const { data } = await supabase
      .from('roadtrips').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i++}`;
  }
}
