/**
 * @fileoverview Store auth — état singleton de la session utilisateur.
 * Equivalent vanilla JS du hook useAuth (React).
 * Charge aussi le profil utilisateur après connexion.
 *
 * Usage :
 *   import { authStore } from './AuthStore.js';
 *   const unsubscribe = authStore.subscribe(({ user, profile, loading }) => { ... });
 *   authStore.getState();  // lecture synchrone
 *
 * @typedef {import('@supabase/supabase-js').User}        User
 * @typedef {import('./profileService.js').UserProfile}   UserProfile
 */

import { getSession, onAuthChange } from './authService.js';
import { getProfile }               from './profileService.js';

/**
 * @typedef {Object} AuthState
 * @property {User|null}        user
 * @property {UserProfile|null} profile  - Chargé après connexion, null pendant loading
 * @property {boolean}          loading  - true pendant la vérification initiale
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

/** Charge le profil et met à jour l'état. */
async function loadProfile(user) {
  if (!user) { setState({ profile: null }); return; }
  try {
    const profile = await getProfile(user.id);
    setState({ profile });
  } catch {
    // Profil non encore créé (peut arriver juste après inscription)
    // Le trigger handle_new_user le créera, on retente au prochain changement d'état
    setState({ profile: null });
  }
}

// ── Initialisation asynchrone ─────────────────────────────────────────────────
(async () => {
  try {
    const session = await getSession();
    const user    = session?.user ?? null;
    setState({ user, loading: false });
    await loadProfile(user);
  } catch {
    setState({ user: null, loading: false });
  }
})();

// Écoute les changements auth Supabase (login, logout, token refresh)
onAuthChange(async user => {
  setState({ user, loading: false, error: null });
  await loadProfile(user);
});

// ── API publique ──────────────────────────────────────────────────────────────

export const authStore = {
  /** @returns {AuthState} */
  getState: () => ({ ...state }),

  /**
   * Abonne une fonction aux changements d'état.
   * L'appelle immédiatement avec l'état courant.
   * @param {(state: AuthState) => void} fn
   * @returns {() => void} Désabonnement
   */
  subscribe(fn) {
    subscribers.add(fn);
    fn(state);
    return () => subscribers.delete(fn);
  },

  setError(error)  { setState({ error }); },
  clearError()     { setState({ error: null }); },

  /** Recharge le profil manuellement (ex: après modification). */
  async refreshProfile() {
    if (state.user) await loadProfile(state.user);
  },
};
