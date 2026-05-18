import { loadRouteSteps, saveRouteSteps, loadRouteMode, saveRouteMode } from './storage.js';

// Le serveur public OSRM ne supporte que le profil driving de façon fiable.
// Pour vélo et marche, on récupère la géométrie (driving) mais on corrige
// la durée avec des vitesses moyennes réalistes.
const OSRM_BASE    = 'https://router.project-osrm.org/route/v1';
const OSRM_PROFILE = { driving: 'driving', cycling: 'driving', walking: 'driving' };

// Vitesses moyennes (km/h) pour la correction côté client
const AVG_SPEED_KMH = { driving: null, cycling: 16, walking: 4 };

function estimateDuration(distanceMeters, m) {
  const kmh = AVG_SPEED_KMH[m];
  if (!kmh) return null; // driving → utilise la durée OSRM
  return Math.round((distanceMeters / 1000 / kmh) * 3600);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function formatDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

// Haversine straight-line distance (meters)
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Module ────────────────────────────────────────────────────────────────────

export function initRoutePlanner({ map, getAllPlaces, categories, toastWrap, showToastFn, focusPlaceFn }) {

  // ── État ──────────────────────────────────────────────────────────────────
  let steps         = [];                 // toujours vide au démarrage — restauré uniquement via ?route=
  let mode          = loadRouteMode();    // 'driving' | 'cycling' | 'walking'
  let routeData     = null;               // {distance, duration, geometry} OSRM
  let fetchDebounce = null;
  let dragSrcIndex  = null;
  let stepMarkers   = [];                 // markers numérotés sur la carte

  // Couche Leaflet dédiée (indépendante des clusters)
  const routeLayer = L.layerGroup().addTo(map);

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const stepsEl     = document.getElementById('routeSteps');
  const emptyEl     = document.getElementById('routeEmpty');
  const statsEl     = document.getElementById('routeStats');
  const distEl      = document.getElementById('routeDistance');
  const durEl       = document.getElementById('routeDuration');
  const countEl     = document.getElementById('routeStepCount');
  const modeEl      = document.getElementById('routeMode');
  const clearBtn    = document.getElementById('routeClear');
  const optimizeBtn = document.getElementById('routeOptimize');
  const shareBtn    = document.getElementById('routeShare');
  const gpxBtn      = document.getElementById('routeGpx');

  // ── Résolution des IDs en objets lieu ─────────────────────────────────────
  function resolvePlaces() {
    const all = getAllPlaces();
    return steps.map(id => all.find(p => p.id === id) || null);
  }

  // ── Mise à jour de l'état des boutons "Ajouter à l'itinéraire" ──────────
  function updateRouteButtons() {
    document.querySelectorAll('[data-add-route-id]').forEach(btn => {
      const inRoute = steps.includes(btn.dataset.addRouteId);
      btn.classList.toggle('in-route', inRoute);
      if (btn.classList.contains('popup-add-route')) {
        btn.textContent = inRoute ? "✓ Dans l'itinéraire" : '➕ Ajouter à l\'itinéraire';
      } else {
        btn.textContent = inRoute ? '✓' : '＋';
        btn.title = inRoute ? "Déjà dans l'itinéraire" : "Ajouter à l'itinéraire";
      }
    });
  }

  // ── Ajout / suppression d'étapes ─────────────────────────────────────────
  function addStep(placeId) {
    if (steps.includes(placeId)) {
      showToastFn(toastWrap, "Déjà dans l'itinéraire", '');
      return;
    }
    steps.push(placeId);
    persist();
    renderStepList();
    updateRouteButtons();
    scheduleFetch();
    showToastFn(toastWrap, 'Étape ajoutée', 'success');
  }

  function removeStep(index) {
    steps.splice(index, 1);
    persist();
    renderStepList();
    updateRouteButtons();
    scheduleFetch();
  }

  function clearRoute() {
    steps = [];
    routeData = null;
    persist();
    renderStepList();
    updateRouteButtons();
    clearMapLayers();
    renderStats();
  }

  function persist() {
    saveRouteSteps(steps);
  }

  // ── Optimisation (plus proche voisin) ─────────────────────────────────────
  function optimizeOrder() {
    if (steps.length < 3) {
      showToastFn(toastWrap, "3 étapes minimum pour optimiser", '');
      return;
    }
    const places   = resolvePlaces().filter(Boolean);
    const pool     = [...places];
    const result   = [pool.shift()];

    while (pool.length > 0) {
      const last = result[result.length - 1];
      let ni = 0, nd = Infinity;
      pool.forEach((p, i) => {
        const d = haversine(last.lat, last.lng, p.lat, p.lng);
        if (d < nd) { nd = d; ni = i; }
      });
      result.push(pool.splice(ni, 1)[0]);
    }

    steps = result.map(p => p.id);
    persist();
    renderStepList();
    updateRouteButtons();
    scheduleFetch();
    showToastFn(toastWrap, 'Itinéraire optimisé', 'success');
  }

  // ── OSRM ──────────────────────────────────────────────────────────────────
  function scheduleFetch() {
    clearTimeout(fetchDebounce);
    if (steps.length < 2) { clearMapLayers(); renderStats(); return; }
    // Spinner : affichage immédiat en attendant la réponse
    distEl.textContent = '…';
    durEl.textContent  = '…';
    statsEl.hidden = false;
    fetchDebounce = setTimeout(fetchRoute, 700);
  }

  async function fetchRoute() {
    const places = resolvePlaces().filter(Boolean);
    if (places.length < 2) return;

    const coords  = places.map(p => `${p.lng},${p.lat}`).join(';');
    const profile = OSRM_PROFILE[mode] || 'driving';
    const url     = `${OSRM_BASE}/${profile}/${coords}?overview=full&geometries=geojson`;

    try {
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const data = await res.json();
      if (!data.routes?.[0]) throw new Error('No route');

      const dist = data.routes[0].distance;
      routeData = {
        distance: dist,
        duration: estimateDuration(dist, mode) ?? data.routes[0].duration,
        geometry: data.routes[0].geometry,
      };
      drawRoute(routeData.geometry, places);
      renderStats();
    } catch (err) {
      console.warn('[routePlanner]', err);
      // Fallback : tracé ligne droite entre étapes
      drawStraightLine(places);
      routeData = null;
      renderStats();
      showToastFn(toastWrap, 'Tracé approximatif (routage indisponible)', '');
    }
  }

  // ── Rendu carte ───────────────────────────────────────────────────────────
  function clearMapLayers() {
    routeLayer.clearLayers();
    stepMarkers = [];
  }

  function drawRoute(geometry, places) {
    clearMapLayers();
    // Coordonnées GeoJSON : [lng, lat] → Leaflet : [lat, lng]
    const latLngs = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    drawPolyline(latLngs);
    addStepMarkers(places);
    fitRoute(latLngs);
  }

  function drawStraightLine(places) {
    clearMapLayers();
    const latLngs = places.map(p => [p.lat, p.lng]);
    drawPolyline(latLngs, true);
    addStepMarkers(places);
    fitRoute(latLngs);
  }

  function drawPolyline(latLngs, dashed = false) {
    // Bordure blanche sous la ligne principale
    L.polyline(latLngs, {
      color: 'white', weight: 9, opacity: 0.5,
      lineJoin: 'round', lineCap: 'round',
    }).addTo(routeLayer);

    const poly = L.polyline(latLngs, {
      color: '#1f5f43',
      weight: 5,
      opacity: 0.88,
      dashArray: dashed ? '10 7' : null,
      lineJoin: 'round',
      lineCap:  'round',
    }).addTo(routeLayer);

    // Animation de dessin progressif (uniquement pour les tracés OSRM)
    if (!dashed) {
      requestAnimationFrame(() => {
        const el = poly.getElement();
        if (!el) return;
        const len = el.getTotalLength?.() ?? 3000;
        el.style.strokeDasharray  = len;
        el.style.strokeDashoffset = len;
        el.classList.add('route-draw-anim');
        // Nettoyage après animation : retire les styles inline pour éviter
        // tout artefact de rendu SVG (tracé partiellement invisible)
        el.addEventListener('animationend', () => {
          el.style.strokeDasharray  = '';
          el.style.strokeDashoffset = '';
          el.classList.remove('route-draw-anim');
        }, { once: true });
      });
    }
  }

  function addStepMarkers(places) {
    stepMarkers = [];
    places.forEach((place, i) => {
      const m = L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="route-step-icon">${i + 1}</div>`,
          iconSize:   [26, 26],
          iconAnchor: [13, 13],
        }),
        zIndexOffset: 1200,
      })
        .bindTooltip(place.name, { direction: 'top', offset: [0, -14] })
        .addTo(routeLayer);

      stepMarkers.push(m);
    });
  }

  function fitRoute(latLngs) {
    if (latLngs.length < 2) return;
    try {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [48, 48], maxZoom: 13, animate: true });
    } catch (_) {}
  }

  // ── Statistiques ──────────────────────────────────────────────────────────
  function renderStats() {
    const n = steps.length;
    countEl.textContent = `${n} étape${n > 1 ? 's' : ''}`;

    if (routeData && n >= 2) {
      distEl.textContent = formatDistance(routeData.distance);
      durEl.textContent  = formatDuration(routeData.duration);
      statsEl.hidden     = false;
    } else {
      statsEl.hidden = true;
    }
  }

  // ── Liste des étapes ──────────────────────────────────────────────────────
  function renderStepList() {
    emptyEl.hidden  = steps.length > 0;
    stepsEl.hidden  = steps.length === 0;

    if (steps.length === 0) { stepsEl.innerHTML = ''; renderStats(); return; }

    const places = resolvePlaces();

    stepsEl.innerHTML = places.map((place, i) => {
      const name     = place ? place.name : '[Lieu supprimé]';
      const icon     = place ? (categories[place.category]?.icon ?? '📍') : '?';
      const deleted  = !place ? ' route-step--deleted' : '';

      // Distance partielle (ligne droite avec lieu précédent)
      let partialHtml = '';
      if (i > 0 && place && places[i - 1]) {
        const prev = places[i - 1];
        partialHtml = `<span class="route-step-dist">${formatDistance(
          haversine(prev.lat, prev.lng, place.lat, place.lng)
        )}</span>`;
      }

      return `
        <li class="route-step${deleted}" draggable="true" data-step-index="${i}">
          <span class="route-step-handle" aria-hidden="true">⠿</span>
          <span class="route-step-num">${i + 1}</span>
          <span class="route-step-cat">${icon}</span>
          <span class="route-step-label">
            <span class="route-step-name">${name}</span>
            ${partialHtml}
          </span>
          <button class="route-step-remove" data-remove-step="${i}"
                  type="button" title="Retirer de l'itinéraire">✕</button>
        </li>`;
    }).join('');

    // Drag & drop
    stepsEl.querySelectorAll('[data-step-index]').forEach(el => {
      el.addEventListener('dragstart', e => {
        dragSrcIndex = +e.currentTarget.dataset.stepIndex;
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', e => {
        e.currentTarget.classList.remove('dragging');
        stepsEl.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
      });
      el.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        stepsEl.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
        e.currentTarget.classList.add('drag-over');
      });
      el.addEventListener('dragleave', e => {
        e.currentTarget.classList.remove('drag-over');
      });
      el.addEventListener('drop', e => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        // Drop d'une carte de lieu → ajout (priorité sur le réordonnancement)
        const placeId = e.dataTransfer.getData('text/place-id');
        if (placeId) { dragSrcIndex = null; addStep(placeId); return; }
        // Réordonnancement d'une étape existante
        const target = +e.currentTarget.dataset.stepIndex;
        if (dragSrcIndex === null || dragSrcIndex === target) return;
        const moved = steps.splice(dragSrcIndex, 1)[0];
        steps.splice(target, 0, moved);
        dragSrcIndex = null;
        persist();
        renderStepList();
        scheduleFetch();
      });

    });

    renderStats();
  }

  // ── Partage ───────────────────────────────────────────────────────────────
  function serializeRoute() {
    return { steps: [...steps], mode, version: 1 };
  }

  function shareRoute() {
    if (!steps.length) { showToastFn(toastWrap, 'Itinéraire vide', ''); return; }
    const url = new URL(window.location.href);
    url.searchParams.set('route', steps.join(','));
    url.searchParams.set('rmode', mode);
    navigator.clipboard.writeText(url.toString())
      .then(() => showToastFn(toastWrap, '🔗 Lien itinéraire copié !', 'success'))
      .catch(() => prompt('Copie ce lien :', url.toString()));
  }

  // ── Export GPX ────────────────────────────────────────────────────────────
  function exportGPX() {
    const places = resolvePlaces().filter(Boolean);
    if (!places.length) { showToastFn(toastWrap, 'Itinéraire vide', ''); return; }

    const wpts = places.map((p, i) => `  <wpt lat="${p.lat}" lon="${p.lng}">
    <name>${escapeXml(p.name)}</name>
    <desc>Étape ${i + 1}</desc>
  </wpt>`).join('\n');

    const rtePoints = places.map(p =>
      `    <rtept lat="${p.lat}" lon="${p.lng}"><name>${escapeXml(p.name)}</name></rtept>`
    ).join('\n');

    // Tracé OSRM si disponible
    const trkPoints = routeData?.geometry?.coordinates
      ? routeData.geometry.coordinates
          .map(([lng, lat]) => `    <trkpt lat="${lat}" lon="${lng}"/>`)
          .join('\n')
      : '';
    const trk = trkPoints
      ? `  <trk><name>Tracé Road Trip</name><trkseg>\n${trkPoints}\n  </trkseg></trk>`
      : '';

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Road Trip Jura" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}
  <rte>
    <name>Road Trip Jura</name>
${rtePoints}
  </rte>
${trk}
</gpx>`;

    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' })),
      download: 'road-trip-jura.gpx',
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showToastFn(toastWrap, 'GPX exporté', 'success');
  }

  // ── Restauration depuis URL ───────────────────────────────────────────────
  function restoreFromUrl() {
    const params     = new URLSearchParams(window.location.search);
    const routeParam = params.get('route');
    const modeParam  = params.get('rmode');
    if (!routeParam) return;

    if (modeParam && OSRM_PROFILE[modeParam]) {
      mode = modeParam;
      if (modeEl) modeEl.value = mode;
      saveRouteMode(mode);
    }
    steps = routeParam.split(',').filter(Boolean);
    persist();

    // Nettoie l'URL
    params.delete('route'); params.delete('rmode');
    history.replaceState(null, '',
      window.location.pathname + (params.toString() ? '?' + params.toString() : '')
    );
  }

  // ── Listeners ─────────────────────────────────────────────────────────────
  stepsEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-step]');
    if (btn) removeStep(+btn.dataset.removeStep);
  });

  // Délégation globale : bouton "Ajouter à l'itinéraire" dans popups + cartes
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-add-route-id]');
    if (btn) addStep(btn.dataset.addRouteId);
  });

  modeEl?.addEventListener('change', () => {
    mode = modeEl.value;
    saveRouteMode(mode);
    scheduleFetch();
  });

  clearBtn?.addEventListener('click',    clearRoute);
  optimizeBtn?.addEventListener('click', optimizeOrder);
  shareBtn?.addEventListener('click',    shareRoute);
  gpxBtn?.addEventListener('click',      exportGPX);

  // ── Drop zone : accepte les cartes de lieu glissées depuis la sidebar ─────
  function isPlaceCardDrag(e) {
    return e.dataTransfer.types.includes('text/place-id');
  }

  const routePanelEl = document.getElementById('routePanel');
  [routePanelEl, stepsEl, emptyEl].forEach(el => {
    if (!el) return;
    el.addEventListener('dragover', e => {
      if (!isPlaceCardDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      routePanelEl?.classList.add('route-drop-target');
    });
    el.addEventListener('dragleave', e => {
      if (!routePanelEl?.contains(e.relatedTarget)) {
        routePanelEl?.classList.remove('route-drop-target');
      }
    });
    el.addEventListener('drop', e => {
      const placeId = e.dataTransfer.getData('text/place-id');
      if (!placeId) return;
      e.preventDefault();
      routePanelEl?.classList.remove('route-drop-target');
      addStep(placeId);
    });
  });

  // Clic sur étape → zoom + popup
  stepsEl.addEventListener('click', e => {
    const li = e.target.closest('[data-step-index]');
    if (!li || e.target.closest('[data-remove-step]')) return;
    const place = resolvePlaces()[+li.dataset.stepIndex];
    if (!place) return;
    if (focusPlaceFn) focusPlaceFn(place);
    else map.flyTo([place.lat, place.lng], 14, { animate: true, duration: 0.8 });
  });

  // ── Initialisation ────────────────────────────────────────────────────────
  if (modeEl) modeEl.value = mode;
  restoreFromUrl();
  renderStepList();
  updateRouteButtons();
  if (steps.length >= 2) scheduleFetch();

  return {
    addStep,
    hasStep:              id => steps.includes(id),
    getStepCount:         () => steps.length,
    serializeRoute,
    refresh:              () => { renderStepList(); updateRouteButtons(); },
    updateRouteButtons,
    loadSteps(ids) {
      steps = ids.filter(Boolean);
      persist();
      renderStepList();
      updateRouteButtons();
      if (steps.length >= 2) scheduleFetch();
    },
  };
}
