import { saveUserPins, saveOverrides } from './storage.js';
import { addMarker, refreshMarker } from './map.js';
import { trapFocus } from './ui.js';

function openInOSM(lat, lng, zoom = 14) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
}

// Rendu de la description : chips emojis, URL fiche, texte libre
function renderDescription(desc) {
  if (!desc) return '';
  const lines = desc.split('\n').map(l => l.trim()).filter(Boolean);
  let chipsHtml = '';
  let vfUrl = null;
  const textLines = [];

  for (const line of lines) {
    // URL fiche viaferrata-fr.net : 🔗 https://...
    const urlMatch = line.match(/^🔗\s*(https?:\/\/\S+)$/);
    if (urlMatch) { vfUrl = urlMatch[1]; continue; }

    // Ligne de stats emoji (via ferrata enrichie) — séparées par double espace
    if (/^[🎯⏱📏⬆🏔💰🏠🛏🚻💧✅🔒❄🧭🚿]/.test(line)) {
      const chips = line.split(/\s{2,}/).filter(Boolean);
      chipsHtml += `<div class="popup-chips">${chips.map(c => `<span class="popup-chip">${c}</span>`).join('')}</div>`;
    } else {
      textLines.push(line);
    }
  }

  let out = chipsHtml;
  if (textLines.length) out += `<p class="popup-desc-text">${textLines.join(' ')}</p>`;
  if (vfUrl) out += `<a class="osm-link popup-vf-link" href="${vfUrl}" target="_blank" rel="noopener">📋 Fiche complète — viaferrata-fr.net</a>`;
  return out;
}

export function popupHtml(place, categories, placeOverrides, isInRoute = false) {
  const category    = categories[place.category] || categories.water;
  const isOverridden = !place.userCreated && !!placeOverrides[place.id];

  const actions = `<div class="popup-user-actions">
      <button class="popup-edit"   data-edit-id="${place.id}"   type="button">Modifier</button>
      ${place.userCreated
        ? `<button class="popup-delete" data-delete-id="${place.id}" type="button">Supprimer</button>`
        : isOverridden
          ? `<button class="popup-reset"  data-reset-id="${place.id}"  type="button">Réinitialiser</button>`
          : ''}
    </div>`;

  return `
    <article class="popup" style="--color:${category.color}">
      <h2>${place.name}</h2>
      <div class="popup-category"><span>${category.icon}</span>${category.label}</div>
      ${renderDescription(place.description)}
      ${(place.category === 'village' || place.category === 'base') && place.lat && place.lng
        ? `<div class="wiki-enriched" data-wiki-lat="${place.lat}" data-wiki-lng="${place.lng}"><p class="wiki-loading">⟳ Wikivoyage…</p></div>`
        : ''}
      ${place.interest ? `<div class="popup-section"><p class="popup-section-label">Intérêt</p><p class="popup-section-body">${place.interest}</p></div>` : ''}
      ${place.tip      ? `<div class="popup-section"><p class="popup-section-label">Conseil</p><p class="popup-section-body">${place.tip}</p></div>`      : ''}
      ${place.mood     ? `<p class="popup-mood">${place.mood}</p>`                                                                                          : ''}
      ${(place.category === 'village' || place.category === 'base') && place.lat && place.lng
        ? `<div class="dt-nearby" data-dt-lat="${place.lat}" data-dt-lng="${place.lng}"><p class="dt-loading">⟳ Infos touristiques…</p></div>`
        : ''}
      <a class="osm-link" href="${openInOSM(place.lat, place.lng)}" target="_blank" rel="noopener">Voir sur OpenStreetMap</a>
      <button class="popup-add-route${isInRoute ? ' in-route' : ''}" data-add-route-id="${place.id}" type="button">
        ${isInRoute ? "✓ Dans l'itinéraire" : "➕ Ajouter à l'itinéraire"}
      </button>
      ${actions}
    </article>
  `;
}

