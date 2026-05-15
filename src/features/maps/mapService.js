/**
 * @fileoverview Service cartographique — initialisation Leaflet et manipulation de couches.
 * Ne contient pas de logique métier (pas de pins, pas de routes).
 * Dépend uniquement de Leaflet (L global) et de la config.
 *
 * @typedef {import('../../shared/types/index.js').MapConfig}    MapConfig
 * @typedef {import('../../shared/types/index.js').BaseLayerKey} BaseLayerKey
 * @typedef {import('../../shared/types/index.js').Pin}          Pin
 * @typedef {import('../../shared/types/index.js').Categories}   Categories
 */

const TILE_LAYERS = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  },
  ign: {
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    options: { maxZoom: 18, attribution: '&copy; IGN – G&eacute;oportail France' },
  },
  sat: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: '&copy; Esri, Maxar, Earthstar Geographics' },
  },
};

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Initialise la carte Leaflet, les fonds de carte et le cluster de marqueurs.
 * @param {MapConfig} config
 * @returns {{ map: L.Map, markerLayer: L.MarkerClusterGroup, baseLayers: Record<BaseLayerKey, L.TileLayer> }}
 */
export function initMap(config) {
  const map = L.map('map', { zoomControl: false }).setView(config.defaultCenter, config.defaultZoom);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

  const baseLayers = Object.fromEntries(
    Object.entries(TILE_LAYERS).map(([key, { url, options }]) => [key, L.tileLayer(url, options)])
  );
  baseLayers.osm.addTo(map);

  const markerLayer = L.markerClusterGroup({
    maxClusterRadius:    config.clusterRadius,
    showCoverageOnHover: false,
    iconCreateFunction:  (cluster) => L.divIcon({
      className: '',
      html:      `<div class="cluster-icon">${cluster.getChildCount()}</div>`,
      iconSize:  [36, 36],
      iconAnchor:[18, 18],
    }),
  }).addTo(map);

  return { map, markerLayer, baseLayers };
}

// ── Layer switcher ────────────────────────────────────────────────────────────

/**
 * @param {Record<BaseLayerKey, L.TileLayer>} baseLayers
 * @param {L.Map} map
 * @param {(key: BaseLayerKey) => void} [onLayerChange]
 * @returns {{ getActiveKey: () => BaseLayerKey, setLayer: (key: BaseLayerKey) => void }}
 */
export function initLayerSwitcher(baseLayers, map, onLayerChange) {
  let activeLayer = baseLayers.osm;
  let activeKey   = 'osm';

  function applyLayer(key) {
    if (!baseLayers[key] || baseLayers[key] === activeLayer) return;
    map.removeLayer(activeLayer);
    activeLayer = baseLayers[key];
    activeKey   = key;
    activeLayer.addTo(map);
    activeLayer.bringToBack();
    document.querySelectorAll('.layer-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.base === key)
    );
    onLayerChange?.(key);
  }

  document.getElementById('layerSwitcher')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.layer-btn');
    if (btn) applyLayer(btn.dataset.base);
  });

  return { getActiveKey: () => activeKey, setLayer: applyLayer };
}

// ── Marqueurs ─────────────────────────────────────────────────────────────────

/**
 * Crée l'icône Leaflet d'un pin.
 * @param {Pin}        pin
 * @param {Categories} categories
 * @returns {L.DivIcon}
 */
export function makePinIcon(pin, categories) {
  const category = categories[pin.category] ?? categories.water;
  const isBase   = pin.category === 'base';
  const size     = isBase ? [44, 44] : [34, 34];
  const anchor   = isBase ? [22, 42] : [17, 32];
  return L.divIcon({
    className: '',
    html:      `<div class="${isBase ? 'custom-marker base' : 'custom-marker'}" style="--color:${category.color}"><span>${category.icon}</span></div>`,
    iconSize:  size,
    iconAnchor:anchor,
    popupAnchor:[0, -31],
  });
}

/**
 * Ajoute un marqueur au registre sans l'attacher à la carte.
 * L'affichage est contrôlé par renderMarkers.
 * @param {Pin}                             pin
 * @param {Map<string, L.Marker>}           markers
 * @param {(pin: Pin) => string}            popupHtmlFn
 * @param {(pin: Pin) => L.DivIcon}         makeIconFn
 */
export function addMarker(pin, markers, popupHtmlFn, makeIconFn) {
  const marker = L.marker([pin.lat, pin.lng], {
    icon:  makeIconFn(pin),
    title: pin.name,
  }).bindPopup(() => popupHtmlFn(pin));  // lazy : toujours à jour
  markers.set(pin.id, marker);
}

/**
 * Reconstruit le marqueur d'un pin (après édition).
 * @param {Pin}                     pin
 * @param {Map<string, L.Marker>}   markers
 * @param {L.MarkerClusterGroup}    markerLayer
 * @param {(pin: Pin) => string}    popupHtmlFn
 * @param {(pin: Pin) => L.DivIcon} makeIconFn
 * @param {Set<string>}             activeCategories
 */
export function refreshMarker(pin, markers, markerLayer, popupHtmlFn, makeIconFn, activeCategories) {
  const old = markers.get(pin.id);
  if (old) { markerLayer.removeLayer(old); markers.delete(pin.id); }
  addMarker(pin, markers, popupHtmlFn, makeIconFn);
  if (activeCategories.has(pin.category)) {
    markerLayer.addLayer(markers.get(pin.id));
  }
}

/**
 * Met à jour la couche de cluster avec les pins visibles.
 * @param {Pin[]}                   visiblePins
 * @param {Map<string, L.Marker>}   markers
 * @param {L.MarkerClusterGroup}    markerLayer
 */
export function renderMarkers(visiblePins, markers, markerLayer) {
  markerLayer.clearLayers();
  visiblePins.forEach(p => {
    const m = markers.get(p.id);
    if (m) markerLayer.addLayer(m);
  });
}

/**
 * Zoome et ouvre la popup d'un pin.
 * @param {Pin}                     pin
 * @param {L.Map}                   map
 * @param {L.MarkerClusterGroup}    markerLayer
 * @param {Map<string, L.Marker>}   markers
 * @param {MediaQueryList}          mobileQuery
 * @param {HTMLElement}             sidebarEl
 * @param {HTMLElement}             sidebarToggleEl
 * @param {MapConfig}               config
 */
export function focusPin(pin, map, markerLayer, markers, mobileQuery, sidebarEl, sidebarToggleEl, config) {
  const marker = markers.get(pin.id);
  map.flyTo([pin.lat, pin.lng], config.focusZoom, { animate: true, duration: 1.1 });
  if (marker) {
    map.once('moveend', () => markerLayer.zoomToShowLayer(marker, () => marker.openPopup()));
  }
  if (mobileQuery.matches) {
    sidebarEl.classList.remove('open');
    sidebarToggleEl.setAttribute('aria-expanded', 'false');
  }
}
