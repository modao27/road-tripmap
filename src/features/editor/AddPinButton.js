/**
 * @fileoverview AddPinButton — bouton de bascule du mode ajout de pin.
 */

/**
 * @param {HTMLElement} container
 * @param {{
 *   active:    boolean,
 *   onToggle:  () => void,
 * }} props
 */
export function renderAddPinButton(container, { active, onToggle }) {
  container.innerHTML = `
    <button class="add-pin-btn ${active ? 'add-pin-btn--active' : ''}"
            id="addPinBtn"
            type="button"
            title="${active ? 'Annuler' : 'Ajouter un pin — cliquez sur la carte'}"
            aria-pressed="${active}">
      ${active ? '✕ Annuler' : '+ Ajouter un pin'}
    </button>`;

  container.querySelector('#addPinBtn').addEventListener('click', onToggle);
}
