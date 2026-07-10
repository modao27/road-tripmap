// Enrichissement Wikivoyage des popups villages / points d'ancrage.
// Données et parsing : src/features/sources/wikivoyageService.js.
// Ce module ne gère que le rendu dans les popups Leaflet.
import { escapeHtml as esc } from '../../shared/utils/escape.js';
import { fetchWikivoyageSections } from '../sources/wikivoyageService.js';

export function initWikivoyagePopups(map) {
  map.on('popupopen', (e) => {
    // Repli <details> injecté par popupHtml — fetch au premier dépliage
    // seulement (P1c) : une popup ouverte ne coûte plus de requête.
    const fold = e.popup.getElement()?.querySelector('details.wiki-enriched');
    if (!fold || fold.dataset.wired) return;
    fold.dataset.wired = 'true';

    fold.addEventListener('toggle', async () => {
      if (!fold.open || fold.dataset.loading) return;
      fold.dataset.loading = 'true';
      const body = fold.querySelector('.popup-fold-body');

      const lat = +fold.dataset.wikiLat;
      const lng = +fold.dataset.wikiLng;
      if (!lat || !lng) { fold.hidden = true; return; }

      try {
        const result = await fetchWikivoyageSections(lat, lng);
        if (!result) { fold.hidden = true; e.popup._updatePosition?.(); return; }

        const { title, pageUrl, sections } = result;

        body.innerHTML = `
          <div class="wiki-sections">
            <p class="wiki-heading">${esc(title)}</p>
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
        const details = body.querySelectorAll('.wiki-item');
        details.forEach(d => d.addEventListener('toggle', () => {
          if (d.open) details.forEach(other => { if (other !== d) other.open = false; });
        }));
      } catch {
        fold.hidden = true;
      }
      e.popup._updatePosition?.();
    });
  });
}
