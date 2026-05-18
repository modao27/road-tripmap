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

import { supabase, SESSION_BACKUP_KEY } from '../../shared/lib/supabaseClient.js';
import { onAuthChange }                from './authService.js';
import { getProfile }                  from './profileService.js';

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
  console.log('[saveSessionBackup] access_token:', session.access_token ? session.access_token.slice(-10) : 'ABSENT');
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

onAuthChange(async (user, event, session) => {
  console.log('[AuthStore]', event, user?.email ?? null);

  if (event === 'SIGNED_IN' && user) {
    // session vient directement de l'event — pas d'appel getSession() qui deadlockerait
    saveSessionBackup(session);
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
    // setSession() ne peut pas être appelé depuis ce callback : Supabase tient
    // un verrou interne pendant _notifyAllSubscribers. L'appeler ici deadlocke
    // le listener interne qui met à jour les headers auth → 401 sur toutes les
    // requêtes DB. On diffère avec setTimeout pour sortir du contexte du verrou.
    setTimeout(async () => {
      try {
        const restored = await tryRestoreFromBackup();
        if (!restored) setState({ user: null, loading: false, error: null });
        // Si restored : setSession() a émis SIGNED_IN → setState géré là-bas
      } catch {
        setState({ user: null, loading: false, error: null });
      }
    }, 0);
    return; // loading reste true jusqu'à la restauration async
  }

  if (event === 'TOKEN_REFRESHED' && user) {
    saveSessionBackup(session);
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
