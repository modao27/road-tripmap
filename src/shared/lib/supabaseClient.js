/**
 * @fileoverview Client Supabase singleton du SPA.
 *
 * Utilise sessionStorage (via l'option storage) plutôt que localStorage
 * pour persister la session. Avantages :
 * - Le build UMD ne persiste pas en localStorage de façon fiable
 * - sessionStorage survit aux navigations dans le même onglet (index ↔ map)
 * - Isolation totale du client map.html (persistSession: false)
 */

const SUPABASE_URL      = 'https://cmgrszuyzdrmnddyetfq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZ3JzenV5emRybW5kZHlldGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzg5NDEsImV4cCI6MjA5NDA1NDk0MX0.v3a6qvhcMyCPCb1uF1ykabXtoPHBh2HYVPjGS369OH8';

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
    storage:          window.sessionStorage, // persiste dans le même onglet, survit aux navigations
    storageKey:       'rta-session',         // clé isolée, jamais touchée par map.html
    persistSession:   true,
    autoRefreshToken: true,
  },
});
