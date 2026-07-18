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
import { createRoadtripPin, deletePinRemote } from '../pins/pinService.js';
import { loadUserPins, saveUserPins, getOrCreateMapId } from '../map/storage.js';
import { appBaseUrl } from '../../shared/utils/url.js';

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
  userId, coverColor = '#235D7E',
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

/**
 * Infos d'en-tête pour l'éditeur carte (map.html) — sélection légère,
 * null si introuvable ou non autorisé, sans miroir localStorage.
 * @param {string} id
 * @returns {Promise<Pick<Roadtrip,'title'|'owner_id'|'center_lat'|'center_lng'|'default_zoom'|'start_lat'|'start_lng'|'start_label'>|null>}
 */
export async function fetchRoadtripInfo(id) {
  try {
    const { data, error } = await supabase
      .from('roadtrips')
      .select('title,owner_id,center_lat,center_lng,default_zoom,start_lat,start_lng,start_label')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  } catch {
    return null;
  }
}

// ── Import de la carte libre ──────────────────────────────────────────────────

/**
 * Convertit les pins de la carte libre (user_pins/localStorage) en un
 * nouveau roadtrip, puis vide la carte libre (locale et distante) —
 * réconcilie l'ancien modèle « map_id anonyme » avec les roadtrips.
 * @param {string} userId
 * @returns {Promise<Roadtrip|null>} null si la carte libre est vide
 */
export async function importFreeMapAsRoadtrip(userId) {
  const pins = loadUserPins();
  if (!pins.length) return null;

  const trip = await createRoadtrip({
    title:       'Ma carte libre',
    description: 'Importé depuis la carte libre',
    userId,
  });

  // Séquentiel : préserve l'ordre (order_index) et évite de marteler l'API
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i];
    // interest/tip/mood n'existent pas sur les pins de roadtrip :
    // repliés dans la description pour ne rien perdre
    const description = [p.description, p.interest, p.tip, p.mood]
      .filter(Boolean).join('\n');
    await createRoadtripPin(trip.id, {
      name:        p.name,
      category:    p.category || 'base',
      lat:         p.lat,
      lng:         p.lng,
      description,
      order_index: i,
    });
  }

  // La carte libre a déménagé : purge locale + distante (échecs tolérés,
  // un pin orphelin côté user_pins est sans conséquence)
  const mapId = getOrCreateMapId();
  await Promise.allSettled(pins.map(p => deletePinRemote(mapId, p.id)));
  saveUserPins([]);

  return trip;
}

// ── Mise à jour ───────────────────────────────────────────────────────────────

/**
 * Centre + point de départ du roadtrip (onboarding de l'éditeur carte).
 * @param {string} id
 * @param {{ lat: number, lng: number, zoom?: number, label?: string }} params
 */
export async function updateRoadtripCenter(id, { lat, lng, zoom = 12, label = '' }) {
  const { error } = await supabase
    .from('roadtrips')
    .update({
      center_lat:   lat,
      center_lng:   lng,
      default_zoom: zoom,
      start_lat:    lat,
      start_lng:    lng,
      start_label:  label,
    })
    .eq('id', id);
  if (error) throw error;
}

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
 * - Si l'email est enregistré → ajout direct dans roadtrip_members.
 * - Sinon → création d'une invitation + envoi d'un magic link Supabase.
 * @param {string}             roadtripId
 * @param {string}             email
 * @param {'editor'|'viewer'}  [role='editor']
 * @returns {Promise<{ ok: boolean, type: 'added'|'invited', message: string }>}
 */
export async function inviteMember(roadtripId, email, role = 'editor') {
  // Cherche le profil par email (utilisateur déjà inscrit)
  const { data: profiles, error: lookupErr } = await supabase
    .rpc('get_profile_by_email', { p_email: email });
  if (lookupErr) throw lookupErr;

  if (profiles?.length) {
    // Utilisateur existant → ajout direct
    const userId = profiles[0].id;
    const { error } = await supabase
      .from('roadtrip_members')
      .upsert({ roadtrip_id: roadtripId, user_id: userId, role },
               { onConflict: 'roadtrip_id,user_id' });
    if (error) throw error;
    return {
      ok:      true,
      type:    'added',
      message: `${profiles[0].display_name || email} a rejoint le roadtrip.`,
    };
  }

  // Utilisateur inconnu → invitation par magic link
  await sendInvitationEmail(roadtripId, email, role);
  return {
    ok:      true,
    type:    'invited',
    message: `Invitation envoyée à ${email}. L'accès sera activé à la création du compte.`,
  };
}

/**
 * Crée une invitation en DB et envoie un magic link via Supabase Auth.
 * @param {string}             roadtripId
 * @param {string}             email
 * @param {'editor'|'viewer'}  role
 */
export async function sendInvitationEmail(roadtripId, email, role = 'editor') {
  const { data: { user } } = await supabase.auth.getUser();

  // Enregistre l'invitation (idempotent sur doublon)
  const { error: insertErr } = await supabase
    .from('roadtrip_invitations')
    .upsert(
      { roadtrip_id: roadtripId, invited_by: user.id, email, role },
      { onConflict: 'roadtrip_id,email', ignoreDuplicates: false }
    );
  if (insertErr) throw insertErr;

  // Envoie le magic link — l'invité sera redirigé vers l'app après inscription
  const redirectTo = appBaseUrl(); // sous-chemin compris (GitHub Pages)
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  });
  if (otpErr) throw otpErr;
}

/**
 * Accepte toutes les invitations en attente pour l'utilisateur courant.
 * Appelée automatiquement au chargement de l'app après une connexion.
 * @returns {Promise<number>} Nombre d'invitations acceptées
 */
export async function acceptPendingInvitations() {
  const { data, error } = await supabase.rpc('accept_pending_invitations');
  if (error) throw error;
  return data ?? 0;
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
