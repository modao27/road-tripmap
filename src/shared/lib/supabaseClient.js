/**
 * @fileoverview Client Supabase singleton du SPA.
 *
 * Problème UMD : le build CDN de Supabase v2 ne met pas à jour les headers
 * Authorization du client PostgREST quand la session est restaurée via
 * setSession() (deadlock interne sur le verrou navigator.locks).
 *
 * Fix : custom fetch qui injecte le token depuis sessionStorage pour toutes
 * les requêtes /rest/v1/ — contourne complètement le mécanisme défaillant.
 * Le token est maintenu à jour par AuthStore (saveSessionBackup après chaque
 * SIGNED_IN / TOKEN_REFRESHED).
 */

const SUPABASE_URL      = 'https://cmgrszuyzdrmnddyetfq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZ3JzenV5emRybW5kZHlldGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzg5NDEsImV4cCI6MjA5NDA1NDk0MX0.v3a6qvhcMyCPCb1uF1ykabXtoPHBh2HYVPjGS369OH8';

export const SESSION_BACKUP_KEY = '__rta_session_backup';

if (!window.supabase) {
  throw new Error(
    '[supabaseClient] window.supabase est undefined.\n' +
    'Cause probable : le CDN Supabase n\'a pas chargé avant les modules ES.\n' +
    'Vérifier la balise <script src="...supabase.js"> dans index.html.'
  );
}

const { createClient } = window.supabase;

// Injecte le JWT utilisateur + apikey sur toutes les requêtes PostgREST (/rest/v1/).
// Les requêtes auth (/auth/v1/) passent sans modification.
//
// Problème : certaines versions du SDK Supabase passent options.headers comme
// instance de Headers (pas un objet plain) — { ...headers_instance } donne {}
// et efface apikey → "No API key found in request".
// Fix : normaliser les headers existants + toujours inclure apikey explicitement.
function restFetch(url, options = {}) {
  const urlStr = typeof url === 'string' ? url : url.toString();
  if (urlStr.includes('/rest/v1/')) {
    try {
      const raw = sessionStorage.getItem(SESSION_BACKUP_KEY);
      const { access_token } = raw ? JSON.parse(raw) : {};
      if (access_token) {
        // Normalise les headers existants (gère Headers instance ET plain object)
        const existing = options.headers instanceof Headers
          ? Object.fromEntries(options.headers.entries())
          : { ...(options.headers ?? {}) };
        options = {
          ...options,
          headers: {
            ...existing,
            apikey:        SUPABASE_ANON_KEY,   // toujours requis par PostgREST
            Authorization: `Bearer ${access_token}`,
          },
        };
      }
    } catch { /* sessionStorage indisponible ou token corrompu */ }
  }
  return fetch(url, options);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'rta-session',
  },
  global: {
    fetch: restFetch,
  },
});
