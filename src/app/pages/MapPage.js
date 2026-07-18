/**
 * @fileoverview MapPage — la carte Leaflet complète dans la SPA.
 *
 * Routes servies :
 *   #/roadtrips/:id  → éditeur de roadtrip (params.id, UUID)
 *   #/map            → carte libre (carte personnelle)
 *   #/map/:slug      → carte partagée (snapshot public)
 *
 * Markup : ../../features/map/mapPageTemplate.js ; logique :
 * ../../features/map/mapApp.js (initMapApp). map.html n'est plus qu'une
 * redirection de compatibilité vers ces routes.
 *
 * Cycle de vie : renderMapPage retourne une fonction de démontage que
 * main.js appelle à la navigation suivante. Elle abort() le signal passé
 * à initMapApp (tous les listeners document/window des modules carte y
 * sont attachés), détruit l'instance Leaflet, désactive css/style.css
 * (qui pose body { overflow: hidden }) et restaure document.title.
 */

import { MAP_PAGE_HTML } from '../../features/map/mapPageTemplate.js';

// Versions épinglées + hash SRI (Leaflet était dans index.html avant
// d'être chargé ici à la demande — mêmes URLs, mêmes hash)
const LEAFLET_JS = {
  url:       'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  integrity: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH',
};
const LEAFLET_CSS = {
  url:       'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  integrity: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H',
};
const MARKERCLUSTER_JS = {
  url:       'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  integrity: 'sha384-eXVCORTRlv4FUUgS/xmOyr66XBVraen8ATNLMESp92FKXLAMiKkerixTiBvXriZr',
};
const MARKERCLUSTER_CSS = {
  url:       'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  integrity: 'sha384-pmjIAcz2bAn0xukfxADbZIb3t8oRT9Sv0rvO+BR5Csr6Dhqq+nZs59P0pPKQJkEV',
};

function loadCss(href, integrity = null) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`link[href="${href}"]`);
    if (existing) { resolve(existing); return; }
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = href;
    if (integrity) { link.integrity = integrity; link.crossOrigin = 'anonymous'; }
    link.onload  = () => resolve(link);
    link.onerror = () => reject(new Error(`CSS load failed: ${href}`));
    document.head.appendChild(link);
  });
}

function loadScript(src, integrity = null) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    if (integrity) { script.integrity = integrity; script.crossOrigin = 'anonymous'; }
    script.onload  = resolve;
    script.onerror = () => reject(new Error(`Script load failed: ${src}`));
    document.head.appendChild(script);
  });
}

let assetsPromise = null;
// <link css/style.css> — désactivé hors carte : il pose des règles globales
// (body { overflow: hidden }, fond) qui casseraient les autres pages.
let mapCssLink = null;

/** Charge Leaflet + markercluster + style.css (une seule fois par document). */
function ensureMapAssets() {
  assetsPromise ??= Promise.all([
    loadCss('css/style.css').then(link => { mapCssLink = link; }),
    loadCss(LEAFLET_CSS.url, LEAFLET_CSS.integrity),
    loadCss(MARKERCLUSTER_CSS.url, MARKERCLUSTER_CSS.integrity),
    // markercluster étend window.L — chargement séquentiel obligatoire
    loadScript(LEAFLET_JS.url, LEAFLET_JS.integrity)
      .then(() => loadScript(MARKERCLUSTER_JS.url, MARKERCLUSTER_JS.integrity)),
  ]);
  return assetsPromise;
}

/**
 * @param {HTMLElement} container
 * @param {{ id?: string, slug?: string }} [params]
 * @returns {() => void} démontage — appelé par main.js à la navigation suivante
 */
export function renderMapPage(container, params = {}) {
  const mapParam      = params.id ?? params.slug ?? null;
  const previousTitle = document.title;
  const lifecycle     = new AbortController();

  container.innerHTML = MAP_PAGE_HTML;

  const ready = ensureMapAssets()
    .then(() => {
      // Navigation déjà repartie pendant le chargement des assets :
      // ne pas monter, et laisser style.css désactivé
      if (lifecycle.signal.aborted) {
        if (mapCssLink) mapCssLink.disabled = true;
        return null;
      }
      if (mapCssLink) mapCssLink.disabled = false;
      return import('../../features/map/mapApp.js')
        .then(({ initMapApp }) => initMapApp({ mapParam, signal: lifecycle.signal }));
    })
    .catch(() => {
      const mapEl = container.querySelector('#map');
      if (mapEl) mapEl.innerHTML =
        "<p style='margin:24px;font:16px system-ui;color:#1E293B'>La carte n'a pas pu se charger. Vérifie ta connexion internet puis recharge la page.</p>";
      return null;
    });

  return function cleanup() {
    lifecycle.abort();                    // listeners document/window, même mid-init
    ready.then(destroy => destroy?.());   // timers + instance Leaflet, une fois l'init finie
    if (mapCssLink) mapCssLink.disabled = true;
    document.title = previousTitle;
  };
}
