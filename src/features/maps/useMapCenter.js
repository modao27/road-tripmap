/**
 * @fileoverview Store du centre de la carte — équivalent de useMapCenter().
 * Découple la logique de centrage du composant MapCanvas.
 *
 * Usage :
 *   const centerStore = createMapCenterStore([46.7, 5.6], 10);
 *   centerStore.registerMap(leafletMap); // appelé par MapCanvas
 *   centerStore.flyTo(lat, lng);
 */

/**
 * @typedef {Object} MapCenterState
 * @property {[number,number]} center - [lat, lng]
 * @property {number}          zoom
 */

/**
 * @param {[number,number]} defaultCenter
 * @param {number}          defaultZoom
 */
export function createMapCenterStore(defaultCenter, defaultZoom) {
  /** @type {MapCenterState} */
  let state = { center: defaultCenter, zoom: defaultZoom };

  /** @type {L.Map|null} */
  let mapRef = null;

  const subs = new Set();

  function setState(patch) {
    state = { ...state, ...patch };
    subs.forEach(fn => fn(state));
  }

  return {
    /** @returns {MapCenterState} */
    getState: () => ({ ...state }),

    /** @param {(s: MapCenterState) => void} fn */
    subscribe(fn) { subs.add(fn); fn(state); return () => subs.delete(fn); },

    /**
     * Enregistre la référence à la carte Leaflet.
     * Appelé par MapCanvas après son initialisation.
     * @param {L.Map} map
     */
    registerMap(map) {
      mapRef = map;
      // Synchronise le store quand l'utilisateur déplace la carte
      map.on('moveend', () => {
        const c = map.getCenter();
        setState({ center: [c.lat, c.lng], zoom: map.getZoom() });
      });
    },

    /**
     * Anime le déplacement vers un point.
     * @param {number} lat
     * @param {number} lng
     * @param {number} [zoom]
     */
    flyTo(lat, lng, zoom) {
      const z = zoom ?? state.zoom;
      setState({ center: [lat, lng], zoom: z });
      mapRef?.flyTo([lat, lng], z, { animate: true, duration: 0.8 });
    },

    /** Invalide la taille de la carte (après redimensionnement du layout). */
    invalidate() { mapRef?.invalidateSize(); },
  };
}
