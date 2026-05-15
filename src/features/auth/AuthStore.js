/**
 * @fileoverview Store auth — état singleton de la session utilisateur.
 * Equivalent vanilla JS du hook useAuth (React).
 *
 * Usage :
 *   import { authStore } from './AuthStore.js';
 *   const unsubscribe = authStore.subscribe(({ user, loading }) => { ... });
 *   authStore.getState();  // lecture synchrone
 *
 * @typedef {import('@supabase/supabase-js').User} User
 */

import { getSession, onAuthChange } from './authService.js';

/**
 * @typedef {Object} AuthState
 * @property {User|null} user
 * @property {boolean}   loading - true pendant la vérification initiale
 * @property {string|null} error
 */

/** @type {AuthState} */
let state = { user: null, loading: true, error: null };

/** @type {Set<(state: AuthState) => void>} */
const subscribers = new Set();

function setState(partial) {
  state = { ...state, ...partial };
  subscribers.forEach(fn => fn(state));
}

// ── Initialisation asynchrone ─────────────────────────────────────────────────
// Vérifie la session persistée dès le chargement du module.
(async () => {
  try {
    const session = await getSession();
    setState({ user: session?.user ?? null, loading: false });
  } catch {
    setState({ user: null, loading: false });
  }
})();

// Écoute les changements auth Supabase (login, logout, token refresh)
onAuthChange(user => setState({ user, loading: false, error: null }));

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

  setError(error) { setState({ error }); },
  clearError()    { setState({ error: null }); },
};
