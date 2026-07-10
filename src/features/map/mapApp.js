import { places as staticPlaces } from './places.js';
import { categories } from '../../config/categories.js';
import { loadUserPins, loadOverrides, saveUserPins, saveOverrides,
         getOrCreateMapId, isUUID,
         loadRoadtripCache, saveRoadtripCache,
         saveMapView, loadMapView } from './storage.js';
import { initMap, makeIcon, addMarker, focusPlace, renderMap, initLayerSwitcher } from './map.js';
import { renderFilters, renderLegend, renderPlaces, getVisiblePlaces } from './filters.js';
import { showToast, setSyncStatus, initSidebar, initResizer } from './ui.js';
import { popupHtml, initPins } from './pins.js';
import { fetchPinsRemote, fetchOverridesRemote,
         upsertPinRemote, deletePinRemote,
         upsertOverrideRemote, deleteOverrideRemote,
         fetchRoadtripPins, createRoadtripPin,
         upsertRoadtripPin, deleteRoadtripPin,
         updatePinOrder } from '../pins/pinService.js';
import { fetchRoadtripInfo } from '../roadtrips/roadtripService.js';
import { loadSharedMap } from '../sharing/sharingService.js';
import { getCurrentUserId, sessionReady } from '../../shared/lib/session.js';
import { initShareModal, showSharedMapBanner, confirmSharedMapLoad } from './share.js';
import { initRoutePlanner } from './routePlanner.js';
import { initOverpass } from './overpass.js';
import { initDatatourisme, initDtNearbyPopups } from './datatourisme.js';
import { initWikivoyagePopups } from './wikivoyage.js';
import { initWeatherPopups } from './weather.js';
import { initRealtimePins } from './realtime.js';
import { initOnboarding } from './onboarding.js';
import { initDiscoverSourceSwitch } from './discover.js';

// ── Configuration ─────────────────────────────────────────────────────────────
// Source unique : src/config/index.js (partagée avec la SPA)
import { MAP_CONFIG as CONFIG } from '../../config/index.js';

// ── Bootstrap ─────────────────────────────────────────────────────────────────
/**
 * Monte l'application carte sur le markup déjà présent dans le DOM.
 * @param {{ mapParam?: string|null, signal?: AbortSignal }} params
 *   mapParam : UUID de roadtrip, slug de carte partagée, ou null (carte
 *   personnelle). Fourni par map.html (?map=) ou par la route SPA.
 *   signal : démontage (MapPage). Tous les listeners document/window des
 *   modules carte y sont attachés — abort() les retire d'un coup, même si
 *   la navigation survient pendant l'init.
 * @returns {Promise<() => void>} destroy — stoppe les timers et détruit
 *   l'instance Leaflet. Appelé par MapPage après abort().
 */
