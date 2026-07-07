/**
 * @fileoverview PinDetailsPanel — panneau de détail / édition d'un pin.
 *
 * @typedef {import('../pins/pinService.js').RoadtripPin} RoadtripPin
 */

import { escapeHtml as esc } from '../../shared/utils/escape.js';

const TYPE_OPTIONS = [
  { value: 'custom', label: '📍 Pin' },
  { value: 'start',  label: '🏁 Départ' },
  { value: 'stop',   label: '🛑 Étape' },
  { value: 'poi',    label: "⭐ Point d'intérêt" },
];

/**
 * @param {HTMLElement} container
 * @param {{
 *   pin:      RoadtripPin,
 *   mode:     'view'|'edit',
 *   saving:   boolean,
 *   onClose:  () => void,
 *   onEdit:   () => void,
 *   onSave:   (fields: Partial<RoadtripPin>) => Promise<void>,
 *   onDelete: (id: string) => Promise<void>,
 *   onFlyTo:  (lat: number, lng: number) => void,
 * }} props
 */
export function renderPinDetailsPanel(container, props) {
  const { pin, mode, saving, onClose, onEdit, onSave, onDelete, onFlyTo } = props;

  if (mode === 'edit') {
    renderEditMode(container, { pin, saving, onSave, onClose });
  } else {
    renderViewMode(container, { pin, saving, onClose, onEdit, onDelete, onFlyTo });
  }
}

// ── Mode lecture ──────────────────────────────────────────────────────────────

function renderViewMode(container, { pin, saving, onClose, onEdit, onDelete, onFlyTo }) {
  container.innerHTML = `
    <aside class="pin-detail" aria-label="Détail du pin">
      <div class="pin-detail__header">
        <h2 class="pin-detail__title">${esc(pin.title)}</h2>
        <button class="pin-detail__close btn btn--icon" type="button"
                aria-label="Fermer" id="pdClose">✕</button>
      </div>

      <span class="pin-detail__badge">${typeLabel(pin.type)}</span>

      ${pin.description
        ? `<p class="pin-detail__desc">${esc(pin.description)}</p>`
        : `<p class="pin-detail__desc pin-detail__desc--empty">Aucune description.</p>`}

      <div class="pin-detail__coords">
        <span>📍 ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}</span>
        <button class="btn btn--ghost btn--sm" type="button" id="pdFlyTo">
          Centrer la carte
        </button>
      </div>

      <div class="pin-detail__actions">
        <button class="btn btn--primary btn--full" type="button" id="pdEdit">
          ✏️ Modifier
        </button>
        <button class="btn btn--ghost" type="button" id="pdDelete"
                ${saving ? 'disabled' : ''}>
          🗑 Supprimer
        </button>
      </div>
    </aside>`;

  container.querySelector('#pdClose').addEventListener('click', onClose);
  container.querySelector('#pdEdit').addEventListener('click', onEdit);
  container.querySelector('#pdFlyTo').addEventListener('click', () => onFlyTo(pin.lat, pin.lng));
  container.querySelector('#pdDelete').addEventListener('click', async () => {
    if (!confirm(`Supprimer le pin "${pin.title}" ?`)) return;
    await onDelete(pin.id);
  });
}

// ── Mode édition ──────────────────────────────────────────────────────────────

function renderEditMode(container, { pin, saving, onSave, onClose }) {
  container.innerHTML = `
    <aside class="pin-detail" aria-label="Modifier le pin">
      <div class="pin-detail__header">
        <h2 class="pin-detail__title">Modifier le pin</h2>
        <button class="pin-detail__close btn btn--icon" type="button"
                aria-label="Annuler" id="pdClose">✕</button>
      </div>

      <form class="pin-detail__form" id="editPinForm" novalidate>
        <label class="form-field">
          <span class="form-field__label">Titre *</span>
          <input class="form-field__input" type="text" id="pdTitle"
                 value="${esc(pin.title)}" maxlength="80" required>
          <span class="form-field__error" id="pdTitleErr"></span>
        </label>

        <label class="form-field">
          <span class="form-field__label">Description</span>
          <textarea class="form-field__input form-field__textarea" id="pdDesc"
                    rows="3" maxlength="500">${esc(pin.description ?? '')}</textarea>
        </label>

        <label class="form-field">
          <span class="form-field__label">Type</span>
          <select class="form-field__input" id="pdType">
            ${TYPE_OPTIONS.map(o =>
              `<option value="${o.value}" ${pin.type === o.value ? 'selected' : ''}>${o.label}</option>`
            ).join('')}
          </select>
        </label>

        <div class="pin-detail__actions">
          <button class="btn btn--ghost" type="button" id="pdCancel">Annuler</button>
          <button class="btn btn--primary" type="submit" id="pdSave"
                  ${saving ? 'disabled' : ''}>
            ${saving ? '⏳…' : '💾 Enregistrer'}
          </button>
        </div>
      </form>
    </aside>`;

  container.querySelector('#pdClose').addEventListener('click', onClose);
  container.querySelector('#pdCancel').addEventListener('click', onClose);

  container.querySelector('#editPinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = container.querySelector('#pdTitle').value.trim();
    if (!title) {
      container.querySelector('#pdTitleErr').textContent = 'Titre requis.';
      return;
    }
    await onSave({
      title,
      description: container.querySelector('#pdDesc').value.trim(),
      type:        container.querySelector('#pdType').value,
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeLabel(type) {
  const labels = { start: '🏁 Départ', stop: '🛑 Étape', custom: '📍 Pin', poi: '⭐ Intérêt' };
  return labels[type] ?? '📍 Pin';
}
