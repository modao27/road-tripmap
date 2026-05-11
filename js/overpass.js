// Recherche de lieux via l'API Overpass (données OpenStreetMap)
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// ── Catégories et leurs tags OSM ──────────────────────────────────────────────
export const OVERPASS_CATEGORIES = {
  bivouac: {
    label: 'Bivouac',
    icon:  '⛺',
    color: '#2f6f36',
    tags:  ['["tourism"="camp_site"]', '["tourism"="camp_pitch"]'],
  },
  shelter: {
    label: 'Refuges',
    icon:  '🏠',
    color: '#6f513f',
    tags:  ['["amenity"="shelter"]', '["tourism"="alpine_hut"]', '["tourism"="wilderness_hut"]'],
  },
  water: {
    label: 'Sources',
    icon:  '💧',
    color: '#2477a6',
    tags:  ['["natural"="spring"]', '["amenity"="drinking_water"]'],
  },
  waterfall: {
    label: 'Cascades',
    icon:  '🌊',
    color: '#2477a6',
    tags:  ['["waterway"="waterfall"]'],
  },
  viewpoint: {
    label: 'Panoramas',
    icon:  '🔭',
    color: '#d56b1d',
    tags:  ['["tourism"="viewpoint"]'],
  },
  via_ferrata: {
    label: 'Via ferrata',
    icon:  '🧗',
    color: '#912d2d',
    tags:  ['["climbing"="via_ferrata"]', '["sport"="via_ferrata"]'],
  },
  trailhead: {
    label: 'Départs rando',
    icon:  '🥾',
    color: '#6f513f',
    tags:  ['["tourism"="trailhead"]', '["hiking"="trailhead"]'],
  },
};

// ── Détection de catégorie depuis les tags OSM ────────────────────────────────
function detectCategory(tags) {
  if (tags.waterway === 'waterfall') return 'waterfall';
  if (tags.natural === 'spring' || tags.amenity === 'drinking_water') return 'water';
  if (tags.tourism === 'viewpoint') return 'viewpoint';
  if (tags.amenity === 'shelter' || tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut') return 'shelter';
  if (tags.climbing || tags.sport === 'via_ferrata') return 'via_ferrata';
  if (tags.tourism === 'trailhead' || tags.hiking === 'trailhead') return 'trailhead';
  return 'bivouac';
}

// ── Construction et exécution de la requête Overpass QL ──────────────────────
async function runQuery(selectedCats, bbox) {
  const lines = selectedCats.flatMap(cat =>
    (OVERPASS_CATEGORIES[cat]?.tags ?? []).map(tag => `  node${tag}(${bbox});`)
  ).join('\n');

  const ql = `[out:json][timeout:25];\n(\n${lines}\n);\nout body;`;

  const res = await fetch(OVERPASS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'data=' + encodeURIComponent(ql),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

// ── Module principal ──────────────────────────────────────────────────────────
export function initOverpass({ map, toastWrap, showToastFn }) {
  const resultsLayer = L.layerGroup().addTo(map);
  let isFetching = false;

  // DOM refs
  const searchBtn = document.getElementById('overpassSearch');
  const clearBtn  = document.getElementById('overpassClear');
  const statusEl  = document.getElementById('overpassStatus');
  const catBtns   = document.querySelectorAll('[data-overpass-cat]');

  // Catégories actives par défaut : bivouac + refuges
  const selected = new Set(['bivouac', 'shelter']);

  catBtns.forEach(btn => {
    const cat = btn.dataset.overpassCat;
    btn.classList.toggle('active', selected.has(cat));
    btn.addEventListener('click', () => {
      const active = btn.classList.toggle('active');
      if (active) selected.add(cat);
      else selected.delete(cat);
    });
  });

  // ── Effacer les résultats ─────────────────────────────────────────────────
  function clearResults() {
    resultsLayer.clearLayers();
    if (statusEl) statusEl.textContent = '';
    if (clearBtn) clearBtn.hidden = true;
  }

  // ── Lancer la recherche ───────────────────────────────────────────────────
  async function doSearch() {
    if (isFetching) return;
    if (!selected.size) { showToastFn(toastWrap, 'Sélectionne au moins une catégorie', ''); return; }
    if (map.getZoom() < 9) { showToastFn(toastWrap, 'Zoome sur une zone plus précise pour chercher', ''); return; }

    clearResults();
    isFetching = true;
    if (searchBtn) searchBtn.disabled = true;
    if (statusEl) statusEl.textContent = '⟳ Recherche en cours…';

    const b    = map.getBounds();
    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
      .map(n => n.toFixed(4)).join(',');

    try {
      const data  = await runQuery([...selected], bbox);
      const nodes = (data.elements ?? []).filter(e => e.lat && e.lon);

      nodes.forEach(el => {
        const tags   = el.tags ?? {};
        const catKey = detectCategory(tags);
        const cat    = OVERPASS_CATEGORIES[catKey];
        const name   = tags.name ?? tags['name:fr'] ?? cat.label;

        const details = [
          tags.description,
          tags.fee === 'yes'            ? '💶 Payant'       : tags.fee === 'no' ? 'Gratuit' : null,
          tags.drinking_water === 'yes' ? '💧 Eau potable'  : null,
          tags.opening_hours            ? `🕐 ${tags.opening_hours}` : null,
          tags.capacity                 ? `👤 Capacité : ${tags.capacity}` : null,
        ].filter(Boolean);

        const icon = L.divIcon({
          className:   '',
          html:        `<div class="overpass-marker" style="--color:${cat.color}">${cat.icon}</div>`,
          iconSize:    [30, 30],
          iconAnchor:  [15, 15],
          popupAnchor: [0, -16],
        });

        L.marker([el.lat, el.lon], { icon, title: name })
          .bindPopup(`
            <article class="popup" style="--color:${cat.color}">
              <h2>${name}</h2>
              <div class="popup-category"><span>${cat.icon}</span>${cat.label}</div>
              ${details.map(d => `<p>${d}</p>`).join('')}
              <a class="osm-link" href="https://www.openstreetmap.org/node/${el.id}"
                 target="_blank" rel="noopener">Voir sur OpenStreetMap</a>
            </article>
          `)
          .addTo(resultsLayer);
      });

      const n = nodes.length;
      if (statusEl) {
        statusEl.textContent = n
          ? `${n} résultat${n > 1 ? 's' : ''} · données OpenStreetMap`
          : '';
      }
      if (clearBtn) clearBtn.hidden = n === 0;

      if (n === 0) showToastFn(toastWrap, 'Aucun résultat dans cette zone', '');
      else showToastFn(toastWrap, `${n} lieu${n > 1 ? 'x' : ''} trouvé${n > 1 ? 's' : ''}`, 'success');

    } catch (err) {
      console.error('[overpass]', err);
      if (statusEl) statusEl.textContent = '';
      showToastFn(toastWrap, 'Serveur Overpass indisponible, réessaie dans quelques secondes.', 'error');
    } finally {
      isFetching = false;
      if (searchBtn) searchBtn.disabled = false;
    }
  }

  searchBtn?.addEventListener('click', doSearch);
  clearBtn?.addEventListener('click',  clearResults);
}
