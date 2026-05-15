/**
 * @fileoverview Composant LocationSearchInput — géocodage Nominatim.
 *
 * Usage :
 *   const input = new LocationSearchInput(containerEl, {
 *     placeholder: 'Point de départ…',
 *     onSelect: ({ label, lat, lng }) => { … },
 *   });
 *   input.getValue();   // { label, lat, lng } | null
 *   input.clear();
 *   input.destroy();
 */

import { NOMINATIM_URL } from '../../config/index.js';

/**
 * @typedef {Object} LocationResult
 * @property {string} label - Nom affiché
 * @property {number} lat
 * @property {number} lng
 */

export class LocationSearchInput {
  /**
   * @param {HTMLElement} container
   * @param {{
   *   placeholder?: string,
   *   onSelect?:    (result: LocationResult) => void,
   *   debounce?:    number,
   * }} options
   */
  constructor(container, options = {}) {
    this._container  = container;
    this._onSelect   = options.onSelect ?? (() => {});
    this._debounce   = options.debounce ?? 350;
    this._value      = null;
    this._candidates = [];
    this._timer      = null;
    this._ctrl       = null;

    this._render(options.placeholder ?? 'Rechercher un lieu…');
    this._attach();
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  _render(placeholder) {
    this._container.innerHTML = `
      <div class="lsi">
        <div class="lsi__input-wrap">
          <input class="lsi__input form-field__input"
                 type="search" autocomplete="off"
                 placeholder="${placeholder}"
                 aria-label="${placeholder}"
                 aria-autocomplete="list"
                 aria-expanded="false">
          <button class="lsi__clear" type="button" aria-label="Effacer" hidden>✕</button>
        </div>

        <!-- Tag du lieu sélectionné -->
        <div class="lsi__tag" hidden>
          <span class="lsi__tag-label"></span>
          <button class="lsi__tag-clear" type="button" aria-label="Effacer la sélection">✕</button>
        </div>

        <!-- Dropdown -->
        <ul class="lsi__results" role="listbox" hidden></ul>

        <!-- Statut -->
        <span class="lsi__status" aria-live="polite"></span>
      </div>`;

    this._input    = this._container.querySelector('.lsi__input');
    this._clearBtn = this._container.querySelector('.lsi__clear');
    this._tag      = this._container.querySelector('.lsi__tag');
    this._tagLabel = this._container.querySelector('.lsi__tag-label');
    this._tagClear = this._container.querySelector('.lsi__tag-clear');
    this._results  = this._container.querySelector('.lsi__results');
    this._status   = this._container.querySelector('.lsi__status');
  }

  // ── Événements ────────────────────────────────────────────────────────────

  _attach() {
    this._input.addEventListener('input',   () => this._onInput());
    this._input.addEventListener('keydown', (e) => this._onKeydown(e));
    this._input.addEventListener('blur',    () => setTimeout(() => this._closeDropdown(), 150));
    this._clearBtn.addEventListener('click', () => this.clear());
    this._tagClear.addEventListener('click', () => this.clear());
    this._results.addEventListener('click',  (e) => {
      const li = e.target.closest('[data-idx]');
      if (li) this._select(+li.dataset.idx);
    });
  }

  _onInput() {
    const q = this._input.value.trim();
    this._clearBtn.hidden = !q;

    if (q.length < 2) { this._closeDropdown(); return; }

    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._search(q), this._debounce);
  }

  _onKeydown(e) {
    if (e.key === 'Escape') { this._closeDropdown(); this._input.blur(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); this._focusItem(0); }
  }

  _focusItem(idx) {
    const items = this._results.querySelectorAll('[data-idx]');
    if (items[idx]) items[idx].focus();
  }

  // ── Géocodage ─────────────────────────────────────────────────────────────

  async _search(q) {
    if (this._ctrl) this._ctrl.abort();
    this._ctrl = new AbortController();
    this._setStatus('⟳ Recherche…');

    try {
      const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=fr`;
      const res = await fetch(url, { signal: this._ctrl.signal });
      this._candidates = await res.json();
      this._renderResults();
      this._setStatus('');
    } catch (e) {
      if (e.name !== 'AbortError') this._setStatus('Erreur de recherche.');
    }
  }

  _renderResults() {
    if (!this._candidates.length) {
      this._setStatus('Aucun résultat.');
      this._closeDropdown();
      return;
    }
    this._results.innerHTML = this._candidates.map((r, i) => {
      const parts = r.display_name.split(', ');
      return `<li class="lsi__item" role="option" data-idx="${i}" tabindex="-1">
        <span class="lsi__item-name">${parts[0]}</span>
        <span class="lsi__item-detail">${parts.slice(1, 4).join(', ')}</span>
      </li>`;
    }).join('');
    this._results.hidden = false;
    this._input.setAttribute('aria-expanded', 'true');
  }

  _select(idx) {
    const r     = this._candidates[idx];
    if (!r) return;
    const label = r.display_name.split(', ').slice(0, 2).join(', ');
    this._value = { label, lat: parseFloat(r.lat), lng: parseFloat(r.lon) };

    this._input.hidden     = true;
    this._clearBtn.hidden  = true;
    this._tag.hidden       = false;
    this._tagLabel.textContent = label;
    this._closeDropdown();
    this._onSelect(this._value);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _closeDropdown() {
    this._results.hidden = true;
    this._input.setAttribute('aria-expanded', 'false');
    clearTimeout(this._timer);
  }

  _setStatus(msg) { this._status.textContent = msg; }

  // ── API publique ──────────────────────────────────────────────────────────

  /** @returns {LocationResult|null} */
  getValue() { return this._value; }

  clear() {
    this._value = null;
    this._candidates = [];
    this._input.value  = '';
    this._input.hidden = false;
    this._clearBtn.hidden = true;
    this._tag.hidden = true;
    this._closeDropdown();
    this._setStatus('');
    this._input.focus();
  }

  destroy() {
    clearTimeout(this._timer);
    if (this._ctrl) this._ctrl.abort();
  }
}
