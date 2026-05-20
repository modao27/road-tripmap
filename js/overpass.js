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
    label: 'Refuge',
    icon:  '🏠',
    color: '#6f513f',
    tags:  ['["amenity"="shelter"]', '["tourism"="alpine_hut"]', '["tourism"="wilderness_hut"]'],
  },
  water: {
    label: 'Source',
    icon:  '💧',
    color: '#2477a6',
    tags:  ['["natural"="spring"]', '["amenity"="drinking_water"]'],
  },
  waterfall: {
    label: 'Cascade',
    icon:  '🌊',
    color: '#2477a6',
    tags:  ['["waterway"="waterfall"]'],
  },
  viewpoint: {
    label: 'Panorama',
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
    label: 'Départ rando',
    icon:  '🥾',
    color: '#6f513f',
    tags:  ['["tourism"="trailhead"]', '["hiking"="trailhead"]'],
  },
};

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

// ── Sécurité HTML ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Tags enrichis selon la catégorie ─────────────────────────────────────────
function buildDetails(tags, catKey) {
  const items = [];

  // Universels
  if (tags.ele)                                items.push(`🏔 ${Math.round(+tags.ele)} m`);
  if (tags.fee === 'yes')                      items.push('💶 Payant');
  else if (tags.fee === 'no')                  items.push('✅ Gratuit');
  if (tags.drinking_water === 'yes')           items.push('💧 Eau potable');
  if (tags.opening_hours)                      items.push(`🕐 ${esc(tags.opening_hours)}`);
  if (tags.capacity)                           items.push(`👤 ${esc(tags.capacity)} pers.`);
  if (tags.access === 'private')               items.push('🔒 Accès privé');
  else if (tags.access === 'permissive')       items.push('✅ Accès libre');
  if (tags.seasonal === 'yes' || tags.open_during_winter === 'no') items.push('❄ Saisonnier');

  // Refuge / abri
  if (catKey === 'shelter') {
    if (tags.beds)                             items.push(`🛏 ${esc(tags.beds)} lits`);
    if (tags.toilets === 'yes')                items.push('🚻 Toilettes');
    const shelterLabels = {
      basic_hut: 'Cabane', lean_to: 'Abri', weather_shelter: 'Abri météo',
      public_transport: 'Abri bus', changing_rooms: 'Vestiaires',
    };
    const st = shelterLabels[tags.shelter_type];
    if (st) items.push(`🏠 ${st}`);
  }

  // Cascade
  if (catKey === 'waterfall') {
    if (tags.height) items.push(`📏 ${esc(String(tags.height))} m`);
  }

  // Via ferrata
  if (catKey === 'via_ferrata') {
    const grade = tags['climbing:grade'] || tags['via_ferrata:scale'] || tags.difficulty;
    if (grade) items.push(`🎯 ${esc(String(grade))}`);
    if (tags.length) items.push(`📏 ${esc(String(tags.length))} m`);
    const eleDiff = tags['ele:diff'] || tags.ele_diff;
    if (eleDiff) items.push(`⬆ +${esc(String(eleDiff))} m`);
  }

  // Panorama
  if (catKey === 'viewpoint') {
    if (tags.direction) items.push(`🧭 ${esc(String(tags.direction))}`);
  }

  // Bivouac
  if (catKey === 'bivouac') {
    if (tags.toilets === 'yes')  items.push('🚻 Toilettes');
    if (tags.shower === 'yes')   items.push('🚿 Douches');
  }

  return items;
}

// ── Texte court pour la description du pin (sans HTML) ───────────────────────
function buildPinDescription(tags, details) {
  const parts = [tags.description, tags.note].filter(Boolean);
  // Ajoute les détails texte (sans emoji pour la note) en fallback
  if (!parts.length && details.length) {
    parts.push(details.slice(0, 3).join(' · '));
  }
  return parts.join(' — ');
}

