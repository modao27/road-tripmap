/**
 * @fileoverview Store éditeur de roadtrip — équivalent vanilla JS de useRoadtripEditor().
 * Orchestre : chargement roadtrip + pins, CRUD pins.
 * Ne touche pas au DOM ni à Leaflet.
 *
 * Usage :
 *   const store = createRoadtripEditorStore(roadtripId);
 *   store.subscribe(({ roadtrip, pins, loading, error }) => render());
 *   await store.load();
 *
 * @typedef {import('../pins/pinService.js').RoadtripPin} RoadtripPin
 * @typedef {import('../../shared/types/index.js').Roadtrip} Roadtrip
 */

import { getRoadtrip }         from './roadtripService.js';
import { listPinsForRoadtrip, createPin, updatePin, deletePin } from '../pins/pinService.js';
import { authStore }           from '../auth/AuthStore.js';

/**
 * @typedef {Object} EditorState
 * @property {Roadtrip|null}   roadtrip
 * @property {RoadtripPin[]}   pins
 * @property {boolean}         loading
 * @property {boolean}         saving
 * @property {string|null}     error
 */

/**
 * Crée un store d'état pour l'éditeur d'un roadtrip.
 * Chaque instance est indépendante — pas de singleton.
 * @param {string} roadtripId
 */
export function createRoadtripEditorStore(roadtripId) {
  /** @type {EditorState} */
  let state = { roadtrip: null, pins: [], loading: true, saving: false, error: null };

  /** @type {Set<(s: EditorState) => void>} */
  const subs = new Set();

  function setState(patch) {
    state = { ...state, ...patch };
    subs.forEach(fn => fn(state));
  }

  // ── API publique ────────────────────────────────────────────────────────────

  return {
    /** @returns {EditorState} */
    getState: () => ({ ...state }),

    /**
     * @param {(s: EditorState) => void} fn
     * @returns {() => void}
     */
    subscribe(fn) {
      subs.add(fn);
      fn(state);
      return () => subs.delete(fn);
    },

    // ── Chargement ────────────────────────────────────────────────────────────

    async load() {
      setState({ loading: true, error: null });
      try {
        const [roadtrip, pins] = await Promise.all([
          getRoadtrip(roadtripId),
          listPinsForRoadtrip(roadtripId),
        ]);
        if (!roadtrip) throw new Error('Road trip introuvable.');
        setState({ roadtrip, pins, loading: false });
      } catch (err) {
        setState({ error: err?.message ?? 'Erreur de chargement.', loading: false });
      }
    },

    // ── CRUD pins ─────────────────────────────────────────────────────────────

    /**
     * @param {{ lat: number, lng: number, title?: string, type?: string }} params
     * @returns {Promise<RoadtripPin>}
     */
    async addPin({ lat, lng, title = 'Nouveau pin', type = 'custom' }) {
      const { user } = authStore.getState();
      setState({ saving: true });
      try {
        const pin = await createPin({
          roadtripId,
          type,
          title,
          description: '',
          lat,
          lng,
          createdBy: user?.id ?? null,
        });
        setState({ pins: [...state.pins, pin], saving: false });
        return pin;
      } catch (err) {
        setState({ saving: false });
        throw err;
      }
    },

    /**
     * @param {string} id
     * @param {Partial<RoadtripPin>} fields
     * @returns {Promise<RoadtripPin>}
     */
    async updatePin(id, fields) {
      setState({ saving: true });
      try {
        const updated = await updatePin(id, fields);
        setState({
          pins: state.pins.map(p => p.id === id ? updated : p),
          saving: false,
        });
        return updated;
      } catch (err) {
        setState({ saving: false });
        throw err;
      }
    },

    /**
     * @param {string} id
     */
    async deletePin(id) {
      setState({ saving: true });
      try {
        await deletePin(id);
        setState({ pins: state.pins.filter(p => p.id !== id), saving: false });
      } catch (err) {
        setState({ saving: false });
        throw err;
      }
    },
  };
}
