// Import GPX — bouton de l'onglet Road Trip : tracé affiché sur la
// carte (couche dédiée) + waypoints proposés à l'ajout comme pins
// (même flux « Ajouter à ma carte » que l'onglet Découvrir).
// Parsing pur : src/features/routing/gpxService.js.
import { escapeHtml as esc } from '../../shared/utils/escape.js';
import { parseGpx, trackLengthMeters } from '../routing/gpxService.js';
import { formatDistance } from '../routing/routingService.js';

/**
 * @param {{
 *   map:         L.Map,
 *   toastWrap:   HTMLElement,
 *   showToastFn: Function,
 *   onAddToMap:  (data: { name, lat, lng, appCategory, description }) => void,
 * }} params
 */
export function initGpxImport({ map, toastWrap, showToastFn, onAddToMap }) {
  const importBtn = document.getElementById('routeGpxImport');
  const fileInput = document.getElementById('gpxFileInput');
  if (!importBtn || !fileInput) return;

  // Couche dédiée — détruite avec la carte au démontage (map.remove)
  const gpxLayer = L.layerGroup().addTo(map);

  importBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // autorise le ré-import du même fichier
    if (!file) return;

    let data;
    try {
      data = parseGpx(await file.text());
    } catch (err) {
      showToastFn(toastWrap, `Import impossible : ${err.message}`, 'error');
      return;
    }
    render(file.name, data);
  });

  function tracePopup(fileName, track) {
    const div = document.createElement('div');
    div.className = 'popup';
    div.innerHTML = `
      <h2>${esc(fileName)}</h2>
      <p class="popup-desc-text">Tracé GPX — ${formatDistance(trackLengthMeters(track))}</p>
      <button class="popup-delete" type="button">✕ Retirer la trace</button>`;
    div.querySelector('button').addEventListener('click', () => {
      gpxLayer.clearLayers();
      map.closePopup();
    });
    return div;
  }

  function wptPopup(w) {
    const div = document.createElement('div');
    div.className = 'popup';
    div.innerHTML = `
      <h2>${esc(w.name)}</h2>
      ${w.desc ? `<p class="popup-desc-text">${esc(w.desc)}</p>` : ''}
      <button class="popup-add-to-map" type="button">➕ Ajouter à ma carte</button>`;
    div.querySelector('button').addEventListener('click', () => {
      map.closePopup();
      onAddToMap?.({ name: w.name, lat: w.lat, lng: w.lng, appCategory: 'hike', description: w.desc });
    });
    return div;
  }

  function render(fileName, { waypoints, track }) {
    gpxLayer.clearLayers();
    const bounds = [];

    if (track.length >= 2) {
      L.polyline(track, {
        color: '#7c4dff', weight: 4, opacity: 0.85, dashArray: '8 6',
        lineJoin: 'round', lineCap: 'round',
      }).bindPopup(tracePopup(fileName, track)).addTo(gpxLayer);
      bounds.push(...track);
    }

    waypoints.forEach(w => {
      L.marker([w.lat, w.lng], {
        icon: L.divIcon({
          className:  '',
          html:       '<div class="gpx-wpt-icon">📍</div>',
          iconSize:   [24, 24],
          iconAnchor: [12, 22],
        }),
        zIndexOffset: 900,
      }).bindTooltip(w.name, { direction: 'top', offset: [0, -18] })
        .bindPopup(wptPopup(w))
        .addTo(gpxLayer);
      bounds.push([w.lat, w.lng]);
    });

    if (!bounds.length) {
      showToastFn(toastWrap, 'GPX vide (ni tracé ni waypoint)', '');
      return;
    }

    map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], maxZoom: 14, animate: true });

    const parts = [];
    if (track.length >= 2)  parts.push(`tracé de ${formatDistance(trackLengthMeters(track))}`);
    if (waypoints.length)   parts.push(`${waypoints.length} waypoint${waypoints.length > 1 ? 's' : ''}`);
    showToastFn(toastWrap, `📂 GPX importé : ${parts.join(' · ')}`, 'success');
  }
}
