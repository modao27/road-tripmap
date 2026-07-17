/**
 * @fileoverview Point d'entrée SPA — orchestre le routeur et l'auth.
 *
 * Flux :
 *  1. AuthStore initialise la session (async)
 *  2. Routeur écoute les changements de hash
 *  3. À chaque route, vérification auth → rendu page
 */

// ── Affiche les erreurs JS non capturées visiblement (debug) ─────────────────
window.addEventListener('error', ({ message, filename, lineno }) => {
  const app = document.getElementById('app');
  if (app) app.innerHTML = `
    <div style="padding:32px;font-family:monospace;color:#c0392b;background:#fff;min-height:100vh">
      <h2 style="margin:0 0 12px">⚠️ Erreur JavaScript</h2>
      <pre style="white-space:pre-wrap;font-size:0.85rem">${message}\n${filename}:${lineno}</pre>
      <p style="margin-top:16px;color:#666">Ouvre F12 → Console pour le détail complet.</p>
    </div>`;
});

import { initErrorReporter }               from '../shared/lib/errorReporter.js';
import { authStore }                       from '../features/auth/AuthStore.js';
import { router }                          from './router.js';
import { mountThemeToggle }                from '../shared/ui/themeToggle.js';

// Remonte les erreurs non capturées vers Supabase (table client_errors)
initErrorReporter();

// Bouton clair/sombre — flottant, hors #app : survit aux changements de page
mountThemeToggle();
import { acceptPendingInvitations }        from '../features/roadtrips/roadtripService.js';
import { toast }                           from '../shared/ui/toast.js';
import { renderHomePage }           from './pages/HomePage.js';
import { renderLoginPage }          from './pages/LoginPage.js';
import { renderRegisterPage }       from './pages/RegisterPage.js';
import { renderDashboardPage }      from './pages/DashboardPage.js';
import { renderProfilePage }         from './pages/ProfilePage.js';
import { renderForgotPasswordPage }  from './pages/ForgotPasswordPage.js';
import { renderResetPasswordPage }   from './pages/ResetPasswordPage.js';
import { renderMapPage }             from './pages/MapPage.js';

const app = document.getElementById('app');

/** @type {Record<string, (container: HTMLElement, params?: Record<string,string>) => void | (() => void)>} */
const PAGES = {
  'home':      renderHomePage,
  'login':     renderLoginPage,
  'register':  renderRegisterPage,
  'dashboard': renderDashboardPage,
  'profile':         renderProfilePage,
  'forgot-password': renderForgotPasswordPage,
  'reset-password':  renderResetPasswordPage,
  'roadtrip':        renderMapPage,   // #/roadtrips/:id — éditeur carte
  'map':             renderMapPage,   // #/map, #/map/:slug
};

// Démontage de la page courante — MapPage retourne une fonction de cleanup
// (listeners document/window, instance Leaflet, style.css) appelée avant
// chaque nouveau rendu ; les autres pages ne retournent rien.
let pageCleanup = null;

// Vrai tant que la carte est montée — gate authStore.subscribe : les
// événements auth (TOKEN_REFRESHED…) ne doivent pas arracher la carte.
let mapMounted = false;

function unmountCurrentPage() {
  pageCleanup?.();
  pageCleanup = null;
  mapMounted  = false;
}

function renderLoadingScreen() {
  unmountCurrentPage();
  app.innerHTML = `
    <div class="page page--loading" aria-live="polite">
      <span class="spinner" aria-label="Chargement…"></span>
    </div>`;
}

// ── Routing avec garde auth ───────────────────────────────────────────────────

router.onNavigate(({ component, params, needsAuth }) => {
  const { user, loading } = authStore.getState();

  if (loading) { renderLoadingScreen(); return; }

  // ProtectedRoute
  if (needsAuth && !user) { router.navigate('login'); return; }

  // Redirige vers dashboard si connecté sur pages publiques
  if (!needsAuth && user && ['home', 'login', 'register'].includes(component)) {
    router.navigate('dashboard');
    return;
  }

  unmountCurrentPage();
  const renderFn = PAGES[component] ?? PAGES['home'];
  const cleanup  = renderFn(app, params);
  pageCleanup = typeof cleanup === 'function' ? cleanup : null;
  mapMounted  = component === 'map' || component === 'roadtrip';
});

// ── Re-route quand l'état auth change ────────────────────────────────────────
// Couvre : connexion réussie → /dashboard, déconnexion → /

let previousLoading = true;

/** La route active est-elle une page carte ? */
function onMapRoute() {
  const p = router.currentPath();
  return p === 'map' || p.startsWith('map/') || p.startsWith('roadtrips/');
}

authStore.subscribe(({ user, loading, needsPasswordReset }) => {
  // La carte gère sa session (refresh JWT via le client partagé) —
  // ne pas la démonter sur TOKEN_REFRESHED / USER_UPDATED / SIGNED_OUT.
  if (mapMounted) return;

  if (loading) { renderLoadingScreen(); return; }

  // Après réception du lien de réinitialisation → page dédiée
  if (needsPasswordReset) { router.navigate('reset-password'); return; }

  // Après résolution initiale de la session : déclenche la route active
  if (previousLoading && !loading) {
    previousLoading = false;
    // Accepte automatiquement les invitations en attente pour cet utilisateur
    if (user) {
      acceptPendingInvitations().then(count => {
        if (count > 0) {
          toast.success(
            `${count} invitation${count > 1 ? 's' : ''} acceptée${count > 1 ? 's' : ''} — `
            + `de nouveau${count > 1 ? 'x' : ''} road trip${count > 1 ? 's' : ''} dans ton dashboard.`
          );
          // Ne pas arracher l'utilisateur à la carte qu'il vient d'ouvrir
          if (!onMapRoute()) router.navigate('dashboard');
        }
      }).catch(() => { /* silencieux */ });
    }
    window.dispatchEvent(new Event('hashchange'));
    return;
  }

  previousLoading = false;
  const path = router.currentPath();

  if (user && ['', 'login', 'register', 'forgot-password'].includes(path)) {
    router.navigate('dashboard');
  }
  if (!user && path === 'dashboard') {
    router.navigate('login');
  }
});

// ── Service worker (mode hors-ligne) ──────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Résolu contre l'URL de la page (sous-chemin GitHub Pages), pas le module
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI))
      .catch(() => { /* contexte non sécurisé ou hors ligne au premier chargement */ });
  });
}
