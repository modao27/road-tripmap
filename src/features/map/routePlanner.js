import { saveRouteSteps, loadRouteMode, saveRouteMode } from './storage.js';
import { escapeHtml as esc } from '../../shared/utils/escape.js';
import { trapFocus } from './ui.js';
// Logique pure (OSRM, distances, optimisation, GPX) :
// src/features/routing/routingService.js. Ce module garde DOM et Leaflet.
import { OSRM_PROFILE, formatDistance, formatDuration, haversine,
         nearestNeighborOrder, fetchOsrmRoute, buildGpx }
  from '../routing/routingService.js';

// ── Module ────────────────────────────────────────────────────────────────────

export function initRoutePlanner({ map, getAllPlaces, categories, toastWrap, showToastFn, focusPlaceFn, onStepsChange, signal }) {

  // ── État ──────────────────────────────────────────────────────────────────
  let steps         = [];                 // toujours vide au démarrage — restauré uniquement via ?route=
  let stepDays      = [];                 // parallèle à steps — journée (1..dayCount), toujours groupé
  let dayCount      = 1;                  // nombre de jours affichés (≥ max(stepDays))
  let mode          = loadRouteMode();    // 'driving' | 'cycling' | 'walking'
  let routeData     = null;               // {distance, duration, geometry, legs} OSRM
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
  const addDayBtn   = document.getElementById('routeAddDay');
  const timelineBtn       = document.getElementById('routeTimelineBtn');
  const timelineBackdrop  = document.getElementById('timelineBackdrop');
  const timelineDaysEl    = document.getElementById('timelineDays');
  const timelineCloseBtn  = document.getElementById('timelineClose');
  let releaseTimelineFocusTrap = null;

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

  // ── Jours ─────────────────────────────────────────────────────────────────
  // Position d'insertion en fin de journée `day` (steps reste groupé par jour)
  function insertIndexForDay(day) {
    let idx = 0;
    for (let i = 0; i < steps.length; i++) if (stepDays[i] <= day) idx = i + 1;
    return idx;
  }

  function addDay() {
    dayCount++;
    renderStepList();
  }

  // Supprime la journée d : ses étapes rejoignent la journée précédente
  function removeDay(d) {
    if (dayCount <= 1) return;
    stepDays = stepDays.map(x => (x === d ? Math.max(1, d - 1) : (x > d ? x - 1 : x)));
    dayCount--;
    persist();
    renderStepList();
    scheduleFetch();
  }

  function moveStepToDay(from, day) {
    const id = steps.splice(from, 1)[0];
    stepDays.splice(from, 1);
    const idx = insertIndexForDay(day);
    steps.splice(idx, 0, id);
    stepDays.splice(idx, 0, day);
    persist();
    renderStepList();
    updateRouteButtons();
    scheduleFetch();
  }

  // ── Ajout / suppression d'étapes ─────────────────────────────────────────
  function addStep(placeId, day = dayCount) {
    if (steps.includes(placeId)) {
      showToastFn(toastWrap, "Déjà dans l'itinéraire", '');
      return;
    }
    const idx = insertIndexForDay(day);
    steps.splice(idx, 0, placeId);
    stepDays.splice(idx, 0, day);
    persist();
    renderStepList();
    updateRouteButtons();
    scheduleFetch();
    showToastFn(toastWrap, dayCount > 1 ? `Étape ajoutée au jour ${day}` : 'Étape ajoutée', 'success');
  }

  function removeStep(index) {
    steps.splice(index, 1);
    stepDays.splice(index, 1);
    persist();
    renderStepList();
    updateRouteButtons();
    scheduleFetch();
  }

  function clearRoute() {
    steps = [];
    stepDays = [];
    dayCount = 1;
    routeData = null;
    persist();
    renderStepList();
    updateRouteButtons();
    clearMapLayers();
    renderStats();
  }

  function persist() {
    saveRouteSteps(steps);
    onStepsChange?.(steps, [...stepDays]);
  }

  // ── Optimisation (plus proche voisin) ─────────────────────────────────────
  // Multi-jours : chaque journée est optimisée séparément, en partant de la
  // dernière étape du jour précédent (chaînage réaliste des matinées).
  function optimizeOrder() {
    if (steps.length < 3) {
      showToastFn(toastWrap, "3 étapes minimum pour optimiser", '');
      return;
    }
    const places = resolvePlaces();
    const newSteps = [], newDays = [];
    let prevLast = null;
    for (let d = 1; d <= dayCount; d++) {
      const group = [];
      steps.forEach((_, i) => {
        if (stepDays[i] === d && places[i]) group.push(places[i]);
      });
      if (!group.length) continue;
      const ordered = prevLast
        ? nearestNeighborOrder([prevLast, ...group]).slice(1)
        : nearestNeighborOrder(group);
      ordered.forEach(p => { newSteps.push(p.id); newDays.push(d); });
      prevLast = ordered[ordered.length - 1];
    }
    steps    = newSteps;
    stepDays = newDays;
    persist();
    renderStepList();
    updateRouteButtons();
    scheduleFetch();
    showToastFn(toastWrap, 'Itinéraire optimisé', 'success');
  }

  // ── OSRM ──────────────────────────────────────────────────────────────────
  function scheduleFetch() {
    clearTimeout(fetchDebounce);
    if (steps.length < 2) {
      routeData = null; // stats de legs obsolètes
      clearMapLayers();
      if (dayCount > 1) renderStepList(); else renderStats();
      return;
    }
    // Spinner : affichage immédiat en attendant la réponse
    distEl.textContent = '…';
    durEl.textContent  = '…';
    statsEl.hidden = false;
    fetchDebounce = setTimeout(fetchRoute, 700);
  }

  async function fetchRoute() {
    // Liste filtrée (lieux supprimés exclus) + jour de chaque point, pour
    // apparier les legs OSRM aux journées
    const resolved = resolvePlaces();
    const places = [], placeDays = [];
    resolved.forEach((p, i) => {
      if (p) { places.push(p); placeDays.push(stepDays[i]); }
    });
    if (places.length < 2) return;

    try {
      routeData = await fetchOsrmRoute(places, mode);
      // legs[j] relie places[j] → places[j+1] : le trajet appartient à la
      // journée de l'étape d'arrivée (liaison du matin)
      routeData.legDays = placeDays.slice(1);
      drawRoute(routeData.geometry, places);
      if (dayCount > 1) renderStepList(); else renderStats();
    } catch (err) {
      console.warn('[routePlanner]', err);
      // Fallback : tracé ligne droite entre étapes
      drawStraightLine(places);
      routeData = null;
      if (dayCount > 1) renderStepList(); else renderStats();
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
      color: '#F08C46',
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
    const base = `${n} étape${n > 1 ? 's' : ''}`;
    countEl.textContent = dayCount > 1 ? `${base} · ${dayCount} jours` : base;

    if (routeData && n >= 2) {
      distEl.textContent = formatDistance(routeData.distance);
      durEl.textContent  = formatDuration(routeData.duration);
      statsEl.hidden     = false;
    } else {
      statsEl.hidden = true;
    }

    if (timelineBtn) timelineBtn.hidden = n === 0;
    // Timeline ouverte pendant qu'une donnée sous-jacente change (ex. legs
    // OSRM qui arrivent après coup) : la rafraîchir plutôt que la figer.
    if (timelineBackdrop && !timelineBackdrop.hidden) renderTimeline();
  }

  // Cumul des legs OSRM de la journée d (null tant que le tracé n'est pas là,
  // ou si les legs ne correspondent plus aux étapes — recalcul en cours)
  function dayLegStats(d) {
    if (!routeData?.legs?.length || !routeData.legDays) return null;
    const current = resolvePlaces().filter(Boolean).length;
    if (routeData.legs.length !== current - 1) return null;
    let dist = 0, dur = 0, count = 0;
    routeData.legs.forEach((leg, j) => {
      if (routeData.legDays[j] === d) { dist += leg.distance; dur += leg.duration; count++; }
    });
    return count ? { dist, dur } : null;
  }

  // ── Timeline (Phase H10) : vue alternative, jours côte à côte ────────────
  // Lecture seule — les mêmes steps/stepDays/dayLegStats que la liste,
  // aucune donnée dupliquée. Réordonnancement/édition restent dans la liste.
  function timelineStepHtml(place, i) {
    const cat   = place ? categories[place.category] : null;
    const name  = place ? place.name : '[Lieu supprimé]';
    const icon  = cat?.icon ?? '❓';
    const color = cat?.color ?? '#888';
    return `
      <button class="timeline-step" type="button" data-step-index="${i}" style="--color:${color}">
        <span class="timeline-step-icon">${icon}</span>
        <span class="timeline-step-name">${esc(name)}</span>
      </button>`;
  }

  function timelineDayHtml(d, idxs, places) {
    const s = dayLegStats(d);
    const stats = s
      ? `${formatDistance(s.dist)} · ${formatDuration(s.dur)}`
      : `${idxs.length} étape${idxs.length > 1 ? 's' : ''}`;

    let stepsHtml = '';
    idxs.forEach((i, pos) => {
      const place = places[i];
      if (pos > 0) {
        const prevPlace = places[idxs[pos - 1]];
        if (prevPlace && place) {
          const dist = haversine(prevPlace.lat, prevPlace.lng, place.lat, place.lng);
          stepsHtml += `<div class="timeline-connector" aria-hidden="true">↓ ${formatDistance(dist)}</div>`;
        }
      }
      stepsHtml += timelineStepHtml(place, i);
    });

    return `
      <div class="timeline-day">
        <div class="timeline-day-header">
          <span class="timeline-day-label">Jour ${d}</span>
          <span class="timeline-day-stats">${idxs.length ? stats : 'Aucune étape'}</span>
        </div>
        <div class="timeline-day-steps">
          ${idxs.length ? stepsHtml : '<p class="timeline-day-empty">Aucune étape ce jour</p>'}
        </div>
      </div>`;
  }

  function renderTimeline() {
    if (!timelineDaysEl) return;
    const places = resolvePlaces();
    let html = '';
    for (let d = 1; d <= dayCount; d++) {
      const idxs = [];
      for (let i = 0; i < steps.length; i++) if (stepDays[i] === d) idxs.push(i);
      html += timelineDayHtml(d, idxs, places);
    }
    timelineDaysEl.innerHTML = html;
  }

  function openTimeline() {
    renderTimeline();
    timelineBackdrop.hidden = false;
    releaseTimelineFocusTrap = trapFocus(timelineBackdrop);
  }

  function closeTimeline() {
    timelineBackdrop.hidden = true;
    releaseTimelineFocusTrap?.(); releaseTimelineFocusTrap = null;
  }

  // ── Liste des étapes (groupée par jour quand dayCount > 1) ───────────────
  function stepHtml(places, i) {
    const place    = places[i];
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
          <span class="route-step-name">${esc(name)}</span>
          ${partialHtml}
        </span>
        <button class="route-step-remove" data-remove-step="${i}"
                type="button" title="Retirer de l'itinéraire">✕</button>
      </li>`;
  }

  function dayHeaderHtml(d, stepCount) {
    const s = dayLegStats(d);
    const stats = s
      ? `${formatDistance(s.dist)} · ${formatDuration(s.dur)}`
      : `${stepCount} étape${stepCount > 1 ? 's' : ''}`;
    return `
      <li class="route-day" data-day="${d}">
        <span class="route-day-label">Jour ${d}</span>
        <span class="route-day-stats">${stats}</span>
        <button class="route-day-remove" data-remove-day="${d}" type="button"
                title="Supprimer ce jour (ses étapes rejoignent le jour précédent)">✕</button>
      </li>`;
  }

  function renderStepList() {
    // dayCount > 1 : la liste reste visible même vide (jours à remplir)
    const showList  = steps.length > 0 || dayCount > 1;
    emptyEl.hidden  = showList;
    stepsEl.hidden  = !showList;

    if (!showList) { stepsEl.innerHTML = ''; renderStats(); return; }

    const places = resolvePlaces();

    let html = '';
    for (let d = 1; d <= dayCount; d++) {
      const idxs = [];
      for (let i = 0; i < steps.length; i++) if (stepDays[i] === d) idxs.push(i);
      if (dayCount > 1) {
        html += dayHeaderHtml(d, idxs.length);
        if (!idxs.length) {
          html += `<li class="route-day-empty" data-day="${d}">Glisse des étapes ici</li>`;
        }
      }
      idxs.forEach(i => { html += stepHtml(places, i); });
    }
    stepsEl.innerHTML = html;

    // Drag & drop — étapes
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
        e.stopPropagation(); // la drop zone du panneau ne doit pas re-traiter
        e.currentTarget.classList.remove('drag-over');
        const target = +e.currentTarget.dataset.stepIndex;
        // Drop d'une carte de lieu → ajout dans la journée de la cible
        const placeId = e.dataTransfer.getData('text/place-id');
        if (placeId) { dragSrcIndex = null; addStep(placeId, stepDays[target] ?? dayCount); return; }
        // Réordonnancement d'une étape existante — elle prend le jour de la cible
        if (dragSrcIndex === null || dragSrcIndex === target) return;
        const targetDay = stepDays[target];
        const moved = steps.splice(dragSrcIndex, 1)[0];
        stepDays.splice(dragSrcIndex, 1);
        steps.splice(target, 0, moved);
        stepDays.splice(target, 0, targetDay);
        dragSrcIndex = null;
        persist();
        renderStepList();
        scheduleFetch();
      });
    });

    // Drag & drop — en-têtes de jour et jours vides (dépose en fin de journée)
    stepsEl.querySelectorAll('[data-day]').forEach(el => {
      el.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('drag-over');
        const d = +el.dataset.day;
        const placeId = e.dataTransfer.getData('text/place-id');
        if (placeId) { dragSrcIndex = null; addStep(placeId, d); return; }
        if (dragSrcIndex === null) return;
        const from = dragSrcIndex;
        dragSrcIndex = null;
        moveStepToDay(from, d);
      });
    });

    renderStats();
  }

  // ── Partage ───────────────────────────────────────────────────────────────
  function serializeRoute() {
    return { steps: [...steps], days: [...stepDays], mode, version: 2 };
  }

  function shareRoute() {
    if (!steps.length) { showToastFn(toastWrap, 'Itinéraire vide', ''); return; }
    const url = new URL(window.location.href);
    url.searchParams.set('route', steps.join(','));
    url.searchParams.set('rmode', mode);
    if (dayCount > 1) url.searchParams.set('rdays', stepDays.join(','));
    navigator.clipboard.writeText(url.toString())
      .then(() => showToastFn(toastWrap, '🔗 Lien itinéraire copié !', 'success'))
      .catch(() => prompt('Copie ce lien :', url.toString()));
  }

  // ── Export GPX ────────────────────────────────────────────────────────────
  function exportGPX() {
    const places = resolvePlaces().filter(Boolean);
    if (!places.length) { showToastFn(toastWrap, 'Itinéraire vide', ''); return; }

    const gpx = buildGpx(places, routeData?.geometry ?? null);

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

  // ── Chargement d'un itinéraire complet ────────────────────────────────────
  // Normalise ids + jours : jours entiers ≥ 1, étapes regroupées par jour
  // (tri stable — l'ordre est conservé au sein d'une même journée).
  function setStepsAndDays(ids, days) {
    const pairs = ids
      .map((id, i) => ({ id, day: Math.max(1, Math.trunc(days?.[i]) || 1) }))
      .filter(p => p.id);
    pairs.sort((a, b) => a.day - b.day);
    steps    = pairs.map(p => p.id);
    stepDays = pairs.map(p => p.day);
    dayCount = steps.length ? Math.max(...stepDays) : 1;
  }

  // ── Restauration depuis URL ───────────────────────────────────────────────
  function restoreFromUrl() {
    const params     = new URLSearchParams(window.location.search);
    const routeParam = params.get('route');
    const modeParam  = params.get('rmode');
    const daysParam  = params.get('rdays');
    if (!routeParam) return;

    if (modeParam && OSRM_PROFILE[modeParam]) {
      mode = modeParam;
      if (modeEl) modeEl.value = mode;
      saveRouteMode(mode);
    }
    const ids  = routeParam.split(',').filter(Boolean);
    const days = daysParam ? daysParam.split(',').map(Number) : null;
    setStepsAndDays(ids, days?.length === ids.length ? days : null);
    persist();

    // Nettoie l'URL
    params.delete('route'); params.delete('rmode'); params.delete('rdays');
    history.replaceState(null, '',
      window.location.pathname + (params.toString() ? '?' + params.toString() : '')
    );
  }

  // ── Listeners ─────────────────────────────────────────────────────────────
  stepsEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-step]');
    if (btn) { removeStep(+btn.dataset.removeStep); return; }
    const dayBtn = e.target.closest('[data-remove-day]');
    if (dayBtn) removeDay(+dayBtn.dataset.removeDay);
  });

  // Délégation globale : bouton "Ajouter à l'itinéraire" dans popups + cartes
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-add-route-id]');
    if (btn) addStep(btn.dataset.addRouteId);
  }, { signal });

  signal?.addEventListener('abort', () => clearTimeout(fetchDebounce), { once: true });

  modeEl?.addEventListener('change', () => {
    mode = modeEl.value;
    saveRouteMode(mode);
    scheduleFetch();
  });

  clearBtn?.addEventListener('click',    clearRoute);
  optimizeBtn?.addEventListener('click', optimizeOrder);
  shareBtn?.addEventListener('click',    shareRoute);
  gpxBtn?.addEventListener('click',      exportGPX);
  addDayBtn?.addEventListener('click',   addDay);

  // ── Timeline (Phase H10) ──────────────────────────────────────────────────
  timelineBtn?.addEventListener('click', openTimeline);
  timelineCloseBtn?.addEventListener('click', closeTimeline);
  timelineBackdrop?.addEventListener('click', (e) => {
    if (e.target === timelineBackdrop) closeTimeline();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && timelineBackdrop && !timelineBackdrop.hidden) closeTimeline();
  }, { signal });
  // Clic sur une étape de la timeline → zoom + popup sur la carte, comme
  // pour la liste (stepsEl plus bas) ; ferme l'overlay pour révéler la carte.
  timelineDaysEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step-index]');
    if (!btn) return;
    const place = resolvePlaces()[+btn.dataset.stepIndex];
    if (!place) return;
    closeTimeline();
    if (focusPlaceFn) focusPlaceFn(place);
    else map.flyTo([place.lat, place.lng], 14, { animate: true, duration: 0.8 });
  });

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
    /** @param {string[]} ids @param {number[]|null} [days] parallèle à ids */
    loadSteps(ids, days = null) {
      setStepsAndDays(ids, days);
      persist();
      renderStepList();
      updateRouteButtons();
      if (steps.length >= 2) scheduleFetch();
    },
  };
}
