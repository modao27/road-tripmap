// Recherche de lieux via l'API Overpass (données OpenStreetMap)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

const OVERPASS_URL  = 'https://overpass-api.de/api/interpreter';
const VF_INFO_URL   = `${SUPABASE_URL}/functions/v1/via-ferrata-info`;

const RADIUS_DEFAULT_KM = 10;
const RADIUS_MIN_KM     = 1;
const RADIUS_MAX_KM     = 50;

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
  bivouac:     'bivouac',
  shelter:     'bivouac',
  water:       'water',
  waterfall:   'water',
  viewpoint:   'hike',
  via_ferrata: 'via',
  trailhead:   'hike',
};

// ── Sécurité HTML ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Tags enrichis selon la catégorie ─────────────────────────────────────────
function buildDetails(tags, catKey) {
  const items = [];

  if (tags.ele)                                items.push(`🏔 ${Math.round(+tags.ele)} m`);
  if (tags.fee === 'yes')                      items.push('💶 Payant');
  else if (tags.fee === 'no')                  items.push('✅ Gratuit');
  if (tags.drinking_water === 'yes')           items.push('💧 Eau potable');
  if (tags.opening_hours)                      items.push(`🕐 ${esc(tags.opening_hours)}`);
  if (tags.capacity)                           items.push(`👤 ${esc(tags.capacity)} pers.`);
  if (tags.access === 'private')               items.push('🔒 Accès privé');
  else if (tags.access === 'permissive')       items.push('✅ Accès libre');
  if (tags.seasonal === 'yes' || tags.open_during_winter === 'no') items.push('❄ Saisonnier');

  if (catKey === 'shelter') {
    if (tags.beds)            items.push(`🛏 ${esc(tags.beds)} lits`);
    if (tags.toilets === 'yes') items.push('🚻 Toilettes');
    const shelterLabels = {
      basic_hut: 'Cabane', lean_to: 'Abri', weather_shelter: 'Abri météo',
      public_transport: 'Abri bus', changing_rooms: 'Vestiaires',
    };
    const st = shelterLabels[tags.shelter_type];
    if (st) items.push(`🏠 ${st}`);
  }

  if (catKey === 'waterfall' && tags.height)   items.push(`📏 ${esc(String(tags.height))} m`);

  if (catKey === 'via_ferrata') {
    const grade = tags['climbing:grade'] || tags['via_ferrata:scale'] || tags.difficulty;
    if (grade)       items.push(`🎯 ${esc(String(grade))}`);
    if (tags.length) items.push(`📏 ${esc(String(tags.length))} m`);
    const eleDiff = tags['ele:diff'] || tags.ele_diff;
    if (eleDiff)     items.push(`⬆ +${esc(String(eleDiff))} m`);
  }

  if (catKey === 'viewpoint' && tags.direction) items.push(`🧭 ${esc(String(tags.direction))}`);

  if (catKey === 'bivouac') {
    if (tags.toilets === 'yes') items.push('🚻 Toilettes');
    if (tags.shower === 'yes')  items.push('🚿 Douches');
  }

  return items;
}

