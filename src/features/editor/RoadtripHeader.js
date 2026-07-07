/**
 * @fileoverview RoadtripHeader — en-tête de l'éditeur.
 * Titre du road trip, retour dashboard, indicateur de sauvegarde.
 */

import { escapeHtml as esc } from '../../shared/utils/escape.js';

/**
 * @param {HTMLElement} container
 * @param {{
 *   title:    string,
 *   saving:   boolean,
 *   onBack:   () => void,
 * }} props
 */
export function renderRoadtripHeader(container, { title, saving, onBack }) {
  container.innerHTML = `
    <header class="editor-header">
      <button class="btn btn--ghost btn--sm editor-header__back" id="editorBack">
        ← Mes road trips
      </button>
      <h1 class="editor-header__title">${title ? esc(title) : 'Chargement…'}</h1>
      <span class="editor-header__status ${saving ? 'editor-header__status--saving' : ''}"
            aria-live="polite">
        ${saving ? '⏳ Sauvegarde…' : ''}
      </span>
    </header>`;

  container.querySelector('#editorBack').addEventListener('click', onBack);
}
