// ── Configuration Supabase ────────────────────────────────────────────────────
// Remplace ces deux valeurs par celles de ton projet :
// Dashboard Supabase → Project Settings → API
const SUPABASE_URL      = 'https://cmgrszuyzdrmnddyetfq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZ3JzenV5emRybW5kZHlldGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzg5NDEsImV4cCI6MjA5NDA1NDk0MX0.v3a6qvhcMyCPCb1uF1ykabXtoPHBh2HYVPjGS369OH8';

// Le CDN Supabase expose window.supabase (chargé avant ce module dans map.html)
const { createClient } = window.supabase;

// Client données (anon, pas de session — pour user_pins, shared_maps, etc.)
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:   false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// ── Session partagée avec le SPA ──────────────────────────────────────────────
// Lit et rafraîchit le token depuis sessionStorage['rta-session'].
// Maintient _cachedToken à jour → _authHeaders() toujours valide même après
// expiration du JWT (évite les 401 sur fetchRoadtripPins / fetchRoadtripInfo).

let _cachedToken = (() => {
  try {
    const s = JSON.parse(window.sessionStorage.getItem('rta-session') || 'null');
    return s?.access_token || SUPABASE_ANON_KEY;
  } catch { return SUPABASE_ANON_KEY; }
})();

const _sessionClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:          window.sessionStorage,
    storageKey:       'rta-session',
    persistSession:   true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Met à jour le token en cache à chaque changement (refresh, sign-in/out)
_sessionClient.auth.onAuthStateChange((_event, session) => {
  _cachedToken = session?.access_token || SUPABASE_ANON_KEY;
});

// Résolution initiale (refresh si le token est expiré)
_sessionClient.auth.getSession().then(({ data: { session } }) => {
  if (session?.access_token) _cachedToken = session.access_token;
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
  const h = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${_cachedToken}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function _getCurrentUserId() {
  try {
    const s = JSON.parse(window.sessionStorage.getItem('rta-session') || 'null');
    return s?.user?.id ?? null;
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

export async function fetchRoadtripInfo(roadtripId) {
  const url = `${SUPABASE_URL}/rest/v1/roadtrips` +
    `?id=eq.${roadtripId}&select=title,center_lat,center_lng,default_zoom,start_lat,start_lng,start_label`;
  const res = await fetch(url, { headers: _authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] ?? null;
}

export async function updateRoadtripCenter(roadtripId, { lat, lng, zoom = 12, label = '' }) {
  const url = `${SUPABASE_URL}/rest/v1/roadtrips?id=eq.${roadtripId}`;
  await fetch(url, {
    method: 'PATCH',
    headers: _authHeaders(true),
    body: JSON.stringify({
      center_lat:  lat,
      center_lng:  lng,
      default_zoom: zoom,
      start_lat:   lat,
      start_lng:   lng,
      start_label: label,
    }),
  });
}

// Crée un pin via la fonction RPC create_pin — bypasse le schema cache PostgREST.
async function _rpcCreatePin(roadtripId, pin, id) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/create_pin`;
  const res = await fetch(url, {
    method:  'POST',
    headers: _authHeaders(true),
    body: JSON.stringify({
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
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`create_pin RPC ${res.status}: ${msg}`);
  }
}

export async function createRoadtripPin(roadtripId, pin) {
  const id = crypto.randomUUID();
  await _rpcCreatePin(roadtripId, pin, id);
  return { id, title: pin.name, category: pin.category || 'nature',
           lat: pin.lat, lng: pin.lng };
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
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      console.error('[upsertRoadtripPin PATCH]', msg);
      throw new Error(`upsertRoadtripPin PATCH ${res.status}: ${msg}`);
    }
  } else {
    // Nouveau pin via RPC (bypasse le schema cache pour 'category')
    const id = crypto.randomUUID();
    await _rpcCreatePin(roadtripId, { ...pin, order_index: 999 }, id);
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
