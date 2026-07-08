/**
 * @fileoverview Session utilisateur — cache synchrone au-dessus du client.
 * Le SDK gère le JWT et son refresh ; on expose juste l'id utilisateur
 * courant (sync) et une promesse de résolution initiale de la session
 * (à attendre avant les appels authentifiés — évite la race condition
 * JWT expiré sur mobile).
 */

import { supabase } from './supabaseClient.js';

let _userId = null;

supabase.auth.onAuthStateChange((_event, session) => {
  _userId = session?.user?.id ?? null;
});

/** Résolution initiale (refresh si le token est expiré). */
export const sessionReady = supabase.auth.getSession().then(({ data: { session } }) => {
  _userId = session?.user?.id ?? null;
});

/** @returns {string|null} */
export function getCurrentUserId() {
  return _userId;
}
