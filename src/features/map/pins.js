import { saveUserPins, saveOverrides } from './storage.js';
import { generateUUID } from '../../shared/utils/storage.js';
import { addMarker, refreshMarker } from './map.js';
import { trapFocus } from './ui.js';
import { escapeHtml as esc, safeUrl } from '../../shared/utils/escape.js';
import { searchStations } from '../sources/stationsService.js';

function openInOSM(lat, lng, zoom = 14) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
}

// Squelette de chargement des replis (remplacé par le contenu fetché)
const SKELETON = `<div class="popup-skel" aria-hidden="true"><span></span><span></span><span></span></div>`;

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
    if (/^[🎯⏱📏⬆🏔💰🏠🛏🚻💧✅🔒❄🧭🚿]/u.test(line)) {
      const chips = line.split(/\s{2,}/).filter(Boolean);
      chipsHtml += `<div class="popup-chips">${chips.map(c => `<span class="popup-chip">${esc(c)}</span>`).join('')}</div>`;
    } else {
      textLines.push(line);
    }
  }

  let out = chipsHtml;
  if (textLines.length) {
    const joined = textLines.map(esc).join(' ');
    // Long texte : clampé à 4 lignes, tap pour déplier (délégation data-desc-toggle)
    out += joined.length > 220
      ? `<p class="popup-desc-text is-clamped" data-desc-toggle title="Afficher plus / moins">${joined}</p>`
      : `<p class="popup-desc-text">${joined}</p>`;
  }
  const vfHref = safeUrl(vfUrl);
  if (vfHref) out += `<a class="osm-link popup-vf-link" href="${vfHref}" target="_blank" rel="noopener">📋 Fiche complète — viaferrata-fr.net</a>`;
  return out;
}