export function initPins({
  map,
  markerLayer,
  markers,
  categories,
  getAllPlaces,
  staticPlaces,
  userPlacesRef,
  placeOverridesRef,
  activeCategories,
  makeIconFn,
  toastWrap,
  showToastFn,
  setSyncStatusFn,
  onRefresh,
  focusPlaceFn,
  onMapClick,
  onMarkerAdded,
  config,
  // Supabase (optionnel — graceful degradation si non fourni)
  mapId,
  createUserPinFn,
  upsertUserPinFn,
  deleteUserPinFn,
  upsertOverrideFn,
  deleteOverrideFn,
}) {
  let pinMode = false;
  let pendingPinCoords = null;
  let editingPinId = null;
  let pendingEditPin = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const pinModeBtn       = document.getElementById('pinModeButton');
  const pinHintEl        = document.getElementById('pinHint');
  const pinModalBackdrop = document.getElementById('pinModalBackdrop');
  const pinNameInput     = document.getElementById('pinName');
  const pinCategorySelect = document.getElementById('pinCategory');
  const pinNoteInput     = document.getElementById('pinNote');
  const pinGeocodeInput  = document.getElementById('pinGeocode');
  const geocodeResultsEl = document.getElementById('geocodeResults');
  const pinLocationTag   = document.getElementById('pinLocationTag');
  const pinLocationLabel = document.getElementById('pinLocationLabel');

  // Populate category select
  pinCategorySelect.innerHTML = Object.entries(categories)
    .map(([key, cat]) => `<option value="${key}">${cat.icon} ${cat.label}</option>`)
    .join('');

  // ── Supabase sync helper ──────────────────────────────────────────────────
  async function syncRemote(fn, ...args) {
    if (!fn) return;
    setSyncStatusFn('saving');
    try {
      await fn(mapId, ...args);
      setSyncStatusFn('saved');
    } catch {
      setSyncStatusFn('error');
    }
  }

  // ── Focus trap ────────────────────────────────────────────────────────────
  let releaseFocusTrap = null;

  // ── Geocoding state ───────────────────────────────────────────────────────
  let geocodeDebounce = null;
  let geocodeController = null;
  let geocodeCandidates = [];

  function resetGeocodeUI() {
    pinGeocodeInput.value = '';
    pinGeocodeInput.hidden = false;
    geocodeResultsEl.hidden = true;
    pinLocationTag.hidden = true;
    geocodeCandidates = [];
  }

  function confirmLocation(label, lat, lng) {
    pendingPinCoords = { lat, lng };
    pinLocationLabel.textContent = label;
    pinLocationTag.hidden = false;
    pinGeocodeInput.value = '';
    pinGeocodeInput.hidden = true;
    geocodeResultsEl.hidden = true;
    if (!pinNameInput.value.trim()) {
      pinNameInput.value = label.split(',')[0].trim();
    }
    map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { animate: true, duration: 0.7 });
    pinNameInput.focus();
  }

  function setPinMode(active) {
    pinMode = active;
    pinModeBtn.classList.toggle('active', active);
    pinHintEl.hidden = !active;
    map.getContainer().style.cursor = active ? 'crosshair' : '';
  }

  function makePopupHtml(place) {
    return popupHtml(place, categories, placeOverridesRef);
  }

  function openPinModal(lat, lng, existingPin) {
    editingPinId = existingPin ? existingPin.id : null;
    resetGeocodeUI();

    const isEdit = !!existingPin;
    document.getElementById('pinModalTitle').textContent = isEdit ? 'Modifier le pin' : 'Nouveau pin';
    document.getElementById('pinConfirmBtn').textContent = isEdit ? 'Enregistrer' : 'Créer le pin';

    pinNameInput.value   = isEdit ? existingPin.name : '';
    pinNoteInput.value   = isEdit ? (existingPin.description || '') : '';
    if (isEdit) pinCategorySelect.value = existingPin.category;
    else pinCategorySelect.selectedIndex = 0;

    const coordLat = lat ?? (existingPin ? existingPin.lat : null);
    const coordLng = lng ?? (existingPin ? existingPin.lng : null);
    if (coordLat != null && coordLng != null) {
      const label = isEdit && lat == null
        ? `📍 ${coordLat.toFixed(4)}, ${coordLng.toFixed(4)}`
        : `📍 Position sur la carte (${coordLat.toFixed(4)}, ${coordLng.toFixed(4)})`;
      confirmLocation(label, coordLat, coordLng);
      pinGeocodeInput.hidden = false;
      pinGeocodeInput.placeholder = 'Ou rechercher pour changer la position…';
    } else {
      pendingPinCoords = null;
      pinGeocodeInput.placeholder = 'Rechercher une ville, un lieu, une adresse…';
    }
    pinModalBackdrop.hidden = false;
    pinGeocodeInput.focus();
    releaseFocusTrap = trapFocus(pinModalBackdrop);
  }

  function closePinModal() {
    pinModalBackdrop.hidden = true;
    releaseFocusTrap?.(); releaseFocusTrap = null;
    pendingPinCoords = null;
    editingPinId = null;
    clearTimeout(geocodeDebounce);
    if (geocodeController) { geocodeController.abort(); geocodeController = null; }
    resetGeocodeUI();
  }

  function doRefreshMarker(place) {
    refreshMarker(place, markers, markerLayer, makePopupHtml, makeIconFn, activeCategories);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  function saveUserPin(name, category, note, lat, lng) {
    const pin = {
      id: crypto.randomUUID(),
      name, category, lat, lng,
      description: note,
      interest: '', tip: '', mood: '',
      user_created: true,
      userCreated: true,
    };
    userPlacesRef.push(pin);
    saveUserPins(userPlacesRef);
    syncRemote(createUserPinFn ?? upsertUserPinFn, pin);
    addMarker(pin, markers, makePopupHtml, makeIconFn);
    if (activeCategories.has(category)) markerLayer.addLayer(markers.get(pin.id));
    onMarkerAdded?.(pin);
    onRefresh();
    focusPlaceFn(pin);
    showToastFn(toastWrap, `Pin "${name}" créé`, 'success');
  }

  function updateUserPin(id, name, category, note, lat, lng) {
    const pin = userPlacesRef.find(p => p.id === id);
    if (!pin) return;
    pin.name = name; pin.category = category;
    pin.description = note; pin.lat = lat; pin.lng = lng;
    saveUserPins(userPlacesRef);
    syncRemote(upsertUserPinFn, pin);
    doRefreshMarker(pin);
    map.closePopup(); onRefresh(); focusPlaceFn(pin);
    showToastFn(toastWrap, `"${name}" mis à jour`, 'success');
  }

  function deleteUserPin(id) {
    const idx = userPlacesRef.findIndex(p => p.id === id);
    if (idx !== -1) userPlacesRef.splice(idx, 1);
    saveUserPins(userPlacesRef);
    syncRemote(deleteUserPinFn, id);
    const marker = markers.get(id);
    if (marker) { markerLayer.removeLayer(marker); markers.delete(id); }
    map.closePopup(); onRefresh();
    showToastFn(toastWrap, 'Pin supprimé', '');
  }

  function saveOverride(id, name, category, note, lat, lng) {
    placeOverridesRef[id] = { name, category, description: note, lat, lng };
    saveOverrides(placeOverridesRef);
    syncRemote(upsertOverrideFn, id, placeOverridesRef[id]);
    const original = staticPlaces.find(p => p.id === id);
    const ep = original ? { ...original, ...placeOverridesRef[id] } : null;
    if (ep) { doRefreshMarker(ep); map.closePopup(); onRefresh(); focusPlaceFn(ep); }
    showToastFn(toastWrap, `"${name}" mis à jour`, 'success');
  }

  function resetOverride(id) {
    delete placeOverridesRef[id];
    saveOverrides(placeOverridesRef);
    syncRemote(deleteOverrideFn, id);
    const original = staticPlaces.find(p => p.id === id);
    if (!original) return;
    doRefreshMarker(original);
    map.closePopup(); onRefresh();
    showToastFn(toastWrap, 'Lieu réinitialisé', '');
  }

  // ── Geocoding listeners ───────────────────────────────────────────────────
  pinGeocodeInput.addEventListener('input', () => {
    clearTimeout(geocodeDebounce);
    const q = pinGeocodeInput.value.trim();
    if (q.length < 3) { geocodeResultsEl.hidden = true; return; }
    geocodeDebounce = setTimeout(async () => {
      if (geocodeController) geocodeController.abort();
      geocodeController = new AbortController();
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=${config.geocodeLimit}&accept-language=fr`;
        const res = await fetch(url, { signal: geocodeController.signal });
        geocodeCandidates = await res.json();
        if (!geocodeCandidates.length) { geocodeResultsEl.hidden = true; return; }
        geocodeResultsEl.innerHTML = geocodeCandidates.map((r, i) => {
          const parts = r.display_name.split(', ');
          return `<li class="geocode-result-item" data-idx="${i}">
            <span class="geocode-result-name">${parts[0]}</span>
            <span class="geocode-result-detail">${parts.slice(1, 4).join(', ')}</span>
          </li>`;
        }).join('');
        geocodeResultsEl.hidden = false;
      } catch (e) {
        if (e.name !== 'AbortError') showToastFn(toastWrap, 'Recherche indisponible', 'error', 3000);
      }
    }, config.geocodeDebounce);
  });

  geocodeResultsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.geocode-result-item');
    if (!item) return;
    const r = geocodeCandidates[parseInt(item.dataset.idx)];
    if (!r) return;
    const parts = r.display_name.split(', ');
    confirmLocation(parts.slice(0, 3).join(', '), parseFloat(r.lat), parseFloat(r.lon));
  });

  pinGeocodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') geocodeResultsEl.hidden = true;
  });

  // ── Modal / mode listeners ────────────────────────────────────────────────
  pinModeBtn.addEventListener('click', () => openPinModal());

  document.getElementById('pinHintCancel').addEventListener('click', () => setPinMode(false));

  document.getElementById('pinMapClickBtn').addEventListener('click', () => {
    pendingEditPin = editingPinId ? getAllPlaces().find(p => p.id === editingPinId) : null;
    closePinModal();
    setPinMode(true);
  });

  document.getElementById('pinLocationClear').addEventListener('click', () => {
    pendingPinCoords = null;
    pinLocationTag.hidden = true;
    pinGeocodeInput.hidden = false;
    pinGeocodeInput.placeholder = 'Rechercher une ville, un lieu, une adresse…';
    pinGeocodeInput.focus();
  });

  document.getElementById('pinCancelBtn').addEventListener('click', closePinModal);

  pinModalBackdrop.addEventListener('click', (e) => {
    if (e.target === pinModalBackdrop) closePinModal();
  });

  document.getElementById('pinConfirmBtn').addEventListener('click', () => {
    const name = pinNameInput.value.trim();
    if (!name) { pinNameInput.focus(); return; }
    if (!pendingPinCoords) {
      showToastFn(toastWrap, 'Sélectionne un lieu ou clique sur la carte', 'error', 3000);
      pinGeocodeInput.focus();
      return;
    }
    const { lat, lng } = pendingPinCoords;
    const category = pinCategorySelect.value;
    const note = pinNoteInput.value.trim();
    if (editingPinId) {
      const id = editingPinId;
      const isUserPin = userPlacesRef.some(p => p.id === id);
      closePinModal();
      if (isUserPin) updateUserPin(id, name, category, note, lat, lng);
      else saveOverride(id, name, category, note, lat, lng);
    } else {
      closePinModal();
      saveUserPin(name, category, note, lat, lng);
    }
  });

  pinNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('pinConfirmBtn').click();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pinModalBackdrop.hidden) closePinModal();
  });

  // ── Popup action delegation ───────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-id]');
    if (editBtn) {
      const place = getAllPlaces().find(p => p.id === editBtn.dataset.editId);
      if (place) { map.closePopup(); openPinModal(null, null, place); }
      return;
    }
    const delBtn = e.target.closest('[data-delete-id]');
    if (delBtn) { deleteUserPin(delBtn.dataset.deleteId); return; }
    const resetBtn = e.target.closest('[data-reset-id]');
    if (resetBtn) resetOverride(resetBtn.dataset.resetId);
  });

  // ── Map click ─────────────────────────────────────────────────────────────
  map.on('click', (e) => {
    if (pinMode) {
      setPinMode(false);
      const editPin = pendingEditPin;
      pendingEditPin = null;
      openPinModal(e.latlng.lat, e.latlng.lng, editPin);
      return;
    }
    if (onMapClick) onMapClick(e);
  });

  // ── Pré-remplissage depuis un résultat Overpass ──────────────────────────
  function openForOverpass({ name, lat, lng, appCategory, description }) {
    editingPinId = null;
    resetGeocodeUI();

    document.getElementById('pinModalTitle').textContent = 'Ajouter à ma carte';
    document.getElementById('pinConfirmBtn').textContent = 'Ajouter';

    pinNameInput.value      = name || '';
    pinNoteInput.value      = description || '';
    pinCategorySelect.value = appCategory || Object.keys(categories)[0];

    // Coordonnées pré-remplies sans flyTo (le résultat est déjà visible)
    pendingPinCoords = { lat: +lat, lng: +lng };
    pinLocationLabel.textContent = name || `📍 ${(+lat).toFixed(4)}, ${(+lng).toFixed(4)}`;
    pinLocationTag.hidden = false;
    pinGeocodeInput.value = '';
    pinGeocodeInput.hidden = false;
    pinGeocodeInput.placeholder = 'Ou rechercher pour changer la position…';

    pinModalBackdrop.hidden = false;
    pinNameInput.focus();
    releaseFocusTrap = trapFocus(pinModalBackdrop);
  }

  return { isPinMode: () => pinMode, openForOverpass };
}
