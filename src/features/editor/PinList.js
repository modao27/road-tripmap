/**
 * @fileoverview PinList — liste des pins dans la sidebar de l'éditeur.
 *
 * @typedef {import('../pins/pinService.js').RoadtripPin} RoadtripPin
 */

import { escapeHtml as esc } from '../../shared/utils/escape.js';

const TYPE_EMOJI = { start: '🏁', stop: '🛑', custom: '📍', poi: '⭐' };
const TYPE_LABEL = { start: 'Départ', stop: 'Étape', custom: 'Pin', poi: 'Intérêt' };

/**
 * @param {HTMLElement}  container
 * @param {{
 *   pins:       RoadtripPin[],
 *   selectedId: string|null,
 *   onSelect:   (pin: RoadtripPin) => void,
 * }} props
 */
export function renderPinList(container, { pins, selectedId, onSelect }) {
  if (!pins.length) {
    container.innerHTML = `
      <div class="pin-list-empty">
        <span class="pin-list-empty__icon">📍</span>
        <p>Aucun pin pour l'instant.<br>Clique sur la carte pour en ajouter.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <ul class="pin-list" role="listbox" aria-label="Pins du road trip">
      ${pins.map(pin => `
        <li class="pin-item ${pin.id === selectedId ? 'pin-item--selected' : ''}"
            role="option"
            aria-selected="${pin.id === selectedId}"
            data-pin-id="${esc(pin.id)}"
            tabindex="0">
          <span class="pin-item__emoji">${TYPE_EMOJI[pin.type] ?? '📍'}</span>
          <span class="pin-item__body">
            <span class="pin-item__title">${esc(pin.title)}</span>
            <span class="pin-item__type">${TYPE_LABEL[pin.type] ?? 'Pin'}</span>
          </span>
          <span class="pin-item__coords">
            ${pin.lat.toFixed(3)}, ${pin.lng.toFixed(3)}
          </span>
        </li>`).join('')}
    </ul>`;

  // Délégation click + clavier
  container.querySelector('.pin-list').addEventListener('click', e => {
    const li = e.target.closest('[data-pin-id]');
    if (!li) return;
    const pin = pins.find(p => p.id === li.dataset.pinId);
    if (pin) onSelect(pin);
  });

  container.querySelector('.pin-list').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const li = e.target.closest('[data-pin-id]');
    if (!li) return;
    e.preventDefault();
    const pin = pins.find(p => p.id === li.dataset.pinId);
    if (pin) onSelect(pin);
  });
}