export function popupHtml(place, categories, placeOverrides, isInRoute = false, isReadOnly = false) {
  const category    = categories[place.category] || categories.water;
  const isOverridden = !place.userCreated && !!placeOverrides[place.id];

  // Les pins d'une carte partagée sont créés par d'autres utilisateurs :
  // tout champ libre (nom, description, id…) doit être échappé.
  const id  = esc(place.id);
  const lat = esc(place.lat);
  const lng = esc(place.lng);

  const hasCoords     = !!(place.lat && place.lng);
  const isEnrichable  = (place.category === 'village' || place.category === 'base') && hasCoords;

  // Niveau « comprendre » : intérêt / conseil / ambiance regroupés en un repli
  const extras = [
    place.interest ? `<div class="popup-section"><p class="popup-section-label">Intérêt</p><p class="popup-section-body">${esc(place.interest)}</p></div>` : '',
    place.tip      ? `<div class="popup-section"><p class="popup-section-label">Conseil</p><p class="popup-section-body">${esc(place.tip)}</p></div>`      : '',
    place.mood     ? `<p class="popup-mood">${esc(place.mood)}</p>`                                                                                        : '',
  ].join('');

  return `
    <article class="popup" style="--color:${category.color}">
      <header class="popup-hd">
        <h2>${esc(place.name)}</h2>
        <div class="popup-category"><span>${category.icon}</span>${category.label}</div>
      </header>
      <div class="popup-body">
        ${hasCoords
          ? `<div class="wx-strip" data-wx-lat="${lat}" data-wx-lng="${lng}" aria-label="Météo 7 jours">${
              '<span class="wx-skel" aria-hidden="true"></span>'.repeat(7)
            }</div>`
          : ''}
        ${renderDescription(place.description)}
        ${extras
          ? `<details class="popup-fold">
              <summary>ℹ️ En savoir plus</summary>
              <div class="popup-fold-body">${extras}</div>
            </details>`
          : ''}
        ${isEnrichable
          ? `<details class="popup-fold wiki-enriched" data-wiki-lat="${lat}" data-wiki-lng="${lng}">
               <summary>📖 Wikivoyage</summary>
               <div class="popup-fold-body">${SKELETON}</div>
             </details>
             <details class="popup-fold dt-nearby" data-dt-lat="${lat}" data-dt-lng="${lng}">
               <summary>🏕 Aux alentours</summary>
               <div class="popup-fold-body">${SKELETON}</div>
             </details>`
          : ''}
        <details class="popup-fold popup-notes" ${place.notes ? 'open' : ''}>
          <summary>📝 Mes notes</summary>
          <div class="popup-fold-body">
            <textarea 
              class="popup-notes-textarea" 
              data-notes-pin-id="${id}"
              placeholder="Ajoutez vos notes personnelles ici..."
              ${isReadOnly ? 'readonly' : ''}
            >${esc(place.notes || '')}</textarea>
          </div>
        </details>
      </div>
      ${!isReadOnly
        ? `<button class="popup-add-route${isInRoute ? ' in-route' : ''}" data-add-route-id="${id}" type="button">
        ${isInRoute ? "✓ Dans l'itinéraire" : "➕ Ajouter à l'itinéraire"}
      </button>`
        : ''}
      <footer class="popup-foot">
        <a class="popup-foot-btn" href="${esc(openInOSM(place.lat, place.lng))}" target="_blank"
           rel="noopener" title="Voir sur OpenStreetMap" aria-label="Voir sur OpenStreetMap">🌍</a>
        <span class="popup-foot-spacer"></span>
        ${!isReadOnly
          ? `<button class="popup-foot-btn" data-edit-id="${id}" type="button" title="Modifier" aria-label="Modifier">✏️</button>
        ${place.userCreated
          ? `<button class="popup-foot-btn popup-foot-btn--danger" data-delete-id="${id}" type="button" title="Supprimer" aria-label="Supprimer">🗑️</button>`
          : isOverridden
            ? `<button class="popup-foot-btn" data-reset-id="${id}" type="button" title="Réinitialiser le lieu" aria-label="Réinitialiser">↺</button>`
            : ''}`
          : ''}
      </footer>
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
  onPinChange,
  config,
  // Supabase (optionnel — graceful degradation si non fourni)
  mapId,
  isReadOnly,
  createUserPinFn,
  upsertUserPinFn,
  deleteUserPinFn,
  upsertOverrideFn,
  deleteOverrideFn,
  // AbortSignal de démontage de la carte (navigation SPA)
  signal,
}) {
  let pinMode = false;
  // Qui a armé pinMode : 'relocate' (repositionner un pin existant depuis
  // la modale d'édition) ou 'quickAdd' (nouveau pin depuis le FAB, H6) —
  // détermine quel bandeau flottant s'affiche et ce que fait le clic carte.
  let pinModeSource = null;
  let pendingPinCoords = null;
  let editingPinId = null;
  let pendingEditPin = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const pinModeBtn       = document.getElementById('pinModeButton');
  const pinHintEl        = document.getElementById('pinHint');
  const quickAddEl       = document.getElementById('quickAdd');
  const quickAddInput    = document.getElementById('quickAddInput');
  const quickAddResultsEl = document.getElementById('quickAddResults');
  const pinModalBackdrop = document.getElementById('pinModalBackdrop');
  const pinNameInput     = document.getElementById('pinName');
  const pinCategorySelect = document.getElementById('pinCategory');
  const pinNoteInput     = document.getElementById('pinNote');
  const pinTrainFieldsEl       = document.getElementById('pinTrainFields');
  const pinTrainDepartureInput = document.getElementById('pinTrainDeparture');
  const pinTrainArrivalInput   = document.getElementById('pinTrainArrival');
  const pinTrainNumberInput    = document.getElementById('pinTrainNumber');
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
  // Ajout rapide (H6) : recherche indépendante de celle de la modale
  // (états et cycles de vie différents — pas de backdrop, pas de champs à
  // pré-remplir), mais même API et même rendu de résultats.
  let quickAddDebounce = null;
  let quickAddController = null;
  let quickAddCandidates = [];

  async function geocodeSearch(query, signal) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${config.geocodeLimit}&accept-language=fr`;
    const res = await fetch(url, { signal });
    return res.json();
  }

  // Catégorie « Gare » : dataset statique (trainline-eu/stations, cf.
  // README) plutôt que Nominatim — identifiants fiables (code UIC), pas
  // d'ambiguïté de nom. Résultats reformés à la forme Nominatim
  // (display_name/lat/lon) pour réutiliser le même rendu et le même clic.
  async function stationSearch(query, limit = config.geocodeLimit) {
    const stations = await searchStations(query, limit);
    return stations.map(s => ({ display_name: `${s.name}, Gare SNCF`, lat: s.lat, lon: s.lng, category: 'gare' }));
  }

  function locationSearch(query, signal) {
    return pinCategorySelect.value === 'gare' ? stationSearch(query) : geocodeSearch(query, signal);
  }

  // Ajout rapide (H6) : pas de sélecteur de catégorie (2 interactions, cf.
  // quickAddPin plus bas), donc on fusionne gares + adresses dans la même
  // recherche — une gare choisie porte directement category: 'gare',
  // sinon la catégorie par défaut s'applique comme avant. Un échec
  // Nominatim n'empêche pas d'afficher les gares (Promise.allSettled),
  // mais une annulation (AbortError, frappe rapide) remonte comme avant.
  async function quickAddSearch(query, signal) {
    const [stationsResult, addressesResult] = await Promise.allSettled([
      stationSearch(query, 3),
      geocodeSearch(query, signal),
    ]);
    if (addressesResult.status === 'rejected' && addressesResult.reason?.name === 'AbortError') {
      throw addressesResult.reason;
    }
    const stations  = stationsResult.status === 'fulfilled' ? stationsResult.value : [];
    const addresses = addressesResult.status === 'fulfilled' ? addressesResult.value : [];
    return [...stations, ...addresses];
  }

  function renderGeocodeResults(listEl, candidates) {
    if (!candidates.length) { listEl.hidden = true; return; }
    listEl.innerHTML = candidates.map((r, i) => {
      const parts = r.display_name.split(', ');
      return `<li class="geocode-result-item" data-idx="${i}">
        <span class="geocode-result-name">${esc(parts[0])}</span>
        <span class="geocode-result-detail">${esc(parts.slice(1, 4).join(', '))}</span>
      </li>`;
    }).join('');
    listEl.hidden = false;
  }

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

  function setPinMode(active, source = 'relocate') {
    pinMode = active;
    pinModeSource = active ? source : null;
    // Le FAB ne s'allume que pour son propre déclenchement (quickAdd) —
    // pas quand pinMode est armé depuis la modale d'édition (relocate).
    pinModeBtn.classList.toggle('active', active && source === 'quickAdd');
    pinHintEl.hidden  = !(active && source === 'relocate');
    quickAddEl.hidden = !(active && source === 'quickAdd');
    map.getContainer().style.cursor = active ? 'crosshair' : '';
    if (active && source === 'quickAdd') {
      quickAddInput.value = '';
      quickAddResultsEl.hidden = true;
      quickAddInput.focus();
    } else {
      clearTimeout(quickAddDebounce);
      quickAddController?.abort();
    }
  }

  // Ajout rapide (H6) : crée le pin immédiatement avec des valeurs par
  // défaut raisonnables, sans formulaire préalable — l'utilisateur ajuste
  // ensuite via ✏️ sur la fiche qui s'ouvre si le nom/la catégorie ne
  // conviennent pas. Objectif : poser un lieu en 2 interactions, < 15 s.
  // `category` : renseignée quand le résultat choisi vient de la
  // recherche de gares (quickAddSearch) ; sinon la catégorie par défaut.
  function quickAddPin(lat, lng, name, category) {
    saveUserPin(name?.trim() || 'Nouveau lieu', category || Object.keys(categories)[0], '', lat, lng);
  }

  function makePopupHtml(place) {
    return popupHtml(place, categories, placeOverridesRef, false, isReadOnly || false);
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
    if (pinTrainDepartureInput) pinTrainDepartureInput.value = isEdit ? (existingPin.trainDeparture || '') : '';
    if (pinTrainArrivalInput)   pinTrainArrivalInput.value   = isEdit ? (existingPin.trainArrival   || '') : '';
    if (pinTrainNumberInput)    pinTrainNumberInput.value    = isEdit ? (existingPin.trainNumber    || '') : '';
    updateTrainFieldsVisibility();

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

  function saveUserPin(name, category, note, lat, lng, trainSchedule = {}) {    if (isReadOnly) {
      showToastFn(toastWrap, '⚠️ Modification impossible en mode lecture seule', 'error');
      return;
    }    const pin = {
      id: generateUUID(),
      name, category, lat, lng,
      description: note,
      notes: '',
      interest: '', tip: '', mood: '',
      user_created: true,
      userCreated: true,
      ...(category === 'gare' ? trainSchedule : {}),
    };
    userPlacesRef.push(pin);
    saveUserPins(userPlacesRef);
    syncRemote(createUserPinFn ?? upsertUserPinFn, pin);
    addMarker(pin, markers, makePopupHtml, makeIconFn);
    if (activeCategories.has(category)) markerLayer.addLayer(markers.get(pin.id));
    onMarkerAdded?.(pin);
    onRefresh();
    onPinChange?.('create', pin);
    focusPlaceFn(pin);
    showToastFn(toastWrap, `Pin "${name}" créé`, 'success');
  }

  function updateUserPin(id, name, category, note, lat, lng, trainSchedule = {}) {
    if (isReadOnly) {
      showToastFn(toastWrap, '⚠️ Modification impossible en mode lecture seule', 'error');
      return;
    }
    const pin = userPlacesRef.find(p => p.id === id);
    if (!pin) return;
    pin.name = name; pin.category = category;
    pin.description = note; pin.lat = lat; pin.lng = lng;
    if (category === 'gare') Object.assign(pin, trainSchedule);
    saveUserPins(userPlacesRef);
    syncRemote(upsertUserPinFn, pin);
    doRefreshMarker(pin);
    map.closePopup(); onRefresh(); onPinChange?.('update', pin); focusPlaceFn(pin);
    showToastFn(toastWrap, `"${name}" mis à jour`, 'success');
  }

  function deleteUserPin(id) {
    if (isReadOnly) {
      showToastFn(toastWrap, '⚠️ Modification impossible en mode lecture seule', 'error');
      return;
    }
    const idx = userPlacesRef.findIndex(p => p.id === id);
    if (idx !== -1) userPlacesRef.splice(idx, 1);
    saveUserPins(userPlacesRef);
    syncRemote(deleteUserPinFn, id);
    const marker = markers.get(id);
    if (marker) { markerLayer.removeLayer(marker); markers.delete(id); }
    map.closePopup(); onRefresh(); onPinChange?.('delete', { id });
    showToastFn(toastWrap, 'Pin supprimé', '');
  }

  function updatePinNotes(id, notes) {
    if (isReadOnly) {
      showToastFn(toastWrap, '⚠️ Modification impossible en mode lecture seule', 'error');
      return;
    }
    const pin = userPlacesRef.find(p => p.id === id);
    if (!pin) return;
    pin.notes = notes;
    saveUserPins(userPlacesRef);
    syncRemote(upsertUserPinFn, pin);
    onPinChange?.('update', pin);
  }

  function saveOverride(id, name, category, note, lat, lng) {
    if (isReadOnly) {
      showToastFn(toastWrap, '⚠️ Modification impossible en mode lecture seule', 'error');
      return;
    }
    placeOverridesRef[id] = { name, category, description: note, lat, lng };
    saveOverrides(placeOverridesRef);
    syncRemote(upsertOverrideFn, id, placeOverridesRef[id]);
    const original = staticPlaces.find(p => p.id === id);
    const ep = original ? { ...original, ...placeOverridesRef[id] } : null;
    if (ep) { doRefreshMarker(ep); map.closePopup(); onRefresh(); focusPlaceFn(ep); }
    showToastFn(toastWrap, `"${name}" mis à jour`, 'success');
  }

  function resetOverride(id) {
    if (isReadOnly) {
      showToastFn(toastWrap, '⚠️ Modification impossible en mode lecture seule', 'error');
      return;
    }
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
        geocodeCandidates = await locationSearch(q, geocodeController.signal);
        renderGeocodeResults(geocodeResultsEl, geocodeCandidates);
      } catch (e) {
        if (e.name !== 'AbortError') showToastFn(toastWrap, 'Recherche indisponible', 'error', 3000);
      }
    }, config.geocodeDebounce);
  });

  // Changer de catégorie en cours de recherche doit relancer la recherche
  // dans la bonne source (ex. bascule vers « Gare » après avoir tapé une
  // requête sur Nominatim) plutôt que de laisser des résultats obsolètes.
  // Les champs horaire (I3b) n'ont de sens que pour une gare.
  pinCategorySelect.addEventListener('change', () => {
    pinGeocodeInput.dispatchEvent(new Event('input'));
    updateTrainFieldsVisibility();
  });

  function updateTrainFieldsVisibility() {
    if (pinTrainFieldsEl) pinTrainFieldsEl.hidden = pinCategorySelect.value !== 'gare';
  }

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

  // ── Ajout rapide (H6) : recherche flottante ouverte par le FAB ──────────
  quickAddInput.addEventListener('input', () => {
    clearTimeout(quickAddDebounce);
    const q = quickAddInput.value.trim();
    if (q.length < 3) { quickAddResultsEl.hidden = true; return; }
    quickAddDebounce = setTimeout(async () => {
      if (quickAddController) quickAddController.abort();
      quickAddController = new AbortController();
      try {
        quickAddCandidates = await quickAddSearch(q, quickAddController.signal);
        renderGeocodeResults(quickAddResultsEl, quickAddCandidates);
      } catch (e) {
        if (e.name !== 'AbortError') showToastFn(toastWrap, 'Recherche indisponible', 'error', 3000);
      }
    }, config.geocodeDebounce);
  });

  quickAddResultsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.geocode-result-item');
    if (!item) return;
    const r = quickAddCandidates[parseInt(item.dataset.idx)];
    if (!r) return;
    const parts = r.display_name.split(', ');
    setPinMode(false);
    quickAddPin(parseFloat(r.lat), parseFloat(r.lon), parts[0], r.category);
  });

  quickAddInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setPinMode(false);
  });

  document.getElementById('quickAddCancel').addEventListener('click', () => setPinMode(false));

  // ── Modal / mode listeners ────────────────────────────────────────────────
  pinModeBtn.addEventListener('click', () => {
    if (pinMode && pinModeSource === 'quickAdd') setPinMode(false);
    else setPinMode(true, 'quickAdd');
  });

  document.getElementById('pinHintCancel').addEventListener('click', () => setPinMode(false));

  document.getElementById('pinMapClickBtn').addEventListener('click', () => {
    pendingEditPin = editingPinId ? getAllPlaces().find(p => p.id === editingPinId) : null;
    closePinModal();
    setPinMode(true, 'relocate');
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
    const trainSchedule = {
      trainDeparture: pinTrainDepartureInput?.value.trim() ?? '',
      trainArrival:   pinTrainArrivalInput?.value.trim() ?? '',
      trainNumber:    pinTrainNumberInput?.value.trim() ?? '',
    };
    if (editingPinId) {
      const id = editingPinId;
      const isUserPin = userPlacesRef.some(p => p.id === id);
      closePinModal();
      if (isUserPin) updateUserPin(id, name, category, note, lat, lng, trainSchedule);
      else saveOverride(id, name, category, note, lat, lng);
    } else {
      closePinModal();
      saveUserPin(name, category, note, lat, lng, trainSchedule);
    }
  });

  pinNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('pinConfirmBtn').click();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pinModalBackdrop.hidden) closePinModal();
  }, { signal });

  // ── Popup action delegation ───────────────────────────────────────────────
  let notesDebounceTimer = null;
  
  document.addEventListener('input', (e) => {
    const notesTextarea = e.target.closest('[data-notes-pin-id]');
    if (notesTextarea) {
      clearTimeout(notesDebounceTimer);
      const pinId = notesTextarea.dataset.notesPinId;
      const notes = notesTextarea.value;
      notesDebounceTimer = setTimeout(() => {
        updatePinNotes(pinId, notes);
        showToastFn(toastWrap, '💾 Notes sauvegardées', 'success', 2000);
      }, 1000);
    }
  }, { signal });
  
  document.addEventListener('click', (e) => {
    // Description clampée : tap pour déplier / replier
    const desc = e.target.closest('[data-desc-toggle]');
    if (desc) { desc.classList.toggle('is-clamped'); return; }
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
  }, { signal });

  signal?.addEventListener('abort', () => {
    clearTimeout(geocodeDebounce);
    geocodeController?.abort();
    clearTimeout(quickAddDebounce);
    quickAddController?.abort();
    clearTimeout(notesDebounceTimer);
  }, { once: true });

  // ── Map click ─────────────────────────────────────────────────────────────
  map.on('click', (e) => {
    if (pinMode) {
      const source  = pinModeSource;
      const editPin = pendingEditPin;
      setPinMode(false);
      pendingEditPin = null;
      if (source === 'quickAdd') {
        // Nouveau pin depuis le FAB (H6) : créé directement, pas de
        // formulaire — renommage possible ensuite via ✏️ sur sa fiche.
        quickAddPin(e.latlng.lat, e.latlng.lng);
      } else {
        // Repositionnement d'un pin existant (bouton "cliquer sur la
        // carte" de la modale d'édition) : le formulaire reste nécessaire.
        openPinModal(e.latlng.lat, e.latlng.lng, editPin);
      }
      return;
    }
    if (onMapClick) onMapClick(e);
  });

  // ── Long press tactile pour ajouter un pin (mobile) ──────────────────────
  let longPressTimer = null;
  let longPressLatlng = null;
  let touchStartPos = null;

  map.getContainer().addEventListener('touchstart', (e) => {
    if (isReadOnly) return;
    if (e.touches.length !== 1) return; // Un seul doigt
    
    const touch = e.touches[0];
    touchStartPos = { x: touch.clientX, y: touch.clientY };
    
    // Convertir les coordonnées écran en coordonnées géographiques
    const point = map.containerPointToLatLng([touch.clientX, touch.clientY]);
    longPressLatlng = point;
    
    // Démarrer le timer de long press (500ms)
    longPressTimer = setTimeout(() => {
      if (longPressLatlng && !pinMode) {
        // Long press détecté ! Ouvrir le modal d'ajout de pin
        // Vibration tactile pour feedback (si supporté)
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
        quickAddPin(longPressLatlng.lat, longPressLatlng.lng);
        longPressTimer = null;
        longPressLatlng = null;
        touchStartPos = null;
      }
    }, 500);
  }, { passive: true, signal });

  map.getContainer().addEventListener('touchmove', (e) => {
    if (!longPressTimer) return;
    
    // Si l'utilisateur bouge son doigt (scroll), annuler le long press
    const touch = e.touches[0];
    const moved = Math.abs(touch.clientX - touchStartPos.x) > 10 
               || Math.abs(touch.clientY - touchStartPos.y) > 10;
    
    if (moved) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressLatlng = null;
      touchStartPos = null;
    }
  }, { passive: true, signal });

  map.getContainer().addEventListener('touchend', (_e) => {
    // Annuler le long press si l'utilisateur relâche avant 500ms
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressLatlng = null;
      touchStartPos = null;
    }
  }, { passive: true, signal });

  map.getContainer().addEventListener('touchcancel', (_e) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressLatlng = null;
      touchStartPos = null;
    }
  }, { passive: true, signal });

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
