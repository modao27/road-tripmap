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

// ── Roadtrip pins (table 'pins', nécessite JWT utilisateur) ──────────────────
//
// Lit le JWT depuis sessionStorage['rta-session'] (persisté par le SPA).
// Fetch REST direct — évite les problèmes de session asynchrone du SDK.

function _authHeaders(json = false) {
  let token = SUPABASE_ANON_KEY;
  try {
    const raw = window.sessionStorage.getItem('rta-session');
    const s   = raw ? JSON.parse(raw) : null;
    if (s?.access_token) token = s.access_token;
  } catch { /* fallback anon */ }
  const h = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function _getCurrentUserId() {
  try {
    const raw = window.sessionStorage.getItem('rta-session');
    return raw ? (JSON.parse(raw)?.user?.id ?? null) : null;
  } catch { return null; }
}

function _isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export async function fetchRoadtripPins(roadtripId) {
  const url = `${SUPABASE_URL}/rest/v1/pins` +
    `?roadtrip_id=eq.${roadtripId}&status=eq.active&order=order_index.asc&select=*`;
  const res = await fetch(url, { headers: _authHeaders() });
  if (!res.ok) throw new Error(`fetchRoadtripPins HTTP ${res.status}`);
  return res.json();
}

export async function fetchRoadtripTitle(roadtripId) {
  const url = `${SUPABASE_URL}/rest/v1/roadtrips?id=eq.${roadtripId}&select=title`;
  const res = await fetch(url, { headers: _authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0]?.title ?? null;
}

// pin.name → title, pin.id UUID → PATCH, sinon → POST (nouveau pin)
export async function upsertRoadtripPin(roadtripId, pin) {
  const headers = _authHeaders(true);
  if (_isUUID(pin.id)) {
    // Mise à jour d'un pin existant
    const url = `${SUPABASE_URL}/rest/v1/pins?id=eq.${pin.id}`;
    const res = await fetch(url, {
      method:  'PATCH',
      headers,
      body: JSON.stringify({
        title:       pin.name,
        category:    pin.category,
        lat:         pin.lat,
        lng:         pin.lng,
        description: pin.description || '',
        updated_at:  new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`upsertRoadtripPin PATCH ${res.status}`);
  } else {
    // Nouveau pin — Postgres génère l'UUID (l'objet local garde son id temporaire)
    const url = `${SUPABASE_URL}/rest/v1/pins`;
    const res = await fetch(url, {
      method:  'POST',
      headers,
      body: JSON.stringify({
        roadtrip_id: roadtripId,
        created_by:  _getCurrentUserId(),
        title:       pin.name,
        category:    pin.category || 'nature',
        lat:         pin.lat,
        lng:         pin.lng,
        description: pin.description || '',
        type:        'stop',
        status:      'active',
        order_index: 999,
      }),
    });
    if (!res.ok) throw new Error(`upsertRoadtripPin POST ${res.status}`);
  }
}

// Supprime uniquement les pins dont l'id est un UUID (pins chargés depuis la table)
export async function deleteRoadtripPin(roadtripId, pinId) {
  if (!_isUUID(pinId)) return; // pin temporaire jamais persisté
  const url = `${SUPABASE_URL}/rest/v1/pins?id=eq.${pinId}`;
  const res = await fetch(url, { method: 'DELETE', headers: _authHeaders() });
  if (!res.ok) throw new Error(`deleteRoadtripPin ${res.status}`);
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
