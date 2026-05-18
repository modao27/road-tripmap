/**
 * @fileoverview Store de la pin sélectionnée — équivalent de useSelectedPin().
 *
 * @typedef {import('./pinService.js').RoadtripPin} RoadtripPin
 */

/**
 * @typedef {'view'|'edit'|null} PinMode
 *
 * @typedef {Object} SelectedPinState
 * @property {RoadtripPin|null} pin
 * @property {PinMode}          mode
 */

export function createSelectedPinStore() {
  /** @type {SelectedPinState} */
  let state = { pin: null, mode: null };
  const subs = new Set();

  function setState(patch) {
    state = { ...state, ...patch };
    subs.forEach(fn => fn(state));
  }

  return {
    /** @returns {SelectedPinState} */
    getState: () => ({ ...state }),

    /** @param {(s: SelectedPinState) => void} fn */
    subscribe(fn) {
      subs.add(fn);
      fn(state);
      return () => subs.delete(fn);
    },

    /** @param {RoadtripPin} pin */
    select(pin) { setState({ pin, mode: 'view' }); },

    deselect() { setState({ pin: null, mode: null }); },

    /** @param {PinMode} mode */
    setMode(mode) { setState({ mode }); },
  };
}
