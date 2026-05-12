/**
 * onboarding.js
 * Étape 1 : recherche du lieu de départ → crée un pin "base" + ouvre la modale Overpass
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export function initOnboarding({ map, pinsModule, config }) {
  const backdrop     = document.getElementById('onboardBackdrop');
  const step1        = document.getElementById('onboardStep1');
  const geocodeInput = document.getElementById('onboardGeocode');
  const resultsEl    = document.getElementById('onboardResults');

  if (!backdrop || !step1) return;

  let debounceTimer = null;
  let controller    = null;
  let candidates    = [];

  // ── Geocoding ──────────────────────────────────────────────────────────────
  geocodeInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = geocodeInput.value.trim();
    if (q.length < 3) { resultsEl.hidden = true; return; }

    debounceTimer = setTimeout(async () => {
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=fr`;
        const res  = await fetch(url, { signal: controller.signal });
        candidates = await res.json();
        if (!candidates.length) { resultsEl.hidden = true; return; }
        resultsEl.innerHTML = candidates.map((r, i) => {
          const parts = r.display_name.split(', ');
          return `<li class="geocode-result-item" data-idx="${i}">
            <span class="geocode-result-name">${parts[0]}</span>
            <span class="geocode-result-detail">${parts.slice(1, 4).join(', ')}</span>
          </li>`;
        }).join('');
        resultsEl.hidden = false;
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('[onboarding]', e);
      }
    }, config?.geocodeDebounce ?? 350);
  });

  resultsEl?.addEventListener('click', e => {
    const item = e.target.closest('.geocode-result-item');
    if (!item) return;
    const r = candidates[+item.dataset.idx];
    if (!r) return;
    const name = r.display_name.split(', ').slice(0, 2).join(', ');
    confirmLocation(parseFloat(r.lat), parseFloat(r.lon), name);
  });

  geocodeInput?.addEventListener('keydown', e => {
    if (e.key === 'Escape') resultsEl.hidden = true;
  });

  // ── Confirmation du lieu de départ ────────────────────────────────────────
  function confirmLocation(lat, lng, name) {
    resultsEl.hidden = true;

    pinsModule?.createPin({ name, category: 'base', lat, lng, description: 'Point de départ du road trip.' });
    map.flyTo([lat, lng], 12, { animate: true, duration: 1.2 });

    close();

    // Ouvre la modale de découverte POI après l'animation
    setTimeout(() => {
      document.getElementById('overpassBackdrop').hidden = false;
    }, 500);
  }

  // ── Fermeture ─────────────────────────────────────────────────────────────
  function close() {
    backdrop.hidden = true;
    const url = new URL(window.location.href);
    url.searchParams.delete('onboard');
    history.replaceState(null, '', url.toString());
  }

  // ── Listeners ────────────────────────────────────────────────────────────
  document.getElementById('onboardSkip1')?.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !backdrop.hidden) close(); });

  // ── Affichage initial ─────────────────────────────────────────────────────
  backdrop.hidden = false;
  setTimeout(() => geocodeInput?.focus(), 150);
}
