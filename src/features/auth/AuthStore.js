/**
 * @fileoverview Store auth — état singleton de la session utilisateur.
 *
 * Supabase persiste la session en localStorage (supabaseClient.js) :
 * INITIAL_SESSION reçoit l'utilisateur directement, y compris après un
 * redémarrage de l'app (PWA hors ligne).
 *
 * @typedef {import('@supabase/supabase-js').User}        User
 * @typedef {import('./profileService.js').UserProfile}   UserProfile
 */

import { onAuthChange } from './authService.js';
import { getProfile }   from './profileService.js';

/**
 * @typedef {Object} AuthState
 * @property {User|null}        user
 * @property {UserProfile|null} profile
 * @property {boolean}          loading
 * @property {string|null}      error
 * @property {boolean}          needsPasswordReset
 */

/** @type {AuthState} */
let state = { user: null, profile: null, loading: true, error: null, needsPasswordReset: false };

/** @type {Set<(state: AuthState) => void>} */
const subscribers = new Set();

function setState(partial) {
  state = { ...state, ...partial };
  subscribers.forEach(fn => fn(state));
}

async function loadProfile(user) {
  if (!user) { setState({ profile: null }); return; }
  try {
    const profile = await getProfile(user.id);
    setState({ profile });
  } catch {
    setState({ profile: null });
  }
}

// ── Listener principal ────────────────────────────────────────────────────────

onAuthChange(async (user, event) => {
  if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
    setState({ user: user ?? null, loading: false, error: null, needsPasswordReset: false });
    if (user) await loadProfile(user);
    return;
  }

  if (event === 'SIGNED_OUT') {
    setState({ user: null, profile: null, loading: false, error: null, needsPasswordReset: false });
    return;
  }

  if (event === 'PASSWORD_RECOVERY') {
    setState({ user: user ?? null, loading: false, error: null, needsPasswordReset: true });
    return;
  }

  if (event === 'USER_UPDATED') {
    setState({ user: user ?? null, loading: false, needsPasswordReset: false });
    return;
  }

  if (event === 'TOKEN_REFRESHED' && user) {
    setState({ user, loading: false, error: null });
    return;
  }

  setState({ user, loading: false, error: null });
});

// Session stockée, lue en direct (sans validation réseau) — pour ne pas
// bloquer l'app quand le refresh JWT est impossible (hors ligne).
function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('rta-session'))?.user ?? null;
  } catch {
    return null;
  }
}

// Hors ligne, le refresh du JWT peut retarder INITIAL_SESSION de ~10 s
// (retries avec backoff) : au-delà du plafond on rend l'app avec
// l'utilisateur stocké (optimiste — RLS protège de toute façon les
// données), et l'événement re-déclenchera les subscribers à l'arrivée
// réelle de la session. Sans session stockée : anonyme.
setTimeout(() => {
  if (state.loading) setState({ user: readStoredUser(), loading: false });
}, 3500);

// ── API publique ──────────────────────────────────────────────────────────────

export const authStore = {
  getState: () => ({ ...state }),

  subscribe(fn) {
    subscribers.add(fn);
    fn(state);
    return () => subscribers.delete(fn);
  },

  setError(error)  { setState({ error }); },
  clearError()     { setState({ error: null }); },
  clearPasswordReset() { setState({ needsPasswordReset: false }); },

  async refreshProfile() {
    if (state.user) await loadProfile(state.user);
  },
};
