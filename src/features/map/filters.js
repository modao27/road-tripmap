import { escapeHtml as esc } from '../../shared/utils/escape.js';

export function renderFilters(filtersEl, categories, getAllPlaces, activeCategories) {
  filtersEl.innerHTML = Object.entries(categories).map(([key, category]) => {
    const count  = getAllPlaces().filter(p => p.category === key).length;
    const active = activeCategories.has(key);
    return `
      <label class="filter-pill${active ? ' active' : ''}"
             style="--color:${category.color}" title="${category.label}">
        <input type="checkbox" value="${key}" ${active ? 'checked' : ''}>
        <span class="filter-pill-icon">${category.icon}</span>
        <span class="filter-pill-count">${count}</span>
      </label>
    `;
  }).join('');
}

// Aperçu compact des catégories actives — seul contenu du filtre visible
// tiroir fermé (Phase H7), donc pas juste un doublon de renderFilters.
export function renderFilterChips(chipsEl, categories, activeCategories) {
  chipsEl.innerHTML = Object.entries(categories)
    .filter(([key]) => activeCategories.has(key))
    .map(([, category]) => `
      <span class="filter-chip" style="--color:${category.color}" title="${category.label}">${category.icon}</span>
    `).join('');
}

export function renderLegend(legendEl, categories) {
  legendEl.innerHTML = Object.values(categories).map(category => {
    return `
      <div class="legend-item">
        <span class="legend-dot" style="background:${category.color}"></span>
        ${category.label}
      </div>
    `;
  }).join('');
}

// L'index du match est calculé sur le texte brut, puis chaque tranche est
// échappée séparément (échapper avant fausserait les indices).
function highlight(text, query) {
  if (!query) return esc(text);
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return esc(text);
  return esc(text.slice(0, i))
    + `<mark class="search-highlight">${esc(text.slice(i, i + query.length))}</mark>`
    + esc(text.slice(i + query.length));
}

export function renderPlaces(visibleList, placeListEl, visibleCountEl, categories, searchQuery = '') {
  visibleCountEl.textContent = visibleList.length.toString();

  if (visibleList.length === 0) {
    placeListEl.innerHTML = `<li><div class="empty-state"><strong>Aucun lieu trouvé</strong>Modifie la recherche ou active d'autres filtres.</div></li>`;
  } else {
    placeListEl.innerHTML = visibleList.map((place) => {
      const category = categories[place.category] || categories.water;
      const cardClass = place.userCreated ? 'place-card user-pin' : 'place-card';
      return `
        <li class="place-item">
          <button class="${cardClass}" type="button" data-place-id="${esc(place.id)}" style="--color:${category.color}" draggable="true">
            <strong>${highlight(place.name, searchQuery)}</strong>
            <span class="place-meta"><span class="place-icon">${category.icon}</span>${category.label}</span>
          </button>
          <button class="place-route-add" type="button" data-add-route-id="${esc(place.id)}" title="Ajouter à l'itinéraire">＋</button>
        </li>
      `;
    }).join('');
  }
}

export function getVisiblePlaces(getAllPlaces, activeCategories, searchQuery, categoryRank) {
  const all = getAllPlaces().filter(place =>
    activeCategories.has(place.category) &&
    place.name.toLowerCase().includes(searchQuery)
  );
  return all.sort((a, b) => {
    const order = categoryRank.get(a.category) - categoryRank.get(b.category);
    if (order !== 0) return order;
    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
  });
}
