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

import { authStore }                from '../features/auth/AuthStore.js';
import { router }                   from './router.js';
import { renderHomePage }           from './pages/HomePage.js';
import { renderLoginPage }          from './pages/LoginPage.js';
import { renderRegisterPage }       from './pages/RegisterPage.js';
import { renderDashboardPage }      from './pages/DashboardPage.js';
import { renderProfilePage }        from './pages/ProfilePage.js';
import { renderRoadtripEditorPage } from './pages/RoadtripEditorPage.js';

const app = document.getElementById('app');

/** @type {Record<string, (container: HTMLElement, params?: Record<string,string>) => void>} */
const PAGES = {
  'home':      renderHomePage,
  'login':     renderLoginPage,
  'register':  renderRegisterPage,
  'dashboard': renderDashboardPage,
  'profile':   renderProfilePage,
  'roadtrip':  renderRoadtripEditorPage,
};

function renderLoadingScreen() {
  app.innerHTML = `
    <div class="page page--loading" aria-live="polite">
      <span class="spinner" aria-label="Chargement…"></span>
    </div>`;
}

// ── Routing avec garde auth ───────────────────────────────────────────────────

router.onNavigate(({ path, component, params, needsAuth }) => {
  const { user, loading } = authStore.getState();

  if (loading) { renderLoadingScreen(); return; }

  // ProtectedRoute
  if (needsAuth && !user) { router.navigate('login'); return; }

  // Redirige vers dashboard si connecté sur pages publiques
  if (!needsAuth && user && ['home', 'login', 'register'].includes(component)) {
    router.navigate('dashboard');
    return;
  }

  const renderFn = PAGES[component] ?? PAGES['home'];
  renderFn(app, params);
});

// ── Re-route quand l'état auth change ────────────────────────────────────────
// Couvre : connexion réussie → /dashboard, déconnexion → /

let previousLoading = true;

authStore.subscribe(({ user, loading }) => {
  if (loading) { renderLoadingScreen(); return; }

  // Après résolution initiale de la session : déclenche la route active
  if (previousLoading && !loading) {
    previousLoading = false;
    // hashchange a déjà été dispatché par DOMContentLoaded → re-dispatch
    window.dispatchEvent(new Event('hashchange'));
    return;
  }

  previousLoading = false;
  const path = router.currentPath();

  if (user && ['', 'login', 'register'].includes(path)) {
    router.navigate('dashboard');
  }
  if (!user && path === 'dashboard') {
    router.navigate('login');
  }
});
