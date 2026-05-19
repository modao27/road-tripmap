/**
 * @fileoverview Service d'authentification Supabase.
 * Responsabilité : opérations auth (sign in/up/out, session).
 * Ne touche pas au DOM ni à l'état applicatif.
 *
 * @typedef {import('@supabase/supabase-js').User} User
 * @typedef {import('@supabase/supabase-js').Session} Session
 */

import { supabase } from '../../shared/lib/supabaseClient.js';

/**
 * @typedef {Object} AuthResult
 * @property {User|null}   user
 * @property {string|null} error - Message d'erreur localisé
 */

// ── Messages d'erreur localisés ───────────────────────────────────────────────

const ERROR_MESSAGES = {
  'Invalid login credentials':          'Email ou mot de passe incorrect.',
  'Email not confirmed':                'Confirme ton email avant de te connecter.',
  'User already registered':            'Un compte existe déjà avec cet email.',
  'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.',
  'Signup requires a valid password':   'Mot de passe invalide.',
  'rate limit':                         'Trop de tentatives. Réessaie dans quelques minutes.',
  'For security purposes':              'Trop de tentatives. Réessaie dans quelques minutes.',
};

function localizeError(message = '') {
  for (const [key, translated] of Object.entries(ERROR_MESSAGES)) {
    if (message.toLowerCase().includes(key.toLowerCase())) return translated;
  }
  return 'Une erreur est survenue. Réessaie.';
}

// ── Opérations auth ───────────────────────────────────────────────────────────

/**
 * Connexion avec email + mot de passe.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<AuthResult>}
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: localizeError(error.message) };
  return { user: data.user, error: null };
}

/**
 * Inscription avec email + mot de passe.
 * Note : Supabase envoie un email de confirmation par défaut.
 * Désactivable dans Dashboard → Auth → Email Confirmations.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<AuthResult>}
 */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { user: null, error: localizeError(error.message) };
  return { user: data.user, error: null };
}

/**
 * Déconnexion.
 * @returns {Promise<void>}
 */
export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * Récupère la session active (null si non connecté).
 * @returns {Promise<Session|null>}
 */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/**
 * Envoie un email de réinitialisation de mot de passe.
 * L'URL de redirection doit être whitelistée dans Supabase →
 * Authentication → URL Configuration → Redirect URLs.
 * @param {string} email
 * @returns {Promise<{ error: string|null }>}
 */
export async function resetPasswordForEmail(email) {
  const redirectTo = window.location.origin + '/';
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { error: localizeError(error.message) };
  return { error: null };
}

/**
 * Met à jour le mot de passe de l'utilisateur connecté.
 * À appeler uniquement après un événement PASSWORD_RECOVERY.
 * @param {string} newPassword
 * @returns {Promise<{ error: string|null }>}
 */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: localizeError(error.message) };
  return { error: null };
}

/**
 * Abonne une callback aux changements d'état auth (login, logout, refresh).
 * @param {(user: User|null) => void} callback
 * @returns {() => void} Fonction de désabonnement
 */
export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null, event, session);
  });
  return () => subscription.unsubscribe();
}
