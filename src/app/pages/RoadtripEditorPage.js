/**
 * @fileoverview RoadtripEditorPage — redirige vers map.html.
 *
 * map.html est l'éditeur complet (route planner, Overpass, GPX, layer switcher…).
 * Cette route SPA (#/roadtrips/:id) délègue vers lui plutôt que de dupliquer
 * l'ensemble des fonctionnalités.
 *
 * Évolution future : quand map.html sera porté dans le SPA, supprimer la
 * redirection et réintégrer l'implémentation complète ici.
 */

import { router } from '../router.js';

/**
 * @param {HTMLElement}         _container
 * @param {{ id: string }}      params
 */
export function renderRoadtripEditorPage(_container, params) {
  const roadtripId = params?.id;
  if (!roadtripId) { router.navigate('dashboard'); return; }
  window.location.href = `map.html?map=${roadtripId}`;
}
