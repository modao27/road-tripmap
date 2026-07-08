// Overlay d'onboarding : première ouverture d'un roadtrip vide
// (?onboard=true). Recherche Nominatim de la destination, création du
// point de départ et centrage du roadtrip.
import { escapeHtml as esc } from '../src/shared/utils/escape.js';
import { createRoadtripPin } from '../src/features/pins/pinService.js';
import { updateRoadtripCenter } from '../src/features/roadtrips/roadtripService.js';

/**
 * @param {{
 *   map:            L.Map,
 *   roadtripId:     string|null,   - UUID du roadtrip (null hors mode roadtrip)
 *   roadtripInfo:   Object|null,   - infos du roadtrip (centre par défaut du skip)
 *   hasPins:        boolean,       - l'overlay ne s'affiche que si le roadtrip est vide
 *   onPlaceCreated: (place: Object) => void, - bookkeeping côté carte (état, marker, rendu)
 * }} params
 */
export function initOnboarding({ map, roadtripId, roadtripInfo, hasPins, onPlaceCreated }) {
  const onboardParam = new URLSearchParams(window.location.search).get('onboard');
  if (!roadtripId || onboardParam !== 'true' || hasPins) return;

  const overlay    = document.getElementById('onboardOverlay');
  const onboardIn  = document.getElementById('onboardSearch');
  const onboardRes = document.getElementById('onboardResults');
  const skipBtn    = document.getElementById('onboardSkip');

  overlay.hidden = false;

  let obDebounce = null;
  let obCtrl = null;
  let obCandidates = [];

  function closeOnboard() {
    overlay.hidden = true;
    const p = new URLSearchParams(window.location.search);
    p.delete('onboard');
    // Préserve le hash — en contexte SPA la route y vit (#/roadtrips/:id)
    history.replaceState(null, '',
      window.location.pathname + (p.toString() ? '?' + p : '') + window.location.hash);
  }

  async function confirmOnboardPlace(r) {
    const lat   = parseFloat(r.lat);
    const lng   = parseFloat(r.lon);
    const label = r.display_name.split(', ').slice(0, 3).join(', ');

    closeOnboard();
    map.flyTo([lat, lng], 12, { animate: true, duration: 1.2 });

    try {
      const created = await createRoadtripPin(roadtripId, {
        name: r.display_name.split(', ')[0],
        lat, lng, category: 'base', type: 'start', order_index: 0,
      });
      if (created) {
        onPlaceCreated({
          id: created.id, name: created.title,
          category: created.category || 'nature',
          lat, lng, description: '',
          interest: '', tip: '', mood: '',
          userCreated: true, user_created: true,
        });
      }
    } catch { /* pin optionnel, pas bloquant */ }

    try { await updateRoadtripCenter(roadtripId, { lat, lng, zoom: 12, label }); }
    catch { /* pas bloquant */ }
  }

  onboardIn.addEventListener('input', () => {
    clearTimeout(obDebounce);
    const q = onboardIn.value.trim();
    if (q.length < 3) { onboardRes.hidden = true; return; }
    obDebounce = setTimeout(async () => {
      if (obCtrl) obCtrl.abort();
      obCtrl = new AbortController();
      try {
        const url = `https://nominatim.openstreetmap.org/search` +
          `?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=fr`;
        const res = await fetch(url, { signal: obCtrl.signal });
        obCandidates = await res.json();
        if (!obCandidates.length) { onboardRes.hidden = true; return; }
        onboardRes.innerHTML = obCandidates.map((_, i) => {
          const parts = obCandidates[i].display_name.split(', ');
          return `<li class="geocode-result-item">
            <span class="geocode-result-name">${esc(parts[0])}</span>
            <span class="geocode-result-detail">${esc(parts.slice(1, 4).join(', '))}</span>
          </li>`;
        }).join('');
        // Handlers directs sur chaque <li> (mousedown = avant blur)
        onboardRes.querySelectorAll('.geocode-result-item').forEach((li, i) => {
          li.addEventListener('mousedown', () => confirmOnboardPlace(obCandidates[i]));
        });
        onboardRes.hidden = false;
      } catch (e) {
        if (e.name !== 'AbortError') onboardRes.hidden = true;
      }
    }, 350);
  });

  skipBtn.addEventListener('click', () => {
    closeOnboard();
    if (roadtripInfo?.center_lat) {
      map.flyTo([roadtripInfo.center_lat, roadtripInfo.center_lng],
                roadtripInfo.default_zoom ?? 10);
    }
  });

  setTimeout(() => onboardIn.focus(), 150);
}
