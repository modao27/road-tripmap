/**
 * @fileoverview Service météo — Open-Meteo (gratuit, sans clé API).
 * Prévisions quotidiennes 7 jours pour un point. Logique pure : pas de
 * DOM, pas de Leaflet. Le rendu popup vit dans src/features/map/weather.js.
 *
 * Cache session par cellule de 0.1° (~11 km) : la météo est zonale,
 * inutile de refetch pour deux pins voisins.
 */

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// Codes météo WMO → icône + libellé (groupes usuels d'Open-Meteo)
const WMO_GROUPS = [
  [[0],                          '☀️', 'Ciel clair'],
  [[1, 2],                       '🌤️', 'Peu nuageux'],
  [[3],                          '☁️', 'Couvert'],
  [[45, 48],                     '🌫️', 'Brouillard'],
  [[51, 53, 55, 56, 57],         '🌦️', 'Bruine'],
  [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Pluie'],
  [[71, 73, 75, 77, 85, 86],     '🌨️', 'Neige'],
  [[95, 96, 99],                 '⛈️', 'Orage'],
];

/** @param {number} code @returns {{ icon: string, label: string }} */
export function describeWeatherCode(code) {
  for (const [codes, icon, label] of WMO_GROUPS) {
    if (codes.includes(code)) return { icon, label };
  }
  return { icon: '🌡️', label: 'Météo' };
}

/** @type {Map<string, Promise<WeatherDay[]>>} */
const weatherCache = new Map();

/**
 * @typedef {Object} WeatherDay
 * @property {string}      date     - ISO (YYYY-MM-DD)
 * @property {number}      code     - code WMO
 * @property {number}      tMax     - °C arrondi
 * @property {number}      tMin     - °C arrondi
 * @property {number|null} rainProb - probabilité de précipitations max (%)
 */

/**
 * Prévisions 7 jours pour un point (cache session par cellule 0.1°).
 * @param {number} lat @param {number} lng
 * @returns {Promise<WeatherDay[]>}
 */
export function fetchWeatherDaily(lat, lng) {
  const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
  if (!weatherCache.has(key)) {
    // Un échec n'est pas mis en cache — retentera au prochain popup
    weatherCache.set(key, requestDaily(lat, lng).catch(err => {
      weatherCache.delete(key);
      throw err;
    }));
  }
  return weatherCache.get(key);
}

async function requestDaily(lat, lng) {
  const params = new URLSearchParams({
    latitude:      String(lat),
    longitude:     String(lng),
    daily:         'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone:      'auto',
    forecast_days: '7',
  });
  const res = await fetch(`${OPEN_METEO_URL}?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const { daily } = await res.json();
  if (!daily?.time?.length) throw new Error('Open-Meteo: réponse vide');

  return daily.time.map((date, i) => ({
    date,
    code:     daily.weather_code?.[i] ?? -1,
    tMax:     Math.round(daily.temperature_2m_max?.[i] ?? 0),
    tMin:     Math.round(daily.temperature_2m_min?.[i] ?? 0),
    rainProb: daily.precipitation_probability_max?.[i] ?? null,
  }));
}
