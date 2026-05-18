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

// Injecte le JWT utilisateur sur toutes les requêtes PostgREST (/rest/v1/).
// Les requêtes auth (/auth/v1/) passent sans modification (garder la clé anon).
function restFetch(url, options = {}) {
  const urlStr = typeof url === 'string' ? url : url.toString();
  if (urlStr.includes('/rest/v1/')) {
    try {
      const raw = sessionStorage.getItem(SESSION_BACKUP_KEY);
      const { access_token } = raw ? JSON.parse(raw) : {};
      // Décoder le JWT pour voir s'il est expiré et quelle est son audience
      if (access_token) {
        try {
          const payload = JSON.parse(atob(access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          const now = Math.floor(Date.now() / 1000);
          console.log('[restFetch] JWT payload:', {
            role:    payload.role,
            aud:     payload.aud,
            exp:     new Date(payload.exp * 1000).toISOString(),
            expired: payload.exp < now,
            iss:     payload.iss,
          });
        } catch { console.log('[restFetch] JWT decode failed'); }
        options = {
          ...options,
          headers: { ...(options.headers ?? {}), Authorization: `Bearer ${access_token}` },
        };
      } else {
        console.log('[restFetch]', urlStr.split('?')[0].split('/rest/v1/')[1], '— token absent, requête avec clé anon');
      }
    } catch (e) { console.error('[restFetch] erreur:', e); }
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
