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

/**
 * Résolution initiale (refresh si le token est expiré), plafonnée :
 * hors ligne, le refresh JWT retente avec backoff (~10 s) — on ne bloque
 * pas la carte aussi longtemps. Si la session arrive après le plafond,
 * onAuthStateChange met _userId à jour et les appels suivants en profitent.
 */
const SESSION_WAIT_MS = 3000;

export const sessionReady = Promise.race([
  supabase.auth.getSession().then(({ data: { session } }) => {
    _userId = session?.user?.id ?? null;
  }),
  new Promise(resolve => setTimeout(resolve, SESSION_WAIT_MS)),
]);

/** @returns {string|null} */
export function getCurrentUserId() {
  return _userId;
}
