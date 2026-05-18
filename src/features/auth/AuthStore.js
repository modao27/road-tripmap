/**
 * @fileoverview Store auth — état singleton de la session utilisateur.
 *
 * sessionStorage comme backup de session :
 * Le build UMD de Supabase ne persiste pas la session en localStorage
 * de façon fiable quand plusieurs clients coexistent (map.html + index.html).
 * On sauvegarde manuellement les tokens dans sessionStorage après chaque
 * SIGNED_IN — sessionStorage persiste dans le même onglet à travers les
 * navigations de page, et n'est jamais touché par le client de map.html.
 *
 * @typedef {import('@supabase/supabase-js').User}        User
 * @typedef {import('./profileService.js').UserProfile}   UserProfile
 */

import { supabase }             from '../../shared/lib/supabaseClient.js';
import { onAuthChange }         from './authService.js';
import { getProfile }           from './profileService.js';

const SESSION_BACKUP_KEY = '__rta_session_backup';

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

// ── Gestion du backup de session ──────────────────────────────────────────────

function saveSessionBackup(session) {
  if (!session) { sessionStorage.removeItem(SESSION_BACKUP_KEY); return; }
  try {
    sessionStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify({
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
      expires_at:    session.expires_at,
    }));
  } catch { /* sessionStorage plein ou désactivé */ }
}

function clearSessionBackup() {
  sessionStorage.removeItem(SESSION_BACKUP_KEY);
}

async function tryRestoreFromBackup() {
  try {
    const raw = sessionStorage.getItem(SESSION_BACKUP_KEY);
    if (!raw) return false;
    const { access_token, refresh_token } = JSON.parse(raw);
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error || !data.session) { clearSessionBackup(); return false; }
    return true; // onAuthStateChange va émettre SIGNED_IN
  } catch {
    clearSessionBackup();
    return false;
  }
}

// ── Listener principal ────────────────────────────────────────────────────────

onAuthChange(async (user, event) => {
  console.log('[AuthStore]', event, user?.email ?? null);

  if (event === 'SIGNED_IN' && user) {
    // Sauvegarde les tokens après chaque connexion réussie
    const { data } = await supabase.auth.getSession();
    saveSessionBackup(data.session);
    setState({ user, loading: false, error: null });
    await loadProfile(user);
    return;
  }

  if (event === 'SIGNED_OUT') {
    clearSessionBackup();
    setState({ user: null, profile: null, loading: false, error: null });
    return;
  }

  if (event === 'INITIAL_SESSION' && !user) {
    // Supabase n'a pas trouvé de session → tente la restauration depuis sessionStorage
    const restored = await tryRestoreFromBackup();
    if (restored) return; // onAuthChange va refirer avec SIGNED_IN
    setState({ user: null, loading: false, error: null });
    return;
  }

  if (event === 'TOKEN_REFRESHED' && user) {
    const { data } = await supabase.auth.getSession();
    saveSessionBackup(data.session);
  }

  setState({ user, loading: false, error: null });
  await loadProfile(user);
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
