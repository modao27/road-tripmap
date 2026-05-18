// ── Configuration Supabase ────────────────────────────────────────────────────
// Remplace ces deux valeurs par celles de ton projet :
// Dashboard Supabase → Project Settings → API
const SUPABASE_URL      = 'https://cmgrszuyzdrmnddyetfq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZ3JzenV5emRybW5kZHlldGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzg5NDEsImV4cCI6MjA5NDA1NDk0MX0.v3a6qvhcMyCPCb1uF1ykabXtoPHBh2HYVPjGS369OH8';

// Le CDN Supabase expose window.supabase (chargé avant ce module dans map.html)
const { createClient } = window.supabase;

// persistSession:false et autoRefreshToken:false empêchent ce client
// (utilisé uniquement pour les données de la carte) d'interférer avec
// la session auth gérée par le SPA (index.html / src/shared/lib/supabaseClient.js)
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:   false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// ── User pins ─────────────────────────────────────────────────────────────────

export async function fetchUserPins(mapId) {
  const { data, error } = await db
    .from('user_pins')
    .select('*')
    .eq('map_id', mapId);
  if (error) throw error;
  return data;
}

export async function upsertUserPin(mapId, pin) {
  const { error } = await db
    .from('user_pins')
    .upsert({ ...pin, map_id: mapId });
  if (error) throw error;
}

export async function deleteUserPinRemote(mapId, pinId) {
  const { error } = await db
    .from('user_pins')
    .delete()
    .eq('id', pinId)
    .eq('map_id', mapId);
  if (error) throw error;
}

// ── Place overrides ───────────────────────────────────────────────────────────

export async function fetchOverrides(mapId) {
  const { data, error } = await db
    .from('place_overrides')
    .select('*')
    .eq('map_id', mapId);
  if (error) throw error;
  // Convertit le tableau en { placeId: { name, category, ... } }
  return Object.fromEntries(
    data.map(({ place_id, map_id, updated_at, ...fields }) => [place_id, fields])
  );
}

export async function upsertOverride(mapId, placeId, override) {
  const { error } = await db
    .from('place_overrides')
    .upsert({ ...override, place_id: placeId, map_id: mapId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function deleteOverrideRemote(mapId, placeId) {
  const { error } = await db
    .from('place_overrides')
    .delete()
    .eq('place_id', placeId)
    .eq('map_id', mapId);
  if (error) throw error;
}

// ── Cartes partagées (snapshots publics) ──────────────────────────────────────

export async function saveSharedMap(baseSlug, payload) {
  // Trouve un slug unique (ajoute -2, -3… si déjà pris)
  let slug = baseSlug;
  let i = 2;
  while (true) {
    const { data } = await db.from('shared_maps').select('slug').eq('slug', slug).maybeSingle();
    if (!data) break;
    slug = `${baseSlug}-${i++}`;
  }
  const { error } = await db.from('shared_maps').insert({ slug, ...payload });
  if (error) throw error;
  return slug;
}

export async function loadSharedMap(slug) {
  const { data, error } = await db.from('shared_maps').select('*').eq('slug', slug).single();
  if (error) throw error;
  return data;
}
