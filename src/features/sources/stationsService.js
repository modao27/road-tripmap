/**
 * @fileoverview Service de recherche de gares françaises — dataset statique
 * trainline-eu/stations (licence ODbL, cf. README), filtré sur la France
 * (sncf_is_enabled + is_suggestable). Logique pure, chargement paresseux
 * (fetch JSON à la première recherche, mise en cache ensuite).
 */

/** @type {Promise<Station[]>|null} */
let stationsPromise = null;

function loadStations() {
  if (!stationsPromise) {
    stationsPromise = fetch(new URL('./data/stations-fr.json', import.meta.url))
      .then(res => res.json());
  }
  return stationsPromise;
}

/**
 * @typedef {Object} Station
 * @property {string}  uic  - code UIC SNCF (identifiant stable)
 * @property {string}  name
 * @property {number}  lat
 * @property {number}  lng
 * @property {boolean} main - gare principale de son agglomération
 */

// Retire les diacritiques (U+0300-U+036F, marques combinantes) pour une
// recherche insensible aux accents.
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalize(s) {
  return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
}

/**
 * Recherche par sous-chaîne (insensible à la casse et aux accents), gares
 * principales et correspondances en préfixe d'abord.
 * @param {string} query
 * @param {number} [limit]
 * @returns {Promise<Station[]>}
 */
export async function searchStations(query, limit = 8) {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  const stations = await loadStations();
  return stations
    .filter(s => normalize(s.name).includes(q))
    .sort((a, b) => {
      const aPrefix = normalize(a.name).startsWith(q) ? 0 : 1;
      const bPrefix = normalize(b.name).startsWith(q) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      if (a.main !== b.main) return a.main ? -1 : 1;
      return a.name.localeCompare(b.name, 'fr');
    })
    .slice(0, limit);
}
