// Recherche de lieux via l'API Overpass (données OpenStreetMap)
import { fetchWikipedia, fetchRefuge, buildSkeletonHtml, buildWikiHtml, buildRefugeHtml } from './enrichment.js';

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

// ── Boîte englobante depuis un centre + rayon (km) ───────────────────────────
export function bboxFromRadius(lat, lng, radiusKm) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
  return [lat - dLat, lng - dLng, lat + dLat, lng + dLng].map(n => n.toFixed(4)).join(',');
}

// ── Mapping catégorie OSM → catégorie de l'app ───────────────────────────────
const OSM_TO_APP_CAT = {
  bivouac:    'bivouac',
  shelter:    'bivouac',
  water:      'water',
  waterfall:  'water',
  viewpoint:  'hike',
  via_ferrata:'via',
  trailhead:  'hike',
};

// ── Description lisible depuis les tags OSM ───────────────────────────────────
function buildNodeDescription(tags) {
  return [
    tags.description,
    tags.note,
    tags.information,
    tags.fee === 'yes' ? 'Payant' : tags.fee === 'no' ? 'Gratuit' : null,
    tags.drinking_water === 'yes' ? 'Eau potable disponible' : null,
    tags.opening_hours ? `Horaires : ${tags.opening_hours}` : null,
    tags.capacity ? `Capacité : ${tags.capacity} personnes` : null,
  ].filter(Boolean).join(' — ');
}

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
export function initOverpass({ map, toastWrap, showToastFn, onAddToMap,
                               onDiscoveryStart, onDiscoveryDone, onDiscoveryClear }) {
  const resultsLayer = L.layerGroup().addTo(map);
  let isFetching = false;

  // DOM refs (modale POI)
  const backdrop    = document.getElementById('overpassBackdrop');
  const searchBtn   = document.getElementById('overpassSearch');
  const clearBtn    = document.getElementById('overpassClear');
  const statusEl    = document.getElementById('overpassStatus');
  const radiusEl    = document.getElementById('overpassRadius');
  const radiusValEl = document.getElementById('overpassRadiusValue');
  const catBtns     = document.querySelectorAll('[data-overpass-cat]');

  // Catégories actives par défaut : bivouac + refuges
  const selected = new Set(['bivouac', 'shelter']);

  catBtns.forEach(btn => {
    const cat = btn.dataset.overpassCat;
    btn.classList.toggle('active', selected.has(cat));
    btn.addEventListener('click', () => {
      const active = btn.classList.toggle('active');
      if (active) selected.add(cat); else selected.delete(cat);
    });
  });

  // Mise à jour de l'affichage du rayon
  radiusEl?.addEventListener('input', () => {
    if (radiusValEl) radiusValEl.textContent = radiusEl.value;
  });

  // ── Vider les résultats (public + interne) ────────────────────────────────
  function clearResultsLayer() {
    resultsLayer.clearLayers();
    if (statusEl) statusEl.textContent = '';
    if (clearBtn) clearBtn.hidden = true;
  }

  function clearResults() {
    clearResultsLayer();
    onDiscoveryClear?.();
  }

  // ── Lancer la recherche ───────────────────────────────────────────────────
  async function doSearch(customBbox = null, customCats = null) {
    if (isFetching) return;
    const catsToUse = customCats ?? selected;
    if (!catsToUse.size) {
      showToastFn(toastWrap, 'Sélectionne au moins une catégorie', '');
      return;
    }

    // Calcul de la bbox : rayon centré sur la carte ou zone visible
    const radius = customBbox ? 0 : parseInt(radiusEl?.value ?? '0');
    const center = map.getCenter();
    const b      = map.getBounds();
    const bbox   = customBbox
      ?? (radius > 0
        ? bboxFromRadius(center.lat, center.lng, radius)
        : [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map(n => n.toFixed(4)).join(','));

    if (!customBbox && radius === 0 && map.getZoom() < 9) {
      showToastFn(toastWrap, 'Zoome davantage ou active un rayon de recherche', '');
      return;
    }

    // Vide l'ancienne couche sans déclencher le callback de sortie de mode découverte
    clearResultsLayer();
    // Ferme la modale et entre en mode découverte
    if (backdrop) backdrop.hidden = true;
    onDiscoveryStart?.();

    isFetching = true;
    if (searchBtn) searchBtn.disabled = true;
    if (statusEl) statusEl.textContent = '⟳ Recherche en cours…';

    try {
      const data  = await runQuery([...catsToUse], bbox);
      const nodes = (data.elements ?? []).filter(e => e.lat && e.lon);

      nodes.forEach(el => {
        const tags   = el.tags ?? {};
        const catKey = detectCategory(tags);
        const cat    = OVERPASS_CATEGORIES[catKey];
        const name   = tags.name ?? tags['name:fr'] ?? cat.label;

        const details = [
          tags.fee === 'yes'            ? '💶 Payant'                      : tags.fee === 'no' ? 'Gratuit' : null,
          tags.drinking_water === 'yes' ? '💧 Eau potable disponible'      : null,
          tags.opening_hours            ? `🕐 ${tags.opening_hours}`       : null,
          tags.capacity                 ? `👤 Capacité : ${tags.capacity}` : null,
        ].filter(Boolean);

        const nodePayload = JSON.stringify({
          name,
          lat:         el.lat,
          lng:         el.lon,
          appCategory: OSM_TO_APP_CAT[catKey] ?? 'hike',
          description: buildNodeDescription(tags),
        });

        const icon = L.divIcon({
          className:   '',
          html:        `<div class="overpass-marker" style="--color:${cat.color}">${cat.icon}</div>`,
          iconSize:    [30, 30],
          iconAnchor:  [15, 15],
          popupAnchor: [0, -16],
        });

        const popup = L.popup({ maxWidth: 300 }).setContent(`
            <article class="popup" style="--color:${cat.color}">
              <h2>${name}</h2>
              <div class="popup-category"><span>${cat.icon}</span>${cat.label}</div>
              ${tags.description ? `<p>${tags.description}</p>` : ''}
              ${details.map(d => `<p>${d}</p>`).join('')}
              <div class="popup-enrich"></div>
              <a class="osm-link" href="https://www.openstreetmap.org/node/${el.id}"
                 target="_blank" rel="noopener">Voir sur OpenStreetMap</a>
              <button class="popup-add-to-map" data-overpass='${nodePayload}' type="button">
                ➕ Ajouter à ma carte
              </button>
            </article>
          `);

        const marker = L.marker([el.lat, el.lon], { icon, title: name })
          .bindPopup(popup)
          .addTo(resultsLayer);

        // Enrichissement progressif au premier clic
        marker.on('popupopen', () => {
          const enrichEl = popup.getElement()?.querySelector('.popup-enrich');
          if (!enrichEl || enrichEl.dataset.loaded) return;
          enrichEl.dataset.loaded = 'true';

          // Skeleton immédiat — espace réservé, zéro layout jump ensuite
          enrichEl.innerHTML = buildSkeletonHtml(catKey);
          popup.update();

          // Remplace une section skeleton par son contenu (ou la supprime)
          function updateSection(source, html) {
            const section = enrichEl.querySelector(`[data-pe="${source}"]`);
            if (!section) return;
            if (html) {
              section.innerHTML = html;
              section.classList.add('pe-appear');
            } else {
              section.remove();
            }
            popup.update();
          }

          // Wikipedia — indépendant
          fetchWikipedia(name)
            .then(data => updateSection('wiki', buildWikiHtml(data, cat.color)))
            .catch(()  => updateSection('wiki', null));

          // Refuges.info — uniquement pour les abris et bivouacs
          if (['shelter', 'bivouac'].includes(catKey)) {
            fetchRefuge(el.lat, el.lon)
              .then(data => updateSection('refuge', buildRefugeHtml(data)))
              .catch(()  => updateSection('refuge', null));
          }
        });
      });

      const n = nodes.length;
      if (statusEl) {
        statusEl.textContent = n
          ? `${n} résultat${n > 1 ? 's' : ''} · données OpenStreetMap`
          : '';
      }
      if (clearBtn) clearBtn.hidden = n === 0;

      onDiscoveryDone?.(n);

      if (n === 0) showToastFn(toastWrap, 'Aucun résultat dans cette zone', '');
      else showToastFn(toastWrap, `${n} lieu${n > 1 ? 'x' : ''} trouvé${n > 1 ? 's' : ''}`, 'success');

    } catch (err) {
      console.error('[overpass]', err);
      if (statusEl) statusEl.textContent = '';
      onDiscoveryClear?.();
      showToastFn(toastWrap, 'Serveur Overpass indisponible, réessaie dans quelques secondes.', 'error');
    } finally {
      isFetching = false;
      if (searchBtn) searchBtn.disabled = false;
    }
  }

  searchBtn?.addEventListener('click', () => doSearch());
  clearBtn?.addEventListener('click',  clearResults);

  // Fermeture de la modale
  document.getElementById('overpassClose')?.addEventListener('click', () => {
    if (backdrop) backdrop.hidden = true;
  });
  backdrop?.addEventListener('click', e => {
    if (e.target === backdrop) backdrop.hidden = true;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop && !backdrop.hidden) backdrop.hidden = true;
  });

  // Délégation : bouton "Ajouter à ma carte" dans les popups Overpass
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-overpass]');
    if (!btn) return;
    try {
      const data = JSON.parse(btn.dataset.overpass);
      map.closePopup();
      onAddToMap?.(data);
    } catch (err) {
      console.error('[overpass] parse error', err);
    }
  });

  // ── Recherche autour d'un point (utilisée par l'onboarding) ──────────────
  async function searchAroundPoint(lat, lng, radiusKm, cats) {
    const bbox = bboxFromRadius(lat, lng, radiusKm);
    await doSearch(bbox, new Set(cats));
  }

  return { clearResults, searchAroundPoint };
}
