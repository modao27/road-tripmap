// L and L.markerClusterGroup are available globally from CDN scripts loaded before this module.

export function initMap(config) {
  const map = L.map('map', { zoomControl: false }).setView(config.defaultCenter, config.defaultZoom);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

  const baseLayers = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }),
    ign: L.tileLayer(
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
      { maxZoom: 18, attribution: '&copy; IGN – G&eacute;oportail France' }
    ),
    sat: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '&copy; Esri, Maxar, Earthstar Geographics' }
    )
  };

  baseLayers.osm.addTo(map);

  const markerLayer = L.markerClusterGroup({
    maxClusterRadius: config.clusterRadius,
    showCoverageOnHover: false,
    iconCreateFunction: (cluster) => L.divIcon({
      className: '',
      html: `<div class="cluster-icon">${cluster.getChildCount()}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    })
  }).addTo(map);

  return { map, markerLayer, baseLayers };
}

export function makeIcon(place, categories) {
  const category = categories[place.category] || categories.water;
  const isBase = place.category === 'base';
  const size = isBase ? [44, 44] : [34, 34];
  const anchor = isBase ? [22, 42] : [17, 32];
  const className = isBase ? 'custom-marker base' : 'custom-marker';

  return L.divIcon({
    className: '',
    html: `<div class="${className}" style="--color:${category.color}"><span>${category.icon}</span></div>`,
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: [0, -31]
  });
}

/**
 * Garde la popup dans l'écran quand son contenu change de taille après
 * l'ouverture (dépliage des <details>, description dépliée, enrichissements
 * async) : Leaflet ne recalcule l'autoPan qu'à l'ouverture. Un
 * ResizeObserver sur le contenu re-déclenche cadrage + recentrage.
 */
export function initPopupAutoPan(map) {
  map.on('popupopen', (e) => {
    const popup   = e.popup;
    const content = popup.getElement()?.querySelector('.leaflet-popup-content');
    if (!content) return;

    let raf = null;
    const observer = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        // Dockée en bottom sheet (mobile) : le CSS positionne, rien à rejouer
        if (popup.getElement()?.classList.contains('sheet-popup')) return;
        // API interne Leaflet 1.x — popup.update() rechargerait le contenu
        // (et perdrait l'état des replis), on ne rejoue que la géométrie.
        popup._updateLayout?.();
        popup._updatePosition?.();
        popup._adjustPan?.();
      });
    });
    observer.observe(content);
    popup.once('remove', () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    });
  });
}

export function addMarker(place, markers, popupHtmlFn, makeIconFn) {
  const marker = L.marker([place.lat, place.lng], {
    icon: makeIconFn(place),
    title: place.name
  // Popup lazy : le HTML est regénéré à chaque ouverture
  // → reflète toujours l'état courant (route, overrides)
  }).bindPopup(() => popupHtmlFn(place));
  markers.set(place.id, marker);
}

export function refreshMarker(place, markers, markerLayer, popupHtmlFn, makeIconFn, activeCategories) {
  const old = markers.get(place.id);
  if (old) {
    markerLayer.removeLayer(old);
    markers.delete(place.id);
  }
  addMarker(place, markers, popupHtmlFn, makeIconFn);
  if (activeCategories.has(place.category)) {
    markerLayer.addLayer(markers.get(place.id));
  }
}

export function renderMap(visiblePlaces, markers, markerLayer) {
  markerLayer.clearLayers();
  visiblePlaces.forEach(p => {
    const marker = markers.get(p.id);
    if (marker) markerLayer.addLayer(marker);
  });
}

export function focusPlace(place, map, markerLayer, markers, mobileQuery, sidebarEl, sidebarToggleEl, config) {
  const marker = markers.get(place.id);
  map.flyTo([place.lat, place.lng], config.focusZoom, { animate: true, duration: 1.1 });
  if (marker) {
    map.once('moveend', () => markerLayer.zoomToShowLayer(marker, () => marker.openPopup()));
  }
  if (mobileQuery.matches) {
    sidebarEl.classList.remove('open');
    sidebarToggleEl.setAttribute('aria-expanded', 'false');
  }
}

export function initLayerSwitcher(baseLayers, map) {
  let activeBaseLayer = baseLayers.osm;
  let activeKey = 'osm';

  function applyLayer(key) {
    if (!baseLayers[key] || baseLayers[key] === activeBaseLayer) return;
    map.removeLayer(activeBaseLayer);
    activeBaseLayer = baseLayers[key];
    activeKey = key;
    activeBaseLayer.addTo(map);
    activeBaseLayer.bringToBack();
    document.querySelectorAll('.layer-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.base === key)
    );
  }

  document.getElementById('layerSwitcher').addEventListener('click', (e) => {
    const btn = e.target.closest('.layer-btn');
    if (btn) applyLayer(btn.dataset.base);
  });

  return {
    getActiveKey: () => activeKey,
    setLayer: applyLayer,
  };
}