// ── Détection de catégorie depuis les tags OSM ────────────────────────────────
function detectCategory(tags) {
  if (tags.waterway === 'waterfall')  return 'waterfall';
  if (tags.natural === 'spring' || tags.amenity === 'drinking_water') return 'water';
  if (tags.tourism === 'viewpoint')   return 'viewpoint';
  if (tags.amenity === 'shelter' || tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut') return 'shelter';
  if (tags.climbing || tags.sport === 'via_ferrata') return 'via_ferrata';
  if (tags.tourism === 'trailhead' || tags.hiking === 'trailhead') return 'trailhead';
  return 'bivouac';
}

// ── Requête Overpass QL ───────────────────────────────────────────────────────
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
export function initOverpass({ map, toastWrap, showToastFn, onAddToMap, appCategories, onDiscoverResults }) {
  const resultsLayer    = L.layerGroup().addTo(map);
  const markersByNodeId = new Map();   // nodeId → L.marker (pour flyTo)
  const payloadsByNodeId = new Map();  // nodeId → objet données du pin
  let isFetching = false;

  // DOM refs
  const searchBtn     = document.getElementById('overpassSearch');
  const clearBtn      = document.getElementById('overpassClear');
  const statusEl      = document.getElementById('overpassStatus');
  const catBtns       = document.querySelectorAll('[data-overpass-cat]');
  const resultListEl  = document.getElementById('overpassResultList');
  const discoverEmpty = document.getElementById('discoverEmpty');
  const discoverCount = document.getElementById('discoverCount');

  // Catégories actives par défaut
  const selected = new Set(['bivouac', 'shelter']);
  catBtns.forEach(btn => {
    const cat = btn.dataset.overpassCat;
    btn.classList.toggle('active', selected.has(cat));
    btn.addEventListener('click', () => {
      selected[btn.classList.toggle('active') ? 'add' : 'delete'](cat);
    });
  });

  // ── Effacer ───────────────────────────────────────────────────────────────
  function clearResults() {
    resultsLayer.clearLayers();
    markersByNodeId.clear();
    payloadsByNodeId.clear();
    if (statusEl)      statusEl.textContent = '';
    if (clearBtn)      clearBtn.hidden = true;
    if (resultListEl)  resultListEl.innerHTML = '';
    if (discoverEmpty) discoverEmpty.hidden = false;
    if (discoverCount) discoverCount.textContent = '';
    catBtns.forEach(btn => {
      const badge = btn.querySelector('.cat-count-badge');
      if (badge) { badge.textContent = ''; badge.hidden = true; }
    });
    onDiscoverResults?.(0);
  }

  // ── Recherche ─────────────────────────────────────────────────────────────
  async function doSearch() {
    if (isFetching) return;
    if (!selected.size) { showToastFn(toastWrap, 'Sélectionne au moins une catégorie', ''); return; }
    if (map.getZoom() < 9) { showToastFn(toastWrap, 'Zoome sur une zone plus précise pour chercher', ''); return; }

    clearResults();
    isFetching = true;
    if (searchBtn) searchBtn.disabled = true;
    if (statusEl)  statusEl.textContent = '⟳ Recherche en cours…';

    const b    = map.getBounds();
    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
      .map(n => n.toFixed(4)).join(',');

    try {
      const data  = await runQuery([...selected], bbox);
      const nodes = (data.elements ?? []).filter(e => e.lat && e.lon);

      // Comptage par catégorie pour les badges
      const countByCat = {};
      nodes.forEach(el => {
        const key = detectCategory(el.tags ?? {});
        countByCat[key] = (countByCat[key] ?? 0) + 1;
      });

      // Mise à jour des badges sur les boutons catégorie
      catBtns.forEach(btn => {
        const cat   = btn.dataset.overpassCat;
        const count = countByCat[cat] ?? 0;
        let badge   = btn.querySelector('.cat-count-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'cat-count-badge';
          btn.appendChild(badge);
        }
        badge.textContent = count > 0 ? String(count) : '';
        badge.hidden = count === 0;
      });

      // Construction des marqueurs et de la liste
      const listHtml = [];
      nodes.forEach(el => {
        const tags    = el.tags ?? {};
        const catKey  = detectCategory(tags);
        const cat     = OVERPASS_CATEGORIES[catKey];
        const appCat  = OSM_TO_APP_CAT[catKey] ?? 'hike';
        const name    = tags.name || tags['name:fr'] || cat.label;
        const details = buildDetails(tags, catKey);
        const desc    = buildPinDescription(tags, details);
        const website = tags.website || tags['contact:website'];

        // Options du sélecteur de catégorie dans la popup
        const catSelectOptions = appCategories
          ? Object.entries(appCategories)
              .map(([k, c]) => `<option value="${k}"${k === appCat ? ' selected' : ''}>${c.icon} ${c.label}</option>`)
              .join('')
          : `<option value="${esc(appCat)}" selected>${esc(appCat)}</option>`;

        // Stockage du payload (accédé via nodeId, pas via attribut HTML)
        payloadsByNodeId.set(el.id, { name, lat: el.lat, lng: el.lon, appCategory: appCat, description: desc });

        // Icône marqueur
        const icon = L.divIcon({
          className:   '',
          html:        `<div class="overpass-marker" style="--color:${cat.color}">${cat.icon}</div>`,
          iconSize:    [30, 30],
          iconAnchor:  [15, 15],
          popupAnchor: [0, -16],
        });

        // Popup enrichie
        const detailsHtml = details.length
          ? `<div class="op-details">${details.map(d => `<span class="op-detail">${d}</span>`).join('')}</div>`
          : '';

        const marker = L.marker([el.lat, el.lon], { icon, title: name })
          .bindPopup(`
            <article class="popup" style="--color:${cat.color}">
              <h2>${esc(name)}</h2>
              <div class="popup-category"><span>${cat.icon}</span>${esc(cat.label)}</div>
              ${tags.description ? `<p class="op-desc">${esc(tags.description)}</p>` : ''}
              ${detailsHtml}
              ${website ? `<a class="osm-link" href="${encodeURI(website)}" target="_blank" rel="noopener">🌐 Site web</a>` : ''}
              <a class="osm-link" href="https://www.openstreetmap.org/node/${el.id}" target="_blank" rel="noopener">Voir sur OpenStreetMap</a>
              <div class="op-add-row">
                <select class="op-cat-select" data-node-ref="${el.id}">${catSelectOptions}</select>
                <button class="popup-add-to-map" data-node-ref="${el.id}" type="button">➕ Ajouter</button>
              </div>
            </article>
          `)
          .addTo(resultsLayer);

        markersByNodeId.set(el.id, marker);

        // Élément de liste sidebar (2 premiers détails en méta)
        const metaStr = [cat.label, ...details.slice(0, 2)].join(' · ');
        listHtml.push(`
          <li class="place-item op-result-item" data-node-id="${el.id}">
            <button class="place-card" type="button" aria-label="Voir ${esc(name)}">
              <div class="place-meta">
                <span class="place-icon" style="background:${cat.color}">${cat.icon}</span>
                <div class="op-result-info">
                  <strong>${esc(name)}</strong>
                  <span class="op-result-meta">${esc(metaStr)}</span>
                </div>
              </div>
            </button>
          </li>
        `);
      });

      // Injection de la liste
      if (resultListEl)  resultListEl.innerHTML = listHtml.join('');
      if (discoverEmpty) discoverEmpty.hidden = nodes.length > 0;
      if (discoverCount) discoverCount.textContent = nodes.length ? `${nodes.length}` : '';

      const n = nodes.length;
      if (statusEl)  statusEl.textContent = n ? `${n} résultat${n > 1 ? 's' : ''} · données OpenStreetMap` : '';
      if (clearBtn)  clearBtn.hidden = n === 0;

      onDiscoverResults?.(n);

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

  // Clic sur un item de la liste → flyTo + ouvre la popup
  resultListEl?.addEventListener('click', e => {
    const item = e.target.closest('[data-node-id]');
    if (!item) return;
    const marker = markersByNodeId.get(+item.dataset.nodeId);
    if (!marker) return;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 14), { animate: true, duration: 0.7 });
    setTimeout(() => marker.openPopup(), 650);
  });

  // Délégation : bouton "Ajouter à ma carte" dans les popups Overpass
  document.addEventListener('click', e => {
    const btn = e.target.closest('button[data-node-ref]');
    if (!btn || !btn.classList.contains('popup-add-to-map')) return;
    const nodeId = +btn.dataset.nodeRef;
    const payload = payloadsByNodeId.get(nodeId);
    if (!payload) return;
    // Catégorie choisie dans le select de la même popup
    const select = btn.closest('.popup')?.querySelector('.op-cat-select');
    const finalData = { ...payload, appCategory: select?.value ?? payload.appCategory };
    map.closePopup();
    onAddToMap?.(finalData);
  });
}