export async function initMapApp({ mapParam = null, signal } = {}) {
  if (typeof L === 'undefined') {
    document.querySelector('#map').innerHTML =
      "<p style='margin:24px;font:16px system-ui;color:#143f31'>Leaflet n'a pas pu se charger. Vérifie ta connexion internet puis recharge la page.</p>";
    throw new Error('Leaflet is not available');
  }

  const isRoadtripUUID = !!mapParam && isUUID(mapParam);
  // Un slug (non UUID) indique une carte partagée
  let isSharedMap = !!mapParam && !isUUID(mapParam);

  // ── 1. Tentative de chargement de la carte partagée ──────────────────────
  let sharedData = null;
  if (isSharedMap) {
    try {
      sharedData = await loadSharedMap(mapParam);
    } catch {
      // Slug introuvable ou hors ligne → on retombe sur la carte personnelle
      isSharedMap = false;
      history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }

  // ── 2. Confirmation si l'utilisateur a déjà des données locales ──────────
  if (isSharedMap && sharedData) {
    const localPins      = loadUserPins();
    const localOverrides = loadOverrides();
    const hasLocalData   = localPins.length > 0 || Object.keys(localOverrides).length > 0;

    if (hasLocalData) {
      const confirmed = await confirmSharedMapLoad(sharedData.title, signal);
      if (!confirmed) {
        // L'utilisateur refuse → on reste sur sa carte perso, on nettoie l'URL
        isSharedMap = false;
        sharedData  = null;
        history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
    }
  }

  const mapId = isSharedMap ? null : getOrCreateMapId(mapParam);

  // ── 3. Chargement effectif des données ───────────────────────────────────
  let userPlaces, placeOverrides;

  if (isSharedMap && sharedData) {
    userPlaces     = sharedData.pins      || [];
    placeOverrides = sharedData.overrides || {};
  } else {
    try {
      [userPlaces, placeOverrides] = await Promise.all([
        fetchPinsRemote(mapId),
        fetchOverridesRemote(mapId),
      ]);
      saveUserPins(userPlaces);
      saveOverrides(placeOverrides);
    } catch {
      userPlaces     = loadUserPins();
      placeOverrides = loadOverrides();
    }
  }

  // ── 3b. Pins du roadtrip (table 'pins', si ?map= est un UUID) ────────────
  // Attend que le token soit rafraîchi avant les appels authentifiés
  // (évite la race condition sur mobile : JWT expiré lu en cache sync au démarrage)
  if (isRoadtripUUID) await sessionReady;

  let roadtripPinIds  = [];
  let roadtripPinDays = [];
  let roadtripInfo    = null;
  if (!isSharedMap && mapParam && isUUID(mapParam)) {
    let rawPins = null;
    try {
      rawPins      = await fetchRoadtripPins(mapParam);
      roadtripInfo = await fetchRoadtripInfo(mapParam);
      // Miroir hors-ligne (PWA). Un résultat vide en anonyme peut n'être
      // qu'un filtre RLS (session expirée) : ne pas écraser le miroir.
      if (rawPins.length > 0 || getCurrentUserId()) {
        saveRoadtripCache(mapParam, {
          pins: rawPins,
          info: roadtripInfo ?? loadRoadtripCache(mapParam)?.info ?? null,
        });
      }
    } catch {
      // Hors ligne ou non connecté : dernière consultation réussie
      const cached = loadRoadtripCache(mapParam);
      if (cached) { rawPins = cached.pins; roadtripInfo = cached.info; }
    }

    if (rawPins) {
      rawPins.forEach(pin => userPlaces.push(normalizeRoadtripPin(pin)));
      roadtripPinIds  = rawPins.map(p => p.id);
      roadtripPinDays = rawPins.map(p => p.day ?? 1); // colonne absente → Jour 1
    }

    if (roadtripInfo?.title) {
      document.title = roadtripInfo.title;
      const h1 = document.querySelector('.sidebar-header-main h1');
      if (h1) h1.textContent = roadtripInfo.title;
      const eyebrow = document.querySelector('.eyebrow');
      if (eyebrow) eyebrow.textContent = 'Road trip';
      const intro = document.getElementById('sidebarIntro');
      if (intro) intro.hidden = true;
    }
  }

  // La navigation a pu quitter la carte pendant les fetches ci-dessus :
  // le markup a été remplacé, inutile (et dangereux) de continuer.
  if (signal?.aborted) return () => {};

  // ── État partagé ──────────────────────────────────────────────────────────
  const activeCategories = new Set(
    isSharedMap && sharedData?.filters?.length
      ? sharedData.filters
      : Object.keys(categories)
  );
  let searchQuery = '';
  const markers   = new Map();
  const categoryRank = new Map(Object.keys(categories).map((k, i) => [k, i]));

  function effectivePlace(p) {
    return placeOverrides[p.id] ? { ...p, ...placeOverrides[p.id] } : p;
  }
  /** Ligne de la table pins → objet lieu de la carte (hissée : utilisée
   *  par le chargement initial plus haut et par le temps réel) */
  function normalizeRoadtripPin(pin) {
    return {
      id:           pin.id,
      name:         pin.title,
      category:     pin.category || 'nature',
      lat:          pin.lat,
      lng:          pin.lng,
      description:  pin.description || '',
      interest: '', tip: '', mood: '',
      day:          pin.day ?? 1,
      orderIndex:   pin.order_index ?? 0,
      userCreated:  true,
      user_created: true,
    };
  }
  function getAllPlaces() {
    const base = isRoadtripUUID ? [] : staticPlaces.map(effectivePlace);
    return [...base, ...userPlaces];
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const filtersEl       = document.querySelector('#filters');
  const legendEl        = document.querySelector('#legend');
  const placeListEl     = document.querySelector('#placeList');
  const visibleCountEl  = document.querySelector('#visibleCount');
  const sidebarEl       = document.querySelector('#sidebar');
  const sidebarToggleEl = document.querySelector('#sidebarToggle');
  const searchInput     = document.querySelector('#searchInput');
  const toastWrap       = document.getElementById('toastWrap');

  // ── Carte ─────────────────────────────────────────────────────────────────
  const { map, markerLayer, baseLayers } = initMap(CONFIG);
  const layerSwitcher = initLayerSwitcher(baseLayers, map);
  const mobileQuery   = window.matchMedia('(max-width: 820px)');

  // Restaure l'état si carte partagée
  if (isSharedMap && sharedData) {
    map.setView([sharedData.center_lat, sharedData.center_lng], sharedData.zoom, { animate: false });
    if (sharedData.base_layer) layerSwitcher.setLayer(sharedData.base_layer);
    showSharedMapBanner(sharedData.title);
  }

  // ── Factories ─────────────────────────────────────────────────────────────
  function makeIconFn(place)    { return makeIcon(place, categories); }
  function makePopupHtml(place) {
    return popupHtml(place, categories, placeOverrides, routePlanner?.hasStep(place.id) ?? false);
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function getVisible() {
    return getVisiblePlaces(getAllPlaces, activeCategories, searchQuery, categoryRank);
  }
  function doRenderMap()     { renderMap(getVisible(), markers, markerLayer); }
  function doRenderPlaces()  { renderPlaces(getVisible(), placeListEl, visibleCountEl, categories, searchQuery); }
  function doRenderFilters() { renderFilters(filtersEl, categories, getAllPlaces, activeCategories); }
  const routeBadgeEl       = document.getElementById('routeBadge');
  const routeBadgeCountEl  = document.getElementById('routeBadgeCount');
  const routeBadgePluralEl = document.getElementById('routeBadgePlural');
  let tabBadgeEl = null; // initialisé après la création des onglets

  function onRefresh()       { doRenderFilters(); doRenderPlaces(); doRenderMap(); routePlanner?.refresh(); updateRouteBadge(); }

  function updateRouteBadge() {
    const count = routePlanner?.getStepCount() ?? 0;
    // Badge flottant mobile
    if (routeBadgeEl) {
      routeBadgeEl.hidden = count === 0 || sidebarEl.classList.contains('open');
      if (routeBadgeCountEl) routeBadgeCountEl.textContent = count;
      if (routeBadgePluralEl) routeBadgePluralEl.hidden = count === 1;
    }
    // Badge sur l'onglet Road Trip
    if (tabBadgeEl) {
      tabBadgeEl.hidden = count === 0;
      tabBadgeEl.textContent = count;
    }
  }
  function doFocusPlace(p)   {
    focusPlace(p, map, markerLayer, markers, mobileQuery, sidebarEl, sidebarToggleEl, CONFIG);
  }

  // ── Géolocalisation ───────────────────────────────────────────────────────
  let userLocationMarker = null;
  document.querySelector('#geolocateButton').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast(toastWrap, 'Géolocalisation non disponible sur ce navigateur.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        if (userLocationMarker) map.removeLayer(userLocationMarker);
        userLocationMarker = L.circle([latitude, longitude], {
          radius: 120, color: '#143f31', weight: 2,
          fillColor: 'rgba(31, 95, 67, 0.18)', fillOpacity: 0.4,
        }).addTo(map);
        userLocationMarker.bindPopup('Vous êtes ici').openPopup();
        map.flyTo([latitude, longitude], 13, { animate: true, duration: 1.2 });
      },
      () => showToast(toastWrap, "Impossible de récupérer la position. Vérifie les autorisations.", 'error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // ── Recentrer ─────────────────────────────────────────────────────────────
  const basePlace = staticPlaces.find(p => p.id === 'baume-les-messieurs');
  document.querySelector('#recenterButton').addEventListener('click', () => {
    if (isRoadtripUUID && userPlaces.length > 0) {
      // Centroïde des pins du roadtrip
      const lat = userPlaces.reduce((s, p) => s + p.lat, 0) / userPlaces.length;
      const lng = userPlaces.reduce((s, p) => s + p.lng, 0) / userPlaces.length;
      map.flyTo([lat, lng], roadtripInfo?.default_zoom ?? 10, { animate: true, duration: 1 });
    } else if (isRoadtripUUID && roadtripInfo?.center_lat) {
      map.flyTo([roadtripInfo.center_lat, roadtripInfo.center_lng],
                roadtripInfo.default_zoom ?? 10, { animate: true, duration: 1 });
    } else {
      doFocusPlace(basePlace);
    }
  });

  // ── Filtres (pills) ───────────────────────────────────────────────────────
  filtersEl.addEventListener('change', (event) => {
    if (!event.target.matches("input[type='checkbox']")) return;
    if (event.target.checked) activeCategories.add(event.target.value);
    else activeCategories.delete(event.target.value);
    event.target.closest('.filter-pill')?.classList.toggle('active', event.target.checked);
    doRenderMap(); doRenderPlaces();
  });

  function setAllFilters(enabled) {
    document.querySelectorAll('#filters input').forEach((input) => {
      input.checked = enabled;
      if (enabled) activeCategories.add(input.value);
      else activeCategories.delete(input.value);
      input.closest('.filter-pill')?.classList.toggle('active', enabled);
    });
    doRenderMap(); doRenderPlaces();
  }
  document.querySelector('#showAllButton').addEventListener('click', () => setAllFilters(true));
  document.querySelector('#hideAllButton').addEventListener('click', () => setAllFilters(false));

  // ── Recherche déclenchable ────────────────────────────────────────────────
  const searchToggle = document.getElementById('searchToggle');

  function openSearch() {
    searchInput.hidden = false;
    searchToggle.hidden = true;
    searchInput.focus();
    switchTab('places');
  }

  function closeSearch() {
    searchQuery = '';
    searchInput.value = '';
    searchInput.hidden = true;
    searchToggle.hidden = false;
    doRenderMap(); doRenderPlaces();
  }

  searchToggle?.addEventListener('click', openSearch);

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    doRenderMap(); doRenderPlaces();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !searchInput.value) closeSearch();
  });

  searchInput.addEventListener('blur', () => {
    if (!searchInput.value) closeSearch();
  });

  // ── Clic liste ────────────────────────────────────────────────────────────
  placeListEl.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-place-id]');
    if (!btn) return;
    const place = getAllPlaces().find(p => p.id === btn.dataset.placeId);
    if (place) doFocusPlace(place);
  });

  // ── UI ────────────────────────────────────────────────────────────────────
  initSidebar(sidebarEl, sidebarToggleEl, mobileQuery, map, updateRouteBadge);
  initResizer(map, CONFIG, signal);

  // ── Onglets ───────────────────────────────────────────────────────────────
  const tabPlacesBtn   = document.getElementById('tabPlaces');
  const tabRouteBtn    = document.getElementById('tabRoute');
  const tabDiscoverBtn = document.getElementById('tabDiscover');
  tabBadgeEl           = document.getElementById('tabRouteBadge');
  const panePlaces     = document.getElementById('tabPanePlaces');
  const paneRoute      = document.getElementById('tabPaneRoute');
  const paneDiscover   = document.getElementById('tabPaneDiscover');

  function switchTab(tab) {
    const active = { places: tab === 'places', route: tab === 'route', discover: tab === 'discover' };
    tabPlacesBtn?.classList.toggle('active', active.places);
    tabPlacesBtn?.setAttribute('aria-selected', String(active.places));
    tabRouteBtn?.classList.toggle('active', active.route);
    tabRouteBtn?.setAttribute('aria-selected', String(active.route));
    tabDiscoverBtn?.classList.toggle('active', active.discover);
    tabDiscoverBtn?.setAttribute('aria-selected', String(active.discover));
    panePlaces?.classList.toggle('active', active.places);
    paneRoute?.classList.toggle('active', active.route);
    paneDiscover?.classList.toggle('active', active.discover);
    if (active.discover) overpassModule?.activate();
    setTimeout(() => map.invalidateSize(), 10);
  }

  tabPlacesBtn?.addEventListener('click',   () => switchTab('places'));
  tabRouteBtn?.addEventListener('click',    () => switchTab('route'));
  tabDiscoverBtn?.addEventListener('click', () => switchTab('discover'));
  switchTab('places');

  // ── En-tête collapsible ───────────────────────────────────────────────────
  const headerToggleBtn = document.getElementById('headerToggleBtn');
  const sidebarIntro    = document.getElementById('sidebarIntro');

  function setHeaderCollapsed(collapsed) {
    sidebarIntro?.classList.toggle('collapsed', collapsed);
    headerToggleBtn?.setAttribute('aria-expanded', String(!collapsed));
    if (headerToggleBtn) headerToggleBtn.textContent = collapsed ? '▼' : '▲';
    localStorage.setItem('headerCollapsed', collapsed ? '1' : '0');
  }

  headerToggleBtn?.addEventListener('click', () => {
    setHeaderCollapsed(!sidebarIntro?.classList.contains('collapsed'));
  });

  // Collapsé par défaut après la première visite
  setHeaderCollapsed(localStorage.getItem('headerCollapsed') === '1');

  // ── Modale de partage (désactivée en mode lecture d'une carte partagée) ───
  if (!isSharedMap) {
    initShareModal({
      map,
      getActiveLayerKey: layerSwitcher.getActiveKey,
      activeCategories,
      getUserPlaces:    () => userPlaces,
      getPlaceOverrides: () => placeOverrides,
      toastWrap,
      showToastFn:      showToast,
      setSyncStatusFn:  setSyncStatus,
      signal,
    });
  }

  // Mode roadtrip : roadtrip reconnu en DB (même si aucun pin existant)
  // roadtripInfo !== null = le UUID est dans la table roadtrips = nouvelle archi
  const isRoadtripMode = !isSharedMap && roadtripInfo !== null;

  // ── Pins (sync Supabase désactivée pour les cartes partagées) ────────────
  let pinsModule = null;
  pinsModule = initPins({
    map, markerLayer, markers, categories, getAllPlaces, staticPlaces,
    userPlacesRef:    userPlaces,
    placeOverridesRef: placeOverrides,
    activeCategories, makeIconFn, toastWrap,
    showToastFn:      showToast,
    setSyncStatusFn:  setSyncStatus,
    onRefresh,
    focusPlaceFn:     doFocusPlace,
    onMarkerAdded:    setupMarkerHover,
    config:           CONFIG,
    mapId,
    createUserPinFn:  isSharedMap ? null : (isRoadtripMode ? (_ignored, pin) => createRoadtripPin(mapParam, pin) : upsertPinRemote),
    upsertUserPinFn:  isSharedMap ? null : (isRoadtripMode ? upsertRoadtripPin : upsertPinRemote),
    deleteUserPinFn:  isSharedMap ? null : (isRoadtripMode ? deleteRoadtripPin : deletePinRemote),
    upsertOverrideFn: isSharedMap ? null : upsertOverrideRemote,
    deleteOverrideFn: isSharedMap ? null : deleteOverrideRemote,
    signal,
    onMapClick: () => {
      if (mobileQuery.matches) {
        sidebarEl.classList.remove('open');
        sidebarToggleEl.setAttribute('aria-expanded', 'false');
        updateRouteBadge();
      }
    },
  });

  // ── Découvrir ─────────────────────────────────────────────────────────────
  const tabDiscoverBadgeEl = document.getElementById('tabDiscoverBadge');

  function onDiscoverResults(count) {
    if (tabDiscoverBadgeEl) {
      tabDiscoverBadgeEl.textContent = String(count);
      tabDiscoverBadgeEl.hidden = count === 0;
    }
    if (count > 0) switchTab('discover');
  }

  const overpassModule = initOverpass({
    map, toastWrap, showToastFn: showToast,
    onAddToMap:        data => pinsModule?.openForOverpass(data),
    appCategories:     categories,
    onDiscoverResults,
    signal,
  });

  const dtModule = initDatatourisme({
    map, toastWrap, showToastFn: showToast,
    resultListEl:    document.getElementById('overpassResultList'),
    statusEl:        document.getElementById('overpassStatus'),
    clearBtn:        document.getElementById('overpassClear'),
    discoverCountEl: document.getElementById('discoverCount'),
    discoverEmptyEl: document.getElementById('discoverEmpty'),
    onDiscoverResults,
  });

  // ── Switch source OSM / Tourisme officiel ─────────────────────────────────
  initDiscoverSourceSwitch({ overpassModule, dtModule });

  // ── Itinéraire ────────────────────────────────────────────────────────────
  // Déclaré en let pour que onRefresh() y ait accès via la closure
  let routePlanner    = null;
  let orderSaveTimer  = null;
  routePlanner = initRoutePlanner({
    map, getAllPlaces, categories, toastWrap, showToastFn: showToast,
    focusPlaceFn: doFocusPlace,
    onStepsChange: isRoadtripMode ? (steps, days) => {
      clearTimeout(orderSaveTimer);
      orderSaveTimer = setTimeout(() => updatePinOrder(steps, days), 1000);
    } : null,
    signal,
  });

  // Charge les étapes du roadtrip si des pins ont été récupérés
  if (roadtripPinIds.length >= 2) {
    routePlanner.loadSteps(roadtripPinIds, roadtripPinDays);
  }

  // ── Cross-highlight sidebar ↔ carte ──────────────────────────────────────
  function setupMarkerHover(place) {
    const marker = markers.get(place.id);
    if (!marker) return;
    marker.on('mouseover', () => {
      const card = placeListEl.querySelector(`[data-place-id="${place.id}"]`);
      if (card) { card.classList.add('card-highlight'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    });
    marker.on('mouseout', () => {
      placeListEl.querySelector(`[data-place-id="${place.id}"]`)?.classList.remove('card-highlight');
    });
  }

  // Carte → marker (délégation sur la liste)
  // Drag d'une carte vers l'itinéraire
  placeListEl.addEventListener('dragstart', e => {
    const btn = e.target.closest('[data-place-id]');
    if (!btn) return;
    e.dataTransfer.setData('text/place-id', btn.dataset.placeId);
    e.dataTransfer.effectAllowed = 'copy';
  });

  placeListEl.addEventListener('mouseover', e => {
    const btn = e.target.closest('[data-place-id]');
    if (btn) markers.get(btn.dataset.placeId)?.getElement()?.classList.add('marker-highlight');
  });
  placeListEl.addEventListener('mouseout', e => {
    const btn = e.target.closest('[data-place-id]');
    if (btn) markers.get(btn.dataset.placeId)?.getElement()?.classList.remove('marker-highlight');
  });

  // ── Badge itinéraire mobile ───────────────────────────────────────────────
  routeBadgeEl?.addEventListener('click', () => {
    sidebarEl.classList.add('open');
    sidebarToggleEl.setAttribute('aria-expanded', 'true');
    switchTab('route');
    updateRouteBadge();
    setTimeout(() => map.invalidateSize(), 230);
  });

  // ── Mode lecture seule (public/partagé sans être le propriétaire) ───────────
  const currentUserId = getCurrentUserId();
  const isReadOnly    = isRoadtripMode &&
    roadtripInfo?.owner_id &&
    roadtripInfo.owner_id !== currentUserId;

  if (isReadOnly) {
    // Masque les contrôles d'édition
    document.getElementById('pinModeButton')?.setAttribute('hidden', '');
    document.getElementById('pinHint')?.setAttribute('hidden', '');
    document.getElementById('routeClear')?.setAttribute('hidden', '');
    document.getElementById('routeOptimize')?.setAttribute('hidden', '');
    document.getElementById('routeShare')?.setAttribute('hidden', '');
    // Bannière lecture seule
    const banner = document.createElement('div');
    banner.className = 'readonly-banner';
    banner.textContent = '👁 Lecture seule — ce road trip appartient à un autre utilisateur.';
    document.querySelector('.sidebar-header')?.appendChild(banner);
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  const savedView = !isSharedMap ? loadMapView() : null;
  if (savedView) map.setView([savedView.lat, savedView.lng], savedView.zoom, { animate: false });

  getAllPlaces().forEach(place => {
    addMarker(place, markers, makePopupHtml, makeIconFn);
    setupMarkerHover(place);
  });
  renderLegend(legendEl, categories);
  doRenderFilters();
  doRenderMap();
  doRenderPlaces();

  // Sauvegarde de la vue (debounce 800 ms pour éviter les écritures pendant les animations)
  let viewSaveTimer = null;
  map.on('moveend', () => {
    clearTimeout(viewSaveTimer);
    viewSaveTimer = setTimeout(() => {
      const c = map.getCenter();
      saveMapView(c.lat, c.lng, map.getZoom());
    }, 800);
  });

  updateRouteBadge();

  // ── Wikivoyage — enrichissement popup villages/points d'ancrage ──────────
  initWikivoyagePopups(map);

  // ── DATAtourisme — hébergements, restaurants, événements à proximité ─────
  initDtNearbyPopups(map);

  // ── Météo — prévisions 7 jours (Open-Meteo) dans toutes les popups ────────
  initWeatherPopups(map);

  // ── Onboard : première ouverture d'un roadtrip vide ───────────────────────
  initOnboarding({
    map,
    roadtripId:   isRoadtripUUID ? mapParam : null,
    roadtripInfo,
    hasPins:      roadtripPinIds.length > 0,
    signal,
    onPlaceCreated(place) {
      userPlaces.push(place);
      roadtripPinIds.push(place.id);
      addMarker(place, markers, makePopupHtml, makeIconFn);
      setupMarkerHover(place);
      onRefresh();
    },
  });

  // ── Temps réel — pins des co-équipiers (Supabase Realtime) ────────────────
  function removeRoadtripMarker(id) {
    const m = markers.get(id);
    if (m) { markerLayer.removeLayer(m); markers.delete(id); }
  }

  // Réaligne l'itinéraire sur (day, order_index) des pins. No-op si l'ordre
  // est déjà le bon (écho de notre propre drag & drop) — évite la boucle
  // persist → UPDATE → resync.
  function resyncRouteSteps() {
    const rtPlaces = userPlaces
      .filter(p => roadtripPinIds.includes(p.id))
      .sort((a, b) => ((a.day ?? 1) - (b.day ?? 1)) || ((a.orderIndex ?? 0) - (b.orderIndex ?? 0)));
    const ids  = rtPlaces.map(p => p.id);
    const days = rtPlaces.map(p => p.day ?? 1);
    const cur  = routePlanner.serializeRoute();
    if (ids.join(',') === cur.steps.join(',') && days.join(',') === cur.days.join(',')) return;
    routePlanner.loadSteps(ids, days);
  }

  function onRealtimeInsert(row) {
    if (row.status && row.status !== 'active') return;
    if (userPlaces.some(p => p.id === row.id)) return; // écho local
    const place = normalizeRoadtripPin(row);
    userPlaces.push(place);
    roadtripPinIds.push(place.id);
    addMarker(place, markers, makePopupHtml, makeIconFn);
    setupMarkerHover(place);
    onRefresh();
    resyncRouteSteps();
    showToast(toastWrap, `📍 « ${place.name} » ajouté au road trip`, 'success');
  }

  function onRealtimeUpdate(row) {
    const place = userPlaces.find(p => p.id === row.id);
    if (!place) return;
    if (row.status && row.status !== 'active') { onRealtimeDelete(row); return; }
    const moved = place.lat !== row.lat || place.lng !== row.lng
      || place.name !== row.title
      || place.category !== (row.category || 'nature')
      || place.description !== (row.description || '');
    Object.assign(place, normalizeRoadtripPin(row));
    if (moved) {
      removeRoadtripMarker(place.id);
      addMarker(place, markers, makePopupHtml, makeIconFn);
      setupMarkerHover(place);
      onRefresh();
    }
    resyncRouteSteps();
  }

  function onRealtimeDelete(row) {
    const idx = userPlaces.findIndex(p => p.id === row.id);
    if (idx === -1) return; // autre roadtrip, ou suppression déjà faite ici
    const [removed] = userPlaces.splice(idx, 1);
    roadtripPinIds = roadtripPinIds.filter(id => id !== row.id);
    removeRoadtripMarker(row.id);
    onRefresh();
    resyncRouteSteps();
    showToast(toastWrap, `🗑 « ${removed.name} » retiré du road trip`, '');
  }

  if (isRoadtripMode) {
    initRealtimePins({
      roadtripId: mapParam,
      signal,
      onInsert: onRealtimeInsert,
      onUpdate: onRealtimeUpdate,
      onDelete: onRealtimeDelete,
    });
  }

  requestAnimationFrame(() => {
    map.invalidateSize();
    if (!isSharedMap && !savedView && !roadtripPinIds.length) doFocusPlace(basePlace);
  });

  window.addEventListener('load',   () => map.invalidateSize(), { signal });
  window.addEventListener('resize', () => map.invalidateSize(), { signal });

  // ── Raccourcis clavier globaux ────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    // Ctrl+F / Cmd+F → focus sur la barre de recherche
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      if (mobileQuery.matches) {
        sidebarEl.classList.add('open');
        sidebarToggleEl.setAttribute('aria-expanded', 'true');
      }
      openSearch();
      searchInput.select();
    }
  }, { signal });

  // ── Démontage (navigation SPA) ────────────────────────────────────────────
  // L'abort du signal (MapPage) retire les listeners document/window ;
  // destroy() libère ce que le signal ne couvre pas.
  return function destroy() {
    clearTimeout(orderSaveTimer);
    clearTimeout(viewSaveTimer);
    map.remove();                 // instance Leaflet : markers, popups, listeners carte
  };
}
