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

export function addMarker(place, markers, popupHtmlFn, makeIconFn) {
  const marker = L.marker([place.lat, place.lng], {
    icon: makeIconFn(place),
    title: place.name
  }).bindPopup(popupHtmlFn(place));
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

  document.getElementById('layerSwitcher').addEventListener('click', (e) => {
    const btn = e.target.closest('.layer-btn');
    if (!btn) return;
    const key = btn.dataset.base;
    if (!baseLayers[key] || baseLayers[key] === activeBaseLayer) return;
    map.removeLayer(activeBaseLayer);
    activeBaseLayer = baseLayers[key];
    activeBaseLayer.addTo(map);
    activeBaseLayer.bringToBack();
    document.querySelectorAll('.layer-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.base === key)
    );
  });
}
