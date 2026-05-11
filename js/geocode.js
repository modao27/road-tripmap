export function initGeocoder({ geocodeInput, resultsEl, locationTag, locationLabel, nameInput, map, onConfirm, config }) {
  let debounceTimer = null;
  let controller = null;
  let candidates = [];

  function confirmLocation(label, lat, lng) {
    onConfirm(label, lat, lng);
    geocodeInput.value = '';
    geocodeInput.hidden = true;
    resultsEl.hidden = true;
    candidates = [];
  }

  function resetUI() {
    geocodeInput.value = '';
    geocodeInput.hidden = false;
    resultsEl.hidden = true;
    locationTag.hidden = true;
    candidates = [];
  }

  geocodeInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = geocodeInput.value.trim();
    if (q.length < 3) { resultsEl.hidden = true; return; }

    debounceTimer = setTimeout(async () => {
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=${config.geocodeLimit}&accept-language=fr`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'Accept-Language': 'fr' }
        });
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
        if (e.name !== 'AbortError') {
          // Show error via a toast if available – caller must handle via onConfirm or error callback
          console.warn('Geocoding error:', e);
        }
      }
    }, config.geocodeDebounce);
  });

  resultsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.geocode-result-item');
    if (!item) return;
    const r = candidates[parseInt(item.dataset.idx)];
    if (!r) return;
    const parts = r.display_name.split(', ');
    confirmLocation(parts.slice(0, 3).join(', '), parseFloat(r.lat), parseFloat(r.lon));
    map.flyTo([parseFloat(r.lat), parseFloat(r.lon)], Math.max(map.getZoom(), 13), { animate: true, duration: 0.7 });
  });

  geocodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { resultsEl.hidden = true; }
  });

  return {
    resetUI,
    getCandidates: () => candidates,
    abort: () => {
      clearTimeout(debounceTimer);
      if (controller) { controller.abort(); controller = null; }
    }
  };
}
