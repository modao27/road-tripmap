/**
 * @fileoverview Composant RoadtripList — grille de roadtrips avec états.
 *
 * @typedef {import('../../shared/types/index.js').Roadtrip} Roadtrip
 */

import { renderRoadtripCard, renderRoadtripCardSkeleton } from './RoadtripCard.js';
import { getRoadtripStats }                               from '../roadtrips/roadtripService.js';

/**
 * Rend l'état de chargement (3 squelettes).
 * @param {HTMLElement} container
 */
export function renderListLoading(container) {
  container.innerHTML = `
    <div class="rt-grid">
      ${Array(3).fill(0).map(renderRoadtripCardSkeleton).join('')}
    </div>`;
}

/**
 * Rend l'état vide.
 * @param {HTMLElement} container
 */
export function renderListEmpty(container) {
  container.innerHTML = `
    <div class="rt-empty">
      <span class="rt-empty__icon">🗺️</span>
      <h2 class="rt-empty__title">Aucun road trip pour l'instant</h2>
      <p class="rt-empty__sub">Crée ton premier road trip pour commencer à explorer.</p>
    </div>`;
}

/**
 * Rend l'état d'erreur.
 * @param {HTMLElement} container
 * @param {string}      message
 */
export function renderListError(container, message) {
  container.innerHTML = `
    <div class="alert alert--error" role="alert">
      ${message}
      <button class="btn btn--ghost btn--sm" id="listRetry">Réessayer</button>
    </div>`;
}

/**
 * Rend la liste des roadtrips.
 * @param {HTMLElement} container
 * @param {Roadtrip[]}  trips
 * @param {{ onDelete: (id: string) => void }} handlers
 */
export function renderList(container, trips, handlers) {
  if (!trips.length) { renderListEmpty(container); return; }

  container.innerHTML = `
    <div class="rt-grid">
      ${trips.map((trip, i) => renderRoadtripCard(trip, getRoadtripStats(trip.id), i)).join('')}
    </div>`;

  // Délégation pour "Supprimer"
  container.querySelector('.rt-grid').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="delete"]');
    if (btn) handlers.onDelete(btn.dataset.id);
  });
}
