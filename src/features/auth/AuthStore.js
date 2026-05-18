/**
 * @fileoverview Store auth — état singleton de la session utilisateur.
 *
 * Pattern Supabase v2 : onAuthStateChange émet INITIAL_SESSION une fois
 * au démarrage avec la session persistée (localStorage), puis émet
 * SIGNED_IN / SIGNED_OUT sur les changements suivants.
 * → Plus de IIFE séparé, zéro race condition.
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
 * @property {boolean}          loading  - true uniquement avant INITIAL_SESSION
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

// ── Unique source de vérité : onAuthStateChange ───────────────────────────────
// Premier appel = INITIAL_SESSION (session localStorage ou null)
// Appels suivants = SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED…
onAuthChange(async user => {
  setState({ user, loading: false, error: null });
  await loadProfile(user);
});

// ── API publique ──────────────────────────────────────────────────────────────

export const authStore = {
  /** @returns {AuthState} */
  getState: () => ({ ...state }),

  /**
   * @param {(state: AuthState) => void} fn
   * @returns {() => void}
   */
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
