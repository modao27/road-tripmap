// Météo 7 jours dans les popups (tous les lieux — bivouacs, via
// ferratas… c'est sur le terrain qu'elle sert le plus).
// Données : src/features/sources/weatherService.js (Open-Meteo).
// Ce module ne gère que le rendu dans les popups Leaflet.
import { escapeHtml as esc } from '../../shared/utils/escape.js';
import { fetchWeatherDaily, describeWeatherCode } from '../sources/weatherService.js';

function dayName(isoDate, index) {
  if (index === 0) return "Auj.";
  return new Date(isoDate + 'T12:00:00')
    .toLocaleDateString('fr-FR', { weekday: 'short' });
}

export function initWeatherPopups(map) {
  map.on('popupopen', async (e) => {
    const container = e.popup.getElement()?.querySelector('.wx-strip');
    if (!container || container.dataset.loading) return;
    container.dataset.loading = 'true';

    const lat = +container.dataset.wxLat;
    const lng = +container.dataset.wxLng;
    if (!lat || !lng) { container.innerHTML = ''; return; }

    try {
      const days = await fetchWeatherDaily(lat, lng);
      container.innerHTML = days.map((d, i) => {
        const { icon, label } = describeWeatherCode(d.code);
        const rain = d.rainProb != null && d.rainProb >= 30 ? ` · ${d.rainProb}% pluie` : '';
        return `
          <span class="wx-day" title="${esc(`${label}${rain}`)}">
            <span class="wx-dow">${esc(dayName(d.date, i))}</span>
            <span class="wx-ico">${icon}</span>
            <span class="wx-t">${d.tMax}°<span class="wx-tmin">/${d.tMin}°</span></span>
          </span>`;
      }).join('');
    } catch {
      container.innerHTML = ''; // hors ligne ou API indisponible : silencieux
    }
    e.popup._updatePosition?.();
  });
}
