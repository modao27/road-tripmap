// Enrichissement Wikivoyage des popups villages / points d'ancrage.
// Données et parsing : src/features/sources/wikivoyageService.js.
// Ce module ne gère que le rendu dans les popups Leaflet.
import { escapeHtml as esc } from '../src/shared/utils/escape.js';
import { fetchWikivoyageSections } from '../src/features/sources/wikivoyageService.js';

export function initWikivoyagePopups(map) {
  map.on('popupopen', async (e) => {
    const container = e.popup.getElement()?.querySelector('.wiki-enriched');
    if (!container || container.dataset.loading) return;
    container.dataset.loading = 'true';

    const lat = +container.dataset.wikiLat;
    const lng = +container.dataset.wikiLng;
    if (!lat || !lng) { container.innerHTML = ''; return; }

    try {
      const result = await fetchWikivoyageSections(lat, lng);
      if (!result) { container.innerHTML = ''; e.popup._updatePosition?.(); return; }

      const { title, pageUrl, sections } = result;

      container.innerHTML = `
        <div class="wiki-sections">
          <p class="wiki-heading">📖 ${esc(title)}</p>
          ${sections.map(s => `
            <details class="wiki-item">
              <summary class="wiki-item-hd">${s.icon} ${s.label}</summary>
              <ul class="wiki-item-list">
                ${s.items.map(it => `<li>${esc(it)}</li>`).join('')}
              </ul>
            </details>`).join('')}
          <a class="wiki-more" href="${esc(pageUrl)}" target="_blank" rel="noopener">Article complet sur Wikivoyage →</a>
        </div>`;

      // Accordion exclusif : ferme les autres sections à l'ouverture d'une
      const details = container.querySelectorAll('.wiki-item');
      details.forEach(d => d.addEventListener('toggle', () => {
        if (d.open) details.forEach(other => { if (other !== d) other.open = false; });
      }));
    } catch {
      container.innerHTML = '';
    }
    e.popup._updatePosition?.();
  });
}
