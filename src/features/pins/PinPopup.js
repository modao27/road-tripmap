/**
 * @fileoverview Composant PinPopup — rendu HTML des popups de pins.
 * Responsabilité unique : produire du HTML à partir d'un Pin.
 * Ne gère ni événements ni état.
 *
 * @typedef {import('../../shared/types/index.js').Pin}         Pin
 * @typedef {import('../../shared/types/index.js').Categories}  Categories
 * @typedef {import('../../shared/types/index.js').PlaceOverrides} PlaceOverrides
 */

/**
 * Construit l'URL OpenStreetMap pour un lieu.
 * @param {number} lat
 * @param {number} lng
 * @param {number} [zoom=14]
 * @returns {string}
 */
function osmUrl(lat, lng, zoom = 14) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
}

/**
 * Rend le HTML d'une popup de pin utilisateur.
 *
 * @param {Pin}            pin
 * @param {Categories}     categories
 * @param {PlaceOverrides} overrides
 * @param {boolean}        [isInRoute=false]
 * @returns {string} HTML string
 */
export function renderPinPopup(pin, categories, overrides, isInRoute = false) {
  const category    = categories[pin.category] ?? categories.water;
  const isOverridden = !pin.userCreated && !!overrides[pin.id];

  const actions = `
    <div class="popup-user-actions">
      <button class="popup-edit"   data-edit-id="${pin.id}"   type="button">Modifier</button>
      ${pin.userCreated
        ? `<button class="popup-delete" data-delete-id="${pin.id}" type="button">Supprimer</button>`
        : isOverridden
          ? `<button class="popup-reset"  data-reset-id="${pin.id}"  type="button">Réinitialiser</button>`
          : ''}
    </div>`;

  return `
    <article class="popup" style="--color:${category.color}">
      <h2>${pin.name}</h2>
      <div class="popup-category"><span>${category.icon}</span>${category.label}</div>
      ${pin.description ? `<p>${pin.description}</p>` : ''}
      ${pin.interest    ? `<p><b>Intérêt :</b> ${pin.interest}</p>` : ''}
      ${pin.tip         ? `<p><b>Conseil :</b> ${pin.tip}</p>` : ''}
      ${pin.mood        ? `<p><b>Ambiance :</b> ${pin.mood}</p>` : ''}
      <a class="osm-link" href="${osmUrl(pin.lat, pin.lng)}"
         target="_blank" rel="noopener">Voir sur OpenStreetMap</a>
      <button class="popup-add-route${isInRoute ? ' in-route' : ''}"
              data-add-route-id="${pin.id}" type="button">
        ${isInRoute ? "✓ Dans l'itinéraire" : "➕ Ajouter à l'itinéraire"}
      </button>
      ${actions}
    </article>`;
}
