/**
 * @fileoverview Utilitaires localStorage bas niveau.
 * Couche d'abstraction fine sur localStorage.
 * Ne contient pas de logique métier.
 */

/**
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function storageSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** @param {string} key */
export function storageRemove(key) {
  localStorage.removeItem(key);
}

/**
 * Génère un UUID v4.
 * @returns {string}
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * @param {string} str
 * @returns {boolean}
 */
export function isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}
