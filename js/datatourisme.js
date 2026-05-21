// Module de recherche DATAtourisme pour l'onglet Découvrir.
// Interface symétrique à overpass.js : search(lat, lng, radiusKm, selectedCats) + clear().
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

const DT_URL = `${SUPABASE_URL}/functions/v1/datatourisme-nearby`;

export const DT_CATEGORIES = {
  hebergement: { label: 'Hébergements', icon: '🏕', color: '#2477a6' },
  restaurant:  { label: 'Restauration', icon: '🍽', color: '#d56b1d' },
  evenement:   { label: 'Événements',   icon: '📅', color: '#605d80' },
  patrimoine:  { label: 'Patrimoine',   icon: '🏛', color: '#912d2d' },
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
      const res = await fetch(DT_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          lat,
          lng,
          radius:     radiusKm,
          categories: [...selectedCats].join(','),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(data.error);

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
              html:        `<div class="overpass-marker" style="--color:${catDef.color}">${item.icon}</div>`,
              iconSize:    [30, 30],
              iconAnchor:  [15, 15],
              popupAnchor: [0, -16],
            });
            const distStr = item.dist != null ? ` · ${item.dist} km` : '';
            const popup   = `
              <article class="popup" style="--color:${catDef.color}">
                <h2>${esc(item.label)}</h2>
                <div class="popup-category"><span>${item.icon}</span>${esc(catDef.label)}</div>
                ${distStr ? `<p class="op-result-meta">${distStr.trim()}</p>` : ''}
                ${item.url ? `<a class="osm-link" href="${esc(item.url)}" target="_blank" rel="noopener">🌐 Site web</a>` : ''}
              </article>`;
            L.marker([item.lat, item.lng], { icon, title: item.label })
              .bindPopup(popup)
              .addTo(dtLayer);
          }

          listHtml.push(`
            <li class="place-item">
              <div class="place-meta">
                <span class="place-icon" style="background:${catDef.color}">${item.icon}</span>
                <div class="op-result-info">
                  ${item.url
                    ? `<a class="place-item-name" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.label)}</a>`
                    : `<strong>${esc(item.label)}</strong>`}
                  <span class="op-result-meta">${esc(catDef.label)}${item.dist != null ? ` · ${item.dist} km` : ''}</span>
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
