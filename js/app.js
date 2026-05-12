import { places as staticPlaces } from './data/places.js';
import { categories } from './data/categories.js';
import { isUUID } from './storage.js';
import * as svc from './storageService.js';
import { initMap, makeIcon, addMarker, focusPlace, renderMap, initLayerSwitcher } from './map.js';
import { renderFilters, renderLegend, renderPlaces, getVisiblePlaces } from './filters.js';
import { showToast, setSyncStatus, initSidebar, initResizer } from './ui.js';
import { popupHtml, initPins } from './pins.js';
import { fetchUserPins, fetchOverrides,
         upsertUserPin, deleteUserPinRemote,
         upsertOverride, deleteOverrideRemote,
         loadSharedMap } from './supabase.js';
import { initShareModal, showSharedMapBanner, confirmSharedMapLoad } from './share.js';
import { initRoutePlanner } from './routePlanner.js';
import { initOverpass } from './overpass.js';
import { initOnboarding } from './onboarding.js';

// ── Configuration ─────────────────────────────────────────────────────────────
export const CONFIG = {
  defaultCenter:   [46.709, 5.646],
  defaultZoom:     10,
  focusZoom:       13,
  clusterRadius:   50,
  geocodeLimit:    5,
  geocodeDebounce: 350,
  sidebarDefault:  390,
  sidebarMin:      240,
  sidebarMax:      720,
};

