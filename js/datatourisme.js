// Module de recherche DATAtourisme pour l'onglet Découvrir.
// Interface symétrique à overpass.js : search(lat, lng, radiusKm, selectedCats) + clear().
// Catégories et appel Edge Function : src/features/sources/datatourismeService.js
// (source unique). Ce module garde le DOM et Leaflet.
import { escapeHtml as esc, safeUrl } from '../src/shared/utils/escape.js';
import { DT_CATEGORIES, fetchDatatourismeNearby } from '../src/features/sources/datatourismeService.js';

export { DT_CATEGORIES };

export function initDatatourisme({
  map,
  resultListEl,
  statusEl,
  clearBtn,
  discoverCountEl,
  discoverEmptyEl,
  toastWrap,
  showToastFn,
  onDiscoverResults,
}) {
  const dtLayer   = L.layerGroup().addTo(map);
  let isFetching  = false;

  function clear() {
    dtLayer.clearLayers();
    if (resultListEl)    resultListEl.innerHTML  = '';
    if (statusEl)        statusEl.textContent    = '';
    if (clearBtn)        clearBtn.hidden         = true;
    if (discoverCountEl) discoverCountEl.textContent = '';
    if (discoverEmptyEl) discoverEmptyEl.hidden  = false;
    onDiscoverResults?.(0);
  }

  async function search(lat, lng, radiusKm, selectedCats) {
    if (isFetching) return;
    isFetching = true;

    clear();
    if (statusEl) statusEl.textContent = '⟳ Recherche en cours…';

    try {
      const data = await fetchDatatourismeNearby({
        lat,
        lng,
        radius:     radiusKm,
        categories: [...selectedCats].join(','),
      });

      // Rendu markers + liste
      let total = 0;
      const listHtml = [];

      for (const [key, catDef] of Object.entries(DT_CATEGORIES)) {
        if (!selectedCats.has(key)) continue;
        const items = data[key] ?? [];
        if (!items.length) continue;

        listHtml.push(`
          <li class="dt-discover-header">
            <span class="dt-discover-header-label">${catDef.icon} ${catDef.label}</span>
          </li>`);

        for (const item of items) {
          total++;

          if (item.lat && item.lng) {
            const icon = L.divIcon({
              className:   '',
              html:        `<div class="overpass-marker" style="--color:${catDef.color}">${esc(item.icon)}</div>`,
              iconSize:    [30, 30],
              iconAnchor:  [15, 15],
              popupAnchor: [0, -16],
            });
            const popup = `
              <article class="popup" style="--color:${catDef.color}">
                <h2>${esc(item.label)}</h2>
                <div class="popup-category"><span>${esc(item.icon)}</span>${esc(catDef.label)}</div>
                ${item.address ? `<p class="op-result-meta">📍 ${esc(item.address)}${item.dist != null ? ` · ${esc(item.dist)} km` : ''}</p>` : item.dist != null ? `<p class="op-result-meta">${esc(item.dist)} km</p>` : ''}
                ${item.description ? `<p class="popup-desc-text">${esc(item.description)}</p>` : ''}
                ${item.phone ? `<a class="osm-link" href="tel:${esc(item.phone)}">📞 ${esc(item.phone)}</a>` : ''}
                ${item.email ? `<a class="osm-link" href="mailto:${esc(item.email)}">✉️ ${esc(item.email)}</a>` : ''}
                ${safeUrl(item.url) ? `<a class="osm-link" href="${safeUrl(item.url)}" target="_blank" rel="noopener">🌐 Site web</a>` : ''}
              </article>`;
            L.marker([item.lat, item.lng], { icon, title: item.label })
              .bindPopup(popup)
              .addTo(dtLayer);
          }

          listHtml.push(`
            <li class="place-item">
              <div class="place-meta">
                <span class="place-icon" style="background:${catDef.color}">${esc(item.icon)}</span>
                <div class="op-result-info">
                  ${safeUrl(item.url)
                    ? `<a class="place-item-name" href="${safeUrl(item.url)}" target="_blank" rel="noopener">${esc(item.label)}</a>`
                    : `<strong>${esc(item.label)}</strong>`}
                  <span class="op-result-meta">${esc(catDef.label)}${item.dist != null ? ` · ${esc(item.dist)} km` : ''}</span>
                </div>
              </div>
            </li>`);
        }
      }

      if (resultListEl)    resultListEl.innerHTML       = listHtml.join('');
      if (discoverEmptyEl) discoverEmptyEl.hidden       = total > 0;
      if (discoverCountEl) discoverCountEl.textContent  = total ? String(total) : '';
      if (clearBtn)        clearBtn.hidden              = total === 0;

      const n = total;
      if (statusEl) statusEl.textContent = n
        ? `${n} résultat${n > 1 ? 's' : ''} · données DATAtourisme`
        : '';

      onDiscoverResults?.(n);

      if (n === 0) showToastFn(toastWrap, 'Aucun résultat dans cette zone', '');
      else         showToastFn(toastWrap, `${n} lieu${n > 1 ? 'x' : ''} trouvé${n > 1 ? 's' : ''}`, 'success');

    } catch (err) {
      if (statusEl) statusEl.textContent = '';
      showToastFn(toastWrap, 'Erreur DATAtourisme, réessaie dans quelques secondes.', 'error');
    } finally {
      isFetching = false;
    }
  }

  return { search, clear };
}
