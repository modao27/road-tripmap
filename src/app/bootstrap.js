/**
 * @fileoverview Orchestrateur principal de l'application.
 *
 * Responsabilité : câbler les services entre eux.
 * Ce module NE contient pas de logique métier.
 * Il :
 *  1. charge les données via les services
 *  2. initialise la carte
 *  3. abonne les composants UI aux événements
 *
 * Principe d'architecture :
 *  - Les services parlent à Supabase / localStorage
 *  - Les composants affichent (DOM, Leaflet)
 *  - bootstrap.js orchestre — il ne fait ni l'un ni l'autre directement
 *
 * @typedef {import('../shared/types/index.js').Pin}         Pin
 * @typedef {import('../shared/types/index.js').Roadtrip}    Roadtrip
 * @typedef {import('../shared/types/index.js').SharedMap}   SharedMap
 */

import { MAP_CONFIG }               from '../config/index.js';
import { initMap, initLayerSwitcher,
         makePinIcon, addMarker,
         renderMarkers, focusPin }  from '../features/maps/mapService.js';
import { loadPins, savePins,
         loadOverrides, saveOverrides,
         fetchPinsRemote,
         fetchOverridesRemote }     from '../features/pins/pinService.js';
import { renderPinPopup }           from '../features/pins/PinPopup.js';
import { loadSharedMap }            from '../features/sharing/sharingService.js';
import { isUUID }                   from '../shared/utils/storage.js';

/**
 * Point d'entrée — appelé depuis index.html via <script type="module">
 */
export async function bootstrap() {
  const params      = new URLSearchParams(window.location.search);
  const mapParam    = params.get('map');
  const isSharedMap = !!mapParam && !isUUID(mapParam);

  // ── 1. Chargement des données ─────────────────────────────────────────────
  let pins      = [];
  let overrides = {};
  let sharedData = null;

  if (isSharedMap) {
    try {
      sharedData = await loadSharedMap(mapParam);
      pins       = sharedData.pins      ?? [];
      overrides  = sharedData.overrides ?? {};
    } catch {
      history.replaceState(null, '', window.location.pathname);
    }
  } else {
    // localStorage comme source de vérité (Supabase = fallback si vide)
    pins      = loadPins();
    overrides = loadOverrides();

    if (!pins.length && !Object.keys(overrides).length) {
      try {
        const mapId = params.get('id') ?? localStorage.getItem('mapId');
        if (mapId) {
          const [remotePins, remoteOverrides] = await Promise.all([
            fetchPinsRemote(mapId),
            fetchOverridesRemote(mapId),
          ]);
          if (remotePins.length || Object.keys(remoteOverrides).length) {
            pins      = remotePins;
            overrides = remoteOverrides;
            savePins(pins);
            saveOverrides(overrides);
          }
        }
      } catch { /* localStorage déjà chargé, on continue */ }
    }
  }

  // ── 2. Initialisation carte ───────────────────────────────────────────────
  const { map, markerLayer, baseLayers } = initMap(MAP_CONFIG);
  const categories = (await import('../../js/data/categories.js')).categories;

  if (isSharedMap && sharedData) {
    map.setView([sharedData.center_lat, sharedData.center_lng], sharedData.zoom, { animate: false });
  }

  initLayerSwitcher(baseLayers, map);

  // ── 3. Rendu des pins ─────────────────────────────────────────────────────
  const markers = new Map();

  function makePinPopup(pin) {
    return renderPinPopup(pin, categories, overrides);
  }

  pins.forEach(pin => addMarker(pin, markers, makePinPopup, (p) => makePinIcon(p, categories)));
  renderMarkers(pins, markers, markerLayer);

  // ── 4. Expose l'API publique (pour les modules qui s'abonnent après) ──────
  return { map, markerLayer, markers, categories, pins, overrides, focusPin, MAP_CONFIG };
}
