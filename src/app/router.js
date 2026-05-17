/**
 * @fileoverview Routeur hash-based SPA.
 * Routes statiques : #/ #/login #/register #/dashboard #/roadtrips/new
 * Routes dynamiques : #/roadtrips/:id
 *
 * Usage :
 *   import { router } from './router.js';
 *   router.navigate('roadtrips/new');
 *   router.onNavigate(({ path, component, params, needsAuth }) => …);
 */

/**
 * @typedef {Object} RouteContext
 * @property {string}              path      - Chemin brut (ex: 'roadtrips/abc-123')
 * @property {string}              component - Nom du composant (ex: 'roadtrip')
 * @property {Record<string,string>} params  - Segments dynamiques (ex: { id: 'abc-123' })
 * @property {boolean}             needsAuth
 */

// ── Routes statiques ──────────────────────────────────────────────────────────

const STATIC = {
  '':               { component: 'home',         needsAuth: false },
  'login':          { component: 'login',         needsAuth: false },
  'register':       { component: 'register',      needsAuth: false },
  'dashboard':      { component: 'dashboard',     needsAuth: true  },
  'roadtrips/new':  { component: 'roadtrip-new',  needsAuth: true  },
};

// ── Routes dynamiques (ordre de priorité décroissant) ─────────────────────────

const DYNAMIC = [
  {
    pattern:   /^roadtrips\/(?!new$)(.+)$/,
    component: 'roadtrip',
    needsAuth: true,
    /** @param {RegExpMatchArray} m */
    params:    (m) => ({ id: m[1] }),
  },
];

// ── Listeners ────────────────────────────────────────────────────────────────

/** @type {Set<(ctx: RouteContext) => void>} */
const listeners = new Set();

function currentPath() {
  return window.location.hash.replace(/^#\/?/, '') || '';
}

function resolve(path) {
  // Statique exact
  if (path in STATIC) {
    return { ...STATIC[path], path, params: {} };
  }
  // Dynamique avec capture
  for (const route of DYNAMIC) {
    const m = path.match(route.pattern);
    if (m) return { component: route.component, needsAuth: route.needsAuth, path, params: route.params(m) };
  }
  // Fallback → home
  return { ...STATIC[''], path, params: {} };
}

function dispatch() {
  const ctx = resolve(currentPath());
  listeners.forEach(fn => fn(ctx));
}

window.addEventListener('hashchange', dispatch);

// Les modules ES sont différés et s'exécutent après le parsing du DOM.
// DOMContentLoaded peut avoir déjà été émis : on vérifie readyState
// et on dispatch directement si le DOM est prêt, sinon on attend l'événement.
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', dispatch);
} else {
  // DOM déjà prêt (probable avec ES modules différés)
  setTimeout(dispatch, 0);
}

// ── API publique ──────────────────────────────────────────────────────────────

export const router = {
  /**
   * @param {string} path - ex: 'dashboard', 'roadtrips/new', 'roadtrips/uuid'
   */
  navigate(path) {
    const hash = path ? `#/${path}` : '#/';
    if (window.location.hash === hash) { dispatch(); return; }
    window.location.hash = hash;
  },

  /**
   * @param {(ctx: RouteContext) => void} fn
   * @returns {() => void}
   */
  onNavigate(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  currentPath,
  resolve,
};
