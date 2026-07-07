// ── Adaptateur Supabase de la carte legacy (map.html) ─────────────────────────
// Un seul client pour toute l'application : src/shared/lib/supabaseClient.js
// (session sessionStorage['rta-session'], partagée avec la SPA index.html).
// Les CRUD vivent dans src/features/ — ce module ne fait que ré-exporter
// sous les noms historiques attendus par js/app.js, js/pins.js, js/share.js.
//
// Disparaîtra en phase B5 (portage de la carte dans la SPA), avec map.html.

import { supabase } from '../src/shared/lib/supabaseClient.js';

export { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/shared/lib/supabaseClient.js';

// ── User pins + overrides (tables user_pins / place_overrides) ────────────────
export {
  fetchPinsRemote      as fetchUserPins,
  upsertPinRemote      as upsertUserPin,
  deletePinRemote      as deleteUserPinRemote,
  fetchOverridesRemote as fetchOverrides,
  upsertOverrideRemote as upsertOverride,
  deleteOverrideRemote,
  // Éditeur roadtrip (table pins)
  fetchRoadtripPins,
  createRoadtripPin,
  upsertRoadtripPin,
  updatePinOrder,
  deleteRoadtripPin,
} from '../src/features/pins/pinService.js';

// ── Roadtrips ─────────────────────────────────────────────────────────────────
export { fetchRoadtripInfo, updateRoadtripCenter } from '../src/features/roadtrips/roadtripService.js';

// ── Cartes partagées (snapshots publics) ──────────────────────────────────────
export { saveSharedMap, loadSharedMap } from '../src/features/sharing/sharingService.js';

// ── Session ───────────────────────────────────────────────────────────────────
// Le client rafraîchit le JWT lui-même ; on ne garde ici qu'un cache
// synchrone de l'id utilisateur pour le mode lecture seule de app.js.

let _userId = null;

supabase.auth.onAuthStateChange((_event, session) => {
  _userId = session?.user?.id ?? null;
});

// Résolution initiale (refresh si le token est expiré). app.js l'attend
// avant les appels authentifiés — évite la race condition JWT sur mobile.
export const sessionReady = supabase.auth.getSession().then(({ data: { session } }) => {
  _userId = session?.user?.id ?? null;
});

export function getCurrentUserId() {
  return _userId;
}
