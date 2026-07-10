/**
 * @fileoverview Client Supabase singleton du SPA.
 *
 * Session persistée en localStorage : indispensable depuis le mode
 * hors-ligne (PWA) — la session doit survivre à la fermeture de l'app,
 * on ne peut pas se reconnecter sans réseau. (L'ancien sessionStorage
 * datait du pont index.html ↔ map.html, disparu avec la fusion SPA.)
 */

// Source unique des credentials — exportés pour les URLs d'Edge Functions
// (overpass.js, datatourisme.js) et le bearer anonyme.
export const SUPABASE_URL      = 'https://cmgrszuyzdrmnddyetfq.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZ3JzenV5emRybW5kZHlldGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzg5NDEsImV4cCI6MjA5NDA1NDk0MX0.v3a6qvhcMyCPCb1uF1ykabXtoPHBh2HYVPjGS369OH8';

if (!window.supabase) {
  throw new Error(
    '[supabaseClient] window.supabase est undefined.\n' +
    'Cause probable : le CDN Supabase n\'a pas chargé avant les modules ES.\n' +
    'Vérifier la balise <script src="...supabase.js"> dans index.html.'
  );
}

const { createClient } = window.supabase;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:          window.localStorage, // survit aux redémarrages (PWA hors ligne)
    storageKey:       'rta-session',
    persistSession:   true,
    autoRefreshToken: true,
  },
});
