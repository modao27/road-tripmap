/**
 * @fileoverview Routeur hash-based SPA.
 * Routes : #/ #/login #/register #/dashboard
 *
 * Usage :
 *   import { router } from './router.js';
 *   router.navigate('dashboard');
 *   router.onNavigate(({ path, needsAuth }) => renderPage(path));
 */

/** @typedef {{ path: string, needsAuth: boolean }} RouteContext */

const ROUTES = {
  '':          { needsAuth: false },
  'login':     { needsAuth: false },
  'register':  { needsAuth: false },
  'dashboard': { needsAuth: true  },
};

/** @type {Set<(ctx: RouteContext) => void>} */
const listeners = new Set();

function currentPath() {
  return window.location.hash.replace(/^#\/?/, '') || '';
}

function dispatch() {
  const path  = currentPath();
  const route = ROUTES[path] ?? ROUTES[''];
  listeners.forEach(fn => fn({ path, needsAuth: route.needsAuth }));
}

window.addEventListener('hashchange', dispatch);
// Déclenche la route initiale après que les abonnés s'enregistrent
window.addEventListener('DOMContentLoaded', dispatch);

export const router = {
  /**
   * @param {string} path - ex: 'dashboard', 'login', ''
   */
  navigate(path) {
    const hash = path ? `#/${path}` : '#/';
    if (window.location.hash === hash) { dispatch(); return; }
    window.location.hash = hash;
  },

  /**
   * Enregistre un handler appelé à chaque changement de route.
   * @param {(ctx: RouteContext) => void} fn
   * @returns {() => void} Désabonnement
   */
  onNavigate(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** @returns {string} */
  currentPath,
};
