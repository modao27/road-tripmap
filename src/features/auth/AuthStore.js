/**
 * @fileoverview Store auth — état singleton de la session utilisateur.
 *
 * Supabase est configuré avec storage: sessionStorage (supabaseClient.js).
 * sessionStorage persiste dans le même onglet à travers les navigations
 * (index.html ↔ map.html) → INITIAL_SESSION reçoit l'utilisateur directement,
 * sans mécanisme de backup/restore manuel.
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
 */

/** @type {AuthState} */
let state = { user: null, profile: null, loading: true, error: null };

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
    setState({ user: user ?? null, loading: false, error: null });
    if (user) await loadProfile(user);
    return;
  }

  if (event === 'SIGNED_OUT') {
    setState({ user: null, profile: null, loading: false, error: null });
    return;
  }

  if (event === 'TOKEN_REFRESHED' && user) {
    setState({ user, loading: false, error: null });
    return;
  }

  setState({ user, loading: false, error: null });
});

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

  async refreshProfile() {
    if (state.user) await loadProfile(state.user);
  },
};