if (typeof L === 'undefined') {
  document.querySelector('#map').innerHTML =
    "<p style='margin:24px;font:16px system-ui;color:#143f31'>Leaflet n'a pas pu se charger. Vérifie ta connexion internet puis recharge la page.</p>";
  throw new Error('Leaflet is not available');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  const params      = new URLSearchParams(window.location.search);
  const mapParam    = params.get('map');        // carte partagée (slug)
  const idParam     = params.get('id');         // roadtrip ID
  const isNew       = params.get('new') === 'true';
  const isOnboarding = params.get('onboard') === 'true';

  // Un slug (non UUID) dans ?map= indique une carte partagée
  let isSharedMap = !!mapParam && !isUUID(mapParam);
  let roadtripId  = null;

  // ── Résolution du roadtrip ID ─────────────────────────────────────────────
  if (!isSharedMap) {
    if (idParam) {
      roadtripId = idParam;
      if (!svc.getRoadtrip(roadtripId)) {
        svc.createRoadtripWithId(roadtripId, 'Road trip Jura', '');
      }
    } else if (isNew) {
      const trip = svc.createRoadtrip({ title: 'Nouveau road trip' });
      window.location.replace(`map.html?id=${trip.id}&onboard=true`);
      return;
    } else {
      // Aucun ID → retour à la homepage
      window.location.replace('/');
      return;
    }
  }

  const mapId = roadtripId; // compatibilité Supabase

  // ── 1. Tentative de chargement de la carte partagée ──────────────────────
  let sharedData = null;
  if (isSharedMap) {
    try {
      sharedData = await loadSharedMap(mapParam);
    } catch {
      isSharedMap = false;
      history.replaceState(null, '', window.location.pathname);
    }
  }

  // ── 2. Confirmation si des données locales existent déjà ─────────────────
  if (isSharedMap && sharedData) {
    const localPins      = svc.loadPins(roadtripId || '');
    const localOverrides = svc.loadOverrides(roadtripId || '');
    const hasLocalData   = localPins.length > 0 || Object.keys(localOverrides).length > 0;
    if (hasLocalData) {
      const confirmed = await confirmSharedMapLoad(sharedData.title);
      if (!confirmed) {
        isSharedMap = false;
        sharedData  = null;
        history.replaceState(null, '', window.location.pathname);
      }
    }
  }

  // ── 3. Chargement effectif des données ───────────────────────────────────
  let userPlaces, placeOverrides;

  if (isSharedMap && sharedData) {
    userPlaces     = sharedData.pins      || [];
    placeOverrides = sharedData.overrides || {};
  } else {
    // localStorage est la source de vérité pour le multi-roadtrip.
    // Supabase ne sert que de fallback si le localStorage est vide (ex: autre appareil).
    userPlaces     = svc.loadPins(roadtripId);
    placeOverrides = svc.loadOverrides(roadtripId);

    if (!userPlaces.length && !Object.keys(placeOverrides).length) {
      try {
        const [sbPins, sbOverrides] = await Promise.all([
          fetchUserPins(mapId),
          fetchOverrides(mapId),
        ]);
        if (sbPins.length || Object.keys(sbOverrides).length) {
          userPlaces     = sbPins;
          placeOverrides = sbOverrides;
          svc.savePins(roadtripId, userPlaces);
          svc.saveOverrides(roadtripId, placeOverrides);
        }
      } catch {
        // données localStorage déjà chargées, on continue
      }
    }
  }

  // ── État partagé ──────────────────────────────────────────────────────────
  const savedFilters = isSharedMap && sharedData?.filters?.length
    ? sharedData.filters
    : svc.loadActiveFilters(roadtripId);
  const activeCategories = new Set(savedFilters || Object.keys(categories));
  let searchQuery = '';
  const markers   = new Map();
  const categoryRank = new Map(Object.keys(categories).map((k, i) => [k, i]));

  function effectivePlace(p) {
    return placeOverrides[p.id] ? { ...p, ...placeOverrides[p.id] } : p;
  }

  // ── Migration one-shot : lieux statiques → pins utilisateur ──────────────
  // Pour les roadtrips créés avant l'architecture multi-roadtrips
  // (showStaticPlaces absent = undefined), on importe les lieux de places.js
  // comme de vrais pins, uniquement si le roadtrip est vide.
  // Après cette migration, showStaticPlaces passe à false définitivement.
  if (roadtripId) {
    const trip = svc.getRoadtrip(roadtripId);
    if (trip?.showStaticPlaces !== false) {
      if (userPlaces.length === 0) {
        const imported = staticPlaces.map(p => ({
          ...effectivePlace(p),
          user_created: true,
          userCreated: true,
          source: 'import',
        }));
        userPlaces.push(...imported);
        svc.savePins(roadtripId, userPlaces);
      }
      svc.updateRoadtrip(roadtripId, { showStaticPlaces: false });
    }
  }

  function getAllPlaces() {
    return [...userPlaces];
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
  const layerSwitcher = initLayerSwitcher(baseLayers, map, key => {
    if (roadtripId) svc.saveBaseLayer(roadtripId, key);
  });
  const mobileQuery = window.matchMedia('(max-width: 820px)');

  // Restaure le fond de carte du roadtrip
  if (!isSharedMap && roadtripId) {
    layerSwitcher.setLayer(svc.loadBaseLayer(roadtripId));
  }

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
  // Point d'ancrage : pin 'base' du roadtrip, sinon lieu statique Jura en mode legacy
  const staticBasePlace = staticPlaces.find(p => p.id === 'baume-les-messieurs');
  function getAnchorPlace() {
    if (roadtripId) return userPlaces.find(p => p.category === 'base') ?? null;
    return staticBasePlace;
  }

  document.querySelector('#recenterButton').addEventListener('click', () => {
    const anchor = getAnchorPlace();
    if (anchor) {
      doFocusPlace(anchor);
    } else {
      // Pas de pin de base : retour à la vue sauvegardée ou vue par défaut
      const saved = roadtripId ? svc.loadMapView(roadtripId) : null;
      if (saved) map.flyTo([saved.lat, saved.lng], saved.zoom, { animate: true, duration: 1.2 });
      else        map.flyTo(CONFIG.defaultCenter, CONFIG.defaultZoom, { animate: true, duration: 1.2 });
    }
  });

  // ── Filtres (pills) ───────────────────────────────────────────────────────
  filtersEl.addEventListener('change', (event) => {
    if (!event.target.matches("input[type='checkbox']")) return;
    if (event.target.checked) activeCategories.add(event.target.value);
    else activeCategories.delete(event.target.value);
    event.target.closest('.filter-pill')?.classList.toggle('active', event.target.checked);
    if (roadtripId) svc.saveActiveFilters(roadtripId, activeCategories);
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
  initResizer(map, CONFIG);

  // ── Onglets ───────────────────────────────────────────────────────────────
  const tabPlacesBtn  = document.getElementById('tabPlaces');
  const tabRouteBtn   = document.getElementById('tabRoute');
  tabBadgeEl          = document.getElementById('tabRouteBadge');
  const panePlaces    = document.getElementById('tabPanePlaces');
  const paneRoute     = document.getElementById('tabPaneRoute');

  function switchTab(tab) {
    const isPlaces = tab === 'places';
    tabPlacesBtn?.classList.toggle('active', isPlaces);
    tabPlacesBtn?.setAttribute('aria-selected', String(isPlaces));
    tabRouteBtn?.classList.toggle('active', !isPlaces);
    tabRouteBtn?.setAttribute('aria-selected', String(!isPlaces));
    panePlaces?.classList.toggle('active', isPlaces);
    paneRoute?.classList.toggle('active', !isPlaces);
    localStorage.setItem('activeTab', tab);
    setTimeout(() => map.invalidateSize(), 10);
  }

  tabPlacesBtn?.addEventListener('click', () => switchTab('places'));
  tabRouteBtn?.addEventListener('click',  () => switchTab('route'));
  switchTab(localStorage.getItem('activeTab') || 'places');

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
    });
  }

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
    roadtripId,
    config:           CONFIG,
    mapId,
    upsertUserPinFn:  isSharedMap ? null : upsertUserPin,
    deleteUserPinFn:  isSharedMap ? null : deleteUserPinRemote,
    upsertOverrideFn: isSharedMap ? null : upsertOverride,
    deleteOverrideFn: isSharedMap ? null : deleteOverrideRemote,
    onMapClick: () => {
      if (mobileQuery.matches) {
        sidebarEl.classList.remove('open');
        sidebarToggleEl.setAttribute('aria-expanded', 'false');
        updateRouteBadge();
      }
    },
  });

  // ── Itinéraire ────────────────────────────────────────────────────────────
  // Déclaré en let pour que onRefresh() y ait accès via la closure
  let routePlanner = null;
  routePlanner = initRoutePlanner({
    map, getAllPlaces, categories, toastWrap, showToastFn: showToast,
    focusPlaceFn: doFocusPlace,
    roadtripId,
  });

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

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  // Titre de page depuis le nom du roadtrip
  if (roadtripId && !isSharedMap) {
    const trip = svc.getRoadtrip(roadtripId);
    if (trip?.title) {
      const titleEl = document.getElementById('roadtripTitle');
      if (titleEl) titleEl.textContent = trip.title;
      document.title = `${trip.title} — Road Trip`;
    }
  }

  const savedView = (!isSharedMap && roadtripId) ? svc.loadMapView(roadtripId) : null;
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
      if (roadtripId) svc.saveMapView(roadtripId, c.lat, c.lng, map.getZoom());
    }, 800);
  });

  updateRouteBadge();

  requestAnimationFrame(() => {
    map.invalidateSize();
    // Ne pas zoomer sur un lieu si la carte est vierge (onboarding)
    if (!isSharedMap && !savedView && !isOnboarding) {
      const anchor = getAnchorPlace();
      if (anchor) doFocusPlace(anchor);
    }
  });

  // ── Découvrir (Overpass OSM) — modale POI ────────────────────────────────
  const placesPanel = document.getElementById('placesPanel');
  const discoveryBanner = document.getElementById('discoveryBanner');
  const discoveryCountEl = document.getElementById('discoveryCount');

  const overpassModule = initOverpass({
    map, toastWrap, showToastFn: showToast,
    onAddToMap: data => pinsModule?.openForOverpass(data),
    onDiscoveryStart: () => {
      if (map.hasLayer(markerLayer)) map.removeLayer(markerLayer);
      if (placesPanel) placesPanel.hidden = true;
      if (discoveryBanner) discoveryBanner.hidden = false;
      switchTab('places');
    },
    onDiscoveryDone: (count) => {
      if (discoveryCountEl) {
        discoveryCountEl.textContent =
          count > 0
            ? `${count} lieu${count > 1 ? 'x' : ''} découvert${count > 1 ? 's' : ''}`
            : 'Aucun résultat dans cette zone';
      }
    },
    onDiscoveryClear: () => {
      if (!map.hasLayer(markerLayer)) markerLayer.addTo(map);
      if (placesPanel) placesPanel.hidden = false;
      if (discoveryBanner) discoveryBanner.hidden = true;
    },
  });

  document.getElementById('overpassOpenBtn')?.addEventListener('click', () => {
    document.getElementById('overpassBackdrop').hidden = false;
  });
  document.getElementById('discoveryClose')?.addEventListener('click', () => {
    overpassModule?.clearResults();
  });

  // ── Onboarding nouveau road trip ──────────────────────────────────────────
  if (isOnboarding && !isSharedMap) {
    initOnboarding({ map, pinsModule, config: CONFIG });
  }

  window.addEventListener('load',   () => map.invalidateSize());
  window.addEventListener('resize', () => map.invalidateSize());

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
  });
}

init();
