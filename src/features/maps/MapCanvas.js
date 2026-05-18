/**
 * @fileoverview MapCanvas — wrapper Leaflet découplé de Supabase.
 *
 * Contrat :
 * - reçoit des pins comme données brutes (pas de références Supabase)
 * - émet des événements via callbacks (onPinClick, onMapClick)
 * - ne connaît pas AuthStore, pinService, roadtripService
 *
 * Prépare pour : clustering, filtres, couches multiples, heat maps.
 *
 * @typedef {import('../pins/pinService.js').RoadtripPin} RoadtripPin
 */

/** Styles visuels par type de pin (prêts pour extension) */
const PIN_STYLES = {
  start:  { color: '#1f5f43', emoji: '🏁', label: 'Départ'    },
  stop:   { color: '#2477a6', emoji: '🛑', label: 'Étape'     },
  custom: { color: '#605d80', emoji: '📍', label: 'Pin'       },
  poi:    { color: '#d56b1d', emoji: '⭐', label: 'Intérêt'   },
};

const TILES = {
  osm: {
    url:   'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr:  '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZ:  19,
  },
  ign: {
    url:   'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&STYLE=normal',
    attr:  'IGN-F/Géoportail',
    maxZ:  18,
  },
  sat: {
    url:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr:  'Esri, Maxar, Earthstar Geographics',
    maxZ:  19,
  },
};

/**
 * @param {RoadtripPin} pin
 * @param {boolean}     selected
 * @returns {L.DivIcon}
 */
function createMarkerIcon(pin, selected = false) {
  const style = PIN_STYLES[pin.type] ?? PIN_STYLES.custom;
  return L.divIcon({
    className: '',
    html: `<div class="canvas-marker${selected ? ' canvas-marker--selected' : ''}"
                style="--mc:${style.color}"
                title="${pin.title}">
             <span class="canvas-marker__emoji">${style.emoji}</span>
           </div>`,
    iconSize:    [36, 36],
    iconAnchor:  [18, 36],
    popupAnchor: [0, -38],
  });
}

/**
 * Initialise la carte Leaflet.
 *
 * @param {{
 *   container:    HTMLElement,
 *   center:       [number,number],
 *   zoom:         number,
 *   onPinClick?:  (pin: RoadtripPin) => void,
 *   onMapClick?:  (latlng: {lat: number, lng: number}) => void,
 *   onMapReady?:  (map: L.Map) => void,
 * }} opts
 */
export function initMapCanvas({ container, center, zoom, onPinClick, onMapClick, onMapReady }) {
  if (typeof L === 'undefined') throw new Error('Leaflet non chargé. Vérifie <script> dans index.html.');

  // ── Carte de base ─────────────────────────────────────────────────────────
  const map = L.map(container, {
    center: center ?? [46.709, 5.646],
    zoom:   zoom   ?? 10,
    zoomControl: false,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const baseLayers = {};
  Object.entries(TILES).forEach(([key, tile]) => {
    baseLayers[key] = L.tileLayer(tile.url, { attribution: tile.attr, maxZoom: tile.maxZ });
  });
  baseLayers.osm.addTo(map);

  // ── Couche pins (prête pour MarkerClusterGroup) ───────────────────────────
  // Future : const pinLayer = L.markerClusterGroup();
  const pinLayer = L.layerGroup().addTo(map);

  /** @type {Map<string, L.Marker>} id → marker */
  const markers = new Map();
  let   selectedId = null;
  let   addMode    = false;

  // ── Clic sur la carte ─────────────────────────────────────────────────────
  map.on('click', (e) => {
    if (addMode && onMapClick) {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
  });

  onMapReady?.(map);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function addMarker(pin) {
    if (markers.has(pin.id)) removeMarker(pin.id);
    const marker = L.marker([pin.lat, pin.lng], {
      icon:  createMarkerIcon(pin, pin.id === selectedId),
      title: pin.title,
    }).addTo(pinLayer);
    marker.on('click', () => onPinClick?.(pin));
    markers.set(pin.id, marker);
  }

  function removeMarker(id) {
    const m = markers.get(id);
    if (m) { pinLayer.removeLayer(m); markers.delete(id); }
  }

  function refreshIcon(id) {
    const m = markers.get(id);
    if (!m) return;
    const pin = m._pin;
    if (pin) m.setIcon(createMarkerIcon(pin, id === selectedId));
  }

  // ── API publique ──────────────────────────────────────────────────────────

  return {
    /**
     * Remplace toute la couche de pins.
     * @param {RoadtripPin[]} pins
     */
    setPins(pins) {
      // Supprimer les marqueurs qui ne sont plus dans la liste
      for (const id of markers.keys()) {
        if (!pins.find(p => p.id === id)) removeMarker(id);
      }
      // Ajouter / mettre à jour
      pins.forEach(pin => {
        const m = markers.get(pin.id);
        if (m) {
          m._pin = pin;
          m.setLatLng([pin.lat, pin.lng]);
          m.setIcon(createMarkerIcon(pin, pin.id === selectedId));
          m.off('click').on('click', () => onPinClick?.(pin));
        } else {
          addMarker(pin);
          markers.get(pin.id)._pin = pin;
        }
      });
    },

    /**
     * Met en évidence un marqueur (change son icône).
     * @param {string|null} id
     */
    highlightPin(id) {
      const prev = selectedId;
      selectedId = id;
      if (prev)     refreshIcon(prev);
      if (id)       refreshIcon(id);
    },

    /**
     * Anime le déplacement vers un point.
     * @param {number} lat
     * @param {number} lng
     * @param {number} [z]
     */
    flyTo(lat, lng, z) {
      map.flyTo([lat, lng], z ?? map.getZoom(), { animate: true, duration: 0.8 });
    },

    /**
     * Active / désactive le mode ajout de pin.
     * @param {boolean} active
     */
    setAddMode(active) {
      addMode = active;
      container.style.cursor = active ? 'crosshair' : '';
    },

    /** Bascule le fond de carte. @param {'osm'|'ign'|'sat'} key */
    setBaseLayer(key) {
      Object.values(baseLayers).forEach(l => map.removeLayer(l));
      (baseLayers[key] ?? baseLayers.osm).addTo(map);
    },

    /** Recalcule la taille après redimensionnement du conteneur. */
    invalidateSize() { map.invalidateSize(); },

    /** Retourne la référence brute Leaflet (usage exceptionnel). */
    getMap: () => map,

    /** Nettoie la carte (appelé quand la page est détruite). */
    destroy() { map.remove(); markers.clear(); },
  };
}
