import { places as staticPlaces } from './data/places.js';
import { categories } from './data/categories.js';
import { loadUserPins, loadOverrides } from './storage.js';
import { initMap, makeIcon, addMarker, focusPlace, renderMap, initLayerSwitcher } from './map.js';
import { renderFilters, renderLegend, renderPlaces, getVisiblePlaces } from './filters.js';
import { showToast, initSidebar, initResizer } from './ui.js';
import { popupHtml, initPins } from './pins.js';

export const CONFIG = {
  defaultCenter: [46.709, 5.646],
  defaultZoom: 10,
  focusZoom: 13,
  clusterRadius: 50,
  geocodeLimit: 5,
  geocodeDebounce: 350,
  sidebarDefault: 390,
  sidebarMin: 240,
  sidebarMax: 720,
};

// ── Check Leaflet availability ───────────────────────────────────────────────
if (typeof L === 'undefined') {
  document.querySelector('#map').innerHTML =
    "<p style='margin:24px;font:16px system-ui;color:#143f31'>Leaflet n'a pas pu se charger. Vérifie ta connexion internet puis recharge la page.</p>";
  throw new Error('Leaflet is not available');
}

// ── Mutable shared state ─────────────────────────────────────────────────────
const userPlaces = loadUserPins();
const placeOverrides = loadOverrides();

const activeCategories = new Set(Object.keys(categories));
let searchQuery = '';
const markers = new Map();

const categoryRank = new Map(Object.keys(categories).map((k, i) => [k, i]));

// ── Derived data helpers ─────────────────────────────────────────────────────
function effectivePlace(p) {
  return placeOverrides[p.id] ? { ...p, ...placeOverrides[p.id] } : p;
}

function getAllPlaces() {
  return [...staticPlaces.map(effectivePlace), ...userPlaces];
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const filtersEl = document.querySelector('#filters');
const legendEl = document.querySelector('#legend');
const placeListEl = document.querySelector('#placeList');
const visibleCountEl = document.querySelector('#visibleCount');
const sidebarEl = document.querySelector('#sidebar');
const sidebarToggleEl = document.querySelector('#sidebarToggle');
const searchInput = document.querySelector('#searchInput');
const toastWrap = document.getElementById('toastWrap');

// ── Map initialisation ───────────────────────────────────────────────────────
const { map, markerLayer, baseLayers } = initMap(CONFIG);
const mobileQuery = window.matchMedia('(max-width: 820px)');

// ── Icon & popup factories (close over shared state) ─────────────────────────
function makeIconFn(place) {
  return makeIcon(place, categories);
}

function makePopupHtml(place) {
  return popupHtml(place, categories, placeOverrides);
}

// ── Render helpers ────────────────────────────────────────────────────────────
function doRenderMap() {
  const visible = getVisiblePlaces(getAllPlaces, activeCategories, searchQuery, categoryRank);
  renderMap(visible, markers, markerLayer);
}

function doRenderPlaces() {
  const visible = getVisiblePlaces(getAllPlaces, activeCategories, searchQuery, categoryRank);
  renderPlaces(visible, placeListEl, visibleCountEl, categories);
}

function doRenderFilters() {
  renderFilters(filtersEl, categories, getAllPlaces, activeCategories);
}

function onRefresh() {
  doRenderFilters();
  doRenderPlaces();
  doRenderMap();
}

function doFocusPlace(place) {
  focusPlace(place, map, markerLayer, markers, mobileQuery, sidebarEl, sidebarToggleEl, CONFIG);
}

// ── Geolocate ─────────────────────────────────────────────────────────────────
let userLocationMarker = null;

document.querySelector('#geolocateButton').addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast(toastWrap, 'Géolocalisation non disponible sur ce navigateur.', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
      }
      userLocationMarker = L.circle([latitude, longitude], {
        radius: 120,
        color: '#143f31',
        weight: 2,
        fillColor: 'rgba(31, 95, 67, 0.18)',
        fillOpacity: 0.4
      }).addTo(map);
      userLocationMarker.bindPopup('Vous êtes ici').openPopup();
      map.flyTo([latitude, longitude], 13, { animate: true, duration: 1.2 });
    },
    () => {
      showToast(toastWrap, "Impossible de récupérer la position. Vérifie les autorisations.", 'error');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ── Recenter ──────────────────────────────────────────────────────────────────
const basePlace = staticPlaces.find(p => p.id === 'baume-les-messieurs');

document.querySelector('#recenterButton').addEventListener('click', () => {
  doFocusPlace(basePlace);
});

// ── Filters ───────────────────────────────────────────────────────────────────
filtersEl.addEventListener('change', (event) => {
  if (!event.target.matches("input[type='checkbox']")) return;
  if (event.target.checked) {
    activeCategories.add(event.target.value);
  } else {
    activeCategories.delete(event.target.value);
  }
  doRenderMap();
  doRenderPlaces();
});

function setAllFilters(enabled) {
  document.querySelectorAll('#filters input').forEach((input) => {
    input.checked = enabled;
    if (enabled) activeCategories.add(input.value);
    else activeCategories.delete(input.value);
  });
  doRenderMap();
  doRenderPlaces();
}

document.querySelector('#showAllButton').addEventListener('click', () => setAllFilters(true));
document.querySelector('#hideAllButton').addEventListener('click', () => setAllFilters(false));

// ── Search ────────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', (event) => {
  searchQuery = event.target.value.trim().toLowerCase();
  doRenderMap();
  doRenderPlaces();
});

// ── Place list click ──────────────────────────────────────────────────────────
placeListEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-place-id]');
  if (!button) return;
  const place = getAllPlaces().find(p => p.id === button.dataset.placeId);
  if (place) doFocusPlace(place);
});

// ── Sidebar, resizer, layer switcher ─────────────────────────────────────────
initSidebar(sidebarEl, sidebarToggleEl, mobileQuery, map);
initResizer(map, CONFIG);
initLayerSwitcher(baseLayers, map);

// ── Pins ──────────────────────────────────────────────────────────────────────
initPins({
  map,
  markerLayer,
  markers,
  categories,
  getAllPlaces,
  staticPlaces,
  userPlacesRef: userPlaces,
  placeOverridesRef: placeOverrides,
  activeCategories,
  makeIconFn,
  toastWrap,
  showToastFn: showToast,
  onRefresh,
  focusPlaceFn: doFocusPlace,
  config: CONFIG,
  onMapClick: () => {
    if (mobileQuery.matches) {
      sidebarEl.classList.remove('open');
      sidebarToggleEl.setAttribute('aria-expanded', 'false');
    }
  }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
getAllPlaces().forEach(place => addMarker(place, markers, makePopupHtml, makeIconFn));
renderLegend(legendEl, categories);
doRenderFilters();
doRenderMap();
doRenderPlaces();

requestAnimationFrame(() => {
  map.invalidateSize();
  doFocusPlace(basePlace);
});

window.addEventListener('load', () => map.invalidateSize());
window.addEventListener('resize', () => map.invalidateSize());