function buildPinDescription(tags, details) {
  const parts = [tags.description, tags.note].filter(Boolean);
  if (!parts.length && details.length) parts.push(details.slice(0, 3).join(' · '));
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

// ── Requête Overpass avec filtre `around` ─────────────────────────────────────
async function runQuery(selectedCats, center, radiusMeters) {
  const around = `around:${Math.round(radiusMeters)},${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
  const lines = selectedCats.flatMap(cat =>
    (OVERPASS_CATEGORIES[cat]?.tags ?? []).map(tag => `  node${tag}(${around});`)
  ).join('\n');

  const ql = `[out:json][timeout:30];\n(\n${lines}\n);\nout body;`;
  const res = await fetch(OVERPASS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'data=' + encodeURIComponent(ql),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

// ── Cotations via ferrata ─────────────────────────────────────────────────────
const VF_GRADES = {
  'F':   { label: 'Facile',                color: '#2e7d32' },
  'PD':  { label: 'Peu Difficile',         color: '#1565c0' },
  'AD':  { label: 'Assez Difficile',       color: '#e65100' },
  'D':   { label: 'Difficile',             color: '#bf360c' },
  'TD':  { label: 'Très Difficile',        color: '#b71c1c' },
  'ED':  { label: 'Extrêmement Difficile', color: '#1a1a1a' },
  'ABO': { label: 'Abominable',            color: '#000000' },
};

function renderVfEnriched(data) {
  const firstGrade = data.difficulty?.match(/\b(ABO|ED|TD|D|AD|PD|F)\b/i)?.[1]?.toUpperCase();
  const grade      = firstGrade ? VF_GRADES[firstGrade] : null;

  const stats = [
    data.duration       && `⏱ ${esc(data.duration)}`,
    data.length_m       && `📏 ${esc(data.length_m)}`,
    data.elevation_gain && `⬆ ${esc(data.elevation_gain)}`,
    data.start_altitude && `🏔 Départ ${esc(data.start_altitude)}`,
    data.price          && `💰 ${esc(data.price)}`,
  ].filter(Boolean);

  const desc = data.description?.trim();

  return `
    <div class="vf-enriched-data">
      ${grade ? `
        <div class="vf-grade" style="--gc:${grade.color}">
          <span class="vf-grade-badge">${esc(data.difficulty)}</span>
          <span class="vf-grade-label">${grade.label}</span>
        </div>` : data.difficulty ? `<p class="vf-grade-plain">${esc(data.difficulty)}</p>` : ''}
      ${stats.length ? `<div class="vf-stats">${stats.map(s => `<span class="vf-stat">${s}</span>`).join('')}</div>` : ''}
      ${desc ? `<p class="vf-desc">${esc(desc.length > 320 ? desc.slice(0, 320) + '…' : desc)}</p>` : ''}
      <a class="vf-site-link" href="${esc(data.url)}" target="_blank" rel="noopener noreferrer">📋 Fiche complète — viaferrata-fr.net</a>
    </div>`;
}

// ── Module principal ──────────────────────────────────────────────────────────
export function initOverpass({ map, toastWrap, showToastFn, onAddToMap, appCategories, onDiscoverResults }) {
  const resultsLayer     = L.layerGroup().addTo(map);
  const markersByNodeId  = new Map();
  const payloadsByNodeId = new Map();
  let isFetching = false;

  // ── Cercle de recherche draggable (créé au premier accès à l'onglet) ─────
  let searchCircle = null;
  let centerMarker = null;
  let circleCenter = null;
  let radiusMeters = RADIUS_DEFAULT_KM * 1000;

  const centerIcon = L.divIcon({
    className:  '',
    html:       '<div class="search-center-pin" title="Déplacer pour changer la zone">🔍</div>',
    iconSize:   [34, 34],
    iconAnchor: [17, 17],
  });

  function ensureCircle() {
    if (searchCircle) return;
    circleCenter = map.getCenter();
    searchCircle = L.circle(circleCenter, {
      radius:      radiusMeters,
      color:       '#2f6f36',
      fillColor:   '#2f6f36',
      fillOpacity: 0.08,
      weight:      2.5,
      dashArray:   '8 5',
      interactive: false,
    }).addTo(map);
    centerMarker = L.marker(circleCenter, {
      draggable:    true,
      icon:         centerIcon,
      zIndexOffset: 1000,
    }).addTo(map);
    centerMarker.on('drag', e => {
      circleCenter = e.latlng;
      searchCircle.setLatLng(circleCenter);
    });
    centerMarker.on('dragend', () => {
      circleCenter = centerMarker.getLatLng();
    });
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const searchBtn     = document.getElementById('overpassSearch');
  const clearBtn      = document.getElementById('overpassClear');
  const statusEl      = document.getElementById('overpassStatus');
  const catBtns       = document.querySelectorAll('[data-overpass-cat]');
  const resultListEl  = document.getElementById('overpassResultList');
  const discoverEmpty = document.getElementById('discoverEmpty');
  const discoverCount = document.getElementById('discoverCount');
  const radiusSlider  = document.getElementById('radiusSlider');
  const radiusLabel   = document.getElementById('radiusLabel');

  // ── Slider de rayon ───────────────────────────────────────────────────────
  if (radiusSlider) {
    radiusSlider.min   = String(RADIUS_MIN_KM);
    radiusSlider.max   = String(RADIUS_MAX_KM);
    radiusSlider.value = String(RADIUS_DEFAULT_KM);
    radiusSlider.addEventListener('input', () => {
      const km     = +radiusSlider.value;
      radiusMeters = km * 1000;
      if (searchCircle) searchCircle.setRadius(radiusMeters);
      if (radiusLabel) radiusLabel.textContent = `${km} km`;
    });
  }

  // ── Catégories actives ────────────────────────────────────────────────────
  const selected = new Set(['bivouac', 'shelter']);
  catBtns.forEach(btn => {
    const cat = btn.dataset.overpassCat;
    btn.classList.toggle('active', selected.has(cat));
    btn.addEventListener('click', () => {
      selected[btn.classList.toggle('active') ? 'add' : 'delete'](cat);
    });
  });

  // ── Effacer les résultats (garde le cercle) ───────────────────────────────
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
    if (!selected.size) {
      showToastFn(toastWrap, 'Sélectionne au moins une catégorie', '');
      return;
    }
    ensureCircle(); // garantit que circleCenter et searchCircle existent

    clearResults();
    isFetching = true;
    if (searchBtn) searchBtn.disabled = true;
    if (statusEl)  statusEl.textContent = '⟳ Recherche en cours…';

    try {
      const data  = await runQuery([...selected], circleCenter, radiusMeters);
      const nodes = (data.elements ?? []).filter(e => e.lat && e.lon);

      // Badges par catégorie
      const countByCat = {};
      nodes.forEach(el => {
        const key = detectCategory(el.tags ?? {});
        countByCat[key] = (countByCat[key] ?? 0) + 1;
      });
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

        const catSelectOptions = appCategories
          ? Object.entries(appCategories)
              .map(([k, c]) => `<option value="${k}"${k === appCat ? ' selected' : ''}>${c.icon} ${c.label}</option>`)
              .join('')
          : `<option value="${esc(appCat)}" selected>${esc(appCat)}</option>`;

        payloadsByNodeId.set(el.id, {
          name:        desc || name,
          lat:         el.lat,
          lng:         el.lon,
          appCategory: appCat,
          description: name !== cat.label ? name : '',
        });

        const icon = L.divIcon({
          className:   '',
          html:        `<div class="overpass-marker" style="--color:${cat.color}">${cat.icon}</div>`,
          iconSize:    [30, 30],
          iconAnchor:  [15, 15],
          popupAnchor: [0, -16],
        });

        const detailsHtml = details.length
          ? `<div class="op-details">${details.map(d => `<span class="op-detail">${d}</span>`).join('')}</div>`
          : '';

        // Pour la recherche sur viaferrata-fr.net :
        // les noeuds OSM ont souvent description mais pas name
        const osmSearchName = tags.name || tags['name:fr'] || tags.description || tags.note || null;
        const displayName   = tags.description || tags.note || name;
        const isVf          = catKey === 'via_ferrata' && osmSearchName && osmSearchName !== cat.label;
        const googleLink    = isVf
          ? `https://www.google.com/search?q=site:viaferrata-fr.net+${encodeURIComponent(osmSearchName)}`
          : null;

        const marker = L.marker([el.lat, el.lon], { icon, title: displayName })
          .bindPopup(`
            <article class="popup" style="--color:${cat.color}">
              <h2>${esc(displayName)}</h2>
              <div class="popup-category"><span>${cat.icon}</span>${esc(cat.label)}</div>
              ${name !== cat.label && (tags.description || tags.note) ? `<p class="op-osm-name">${esc(name)}</p>` : ''}
              ${detailsHtml}
              ${isVf ? `<div class="vf-enriched"><p class="vf-loading">⟳ Chargement des détails…</p></div>` : ''}
              ${website ? `<a class="osm-link" href="${encodeURI(website)}" target="_blank" rel="noopener">🌐 Site web</a>` : ''}
              ${googleLink ? `<a class="osm-link" href="${esc(googleLink)}" target="_blank" rel="noopener noreferrer">🔍 Chercher sur viaferrata-fr.net</a>` : ''}
              <a class="osm-link" href="https://www.openstreetmap.org/node/${el.id}" target="_blank" rel="noopener">Voir sur OpenStreetMap</a>
              <div class="op-add-row">
                <select class="op-cat-select" data-node-ref="${el.id}">${catSelectOptions}</select>
                <button class="popup-add-to-map" data-node-ref="${el.id}" type="button">➕ Ajouter</button>
              </div>
            </article>
          `)
          .addTo(resultsLayer);

        // Enrichissement via ferrata — chargé à l'ouverture de la popup
        if (isVf) {
          marker.on('popupopen', async (e) => {
            const container = e.popup.getElement()?.querySelector('.vf-enriched');
            if (!container || container.dataset.loading) return;
            container.dataset.loading = 'true';
            try {
              const res  = await fetch(VF_INFO_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                body:    JSON.stringify({ name: osmSearchName, lat: el.lat, lng: el.lon }),
              });
              const data = await res.json();
              container.innerHTML = data?.error
                ? '<p class="vf-not-found">Fiche introuvable sur viaferrata-fr.net</p>'
                : renderVfEnriched(data);
            } catch {
              container.innerHTML = '';
            }
            // _updatePosition repositionne sans réinitialiser innerHTML
            // (popup.update() appellerait _updateContent() qui effacerait nos données)
            e.popup._updatePosition?.();
          });
        }

        markersByNodeId.set(el.id, marker);

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

      if (resultListEl)  resultListEl.innerHTML = listHtml.join('');
      if (discoverEmpty) discoverEmpty.hidden = nodes.length > 0;
      if (discoverCount) discoverCount.textContent = nodes.length ? String(nodes.length) : '';

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

  // Clic liste → flyTo + popup
  resultListEl?.addEventListener('click', e => {
    const item = e.target.closest('[data-node-id]');
    if (!item) return;
    const marker = markersByNodeId.get(+item.dataset.nodeId);
    if (!marker) return;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 14), { animate: true, duration: 0.7 });
    setTimeout(() => marker.openPopup(), 650);
  });

  // Délégation : bouton "Ajouter à ma carte"
  document.addEventListener('click', e => {
    const btn = e.target.closest('button[data-node-ref]');
    if (!btn || !btn.classList.contains('popup-add-to-map')) return;
    const nodeId  = +btn.dataset.nodeRef;
    const payload = payloadsByNodeId.get(nodeId);
    if (!payload) return;
    const select   = btn.closest('.popup')?.querySelector('.op-cat-select');
    const finalData = { ...payload, appCategory: select?.value ?? payload.appCategory };
    map.closePopup();
    onAddToMap?.(finalData);
  });

  return { activate: ensureCircle };
}
