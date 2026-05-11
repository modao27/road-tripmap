export function renderFilters(filtersEl, categories, getAllPlaces, activeCategories) {
  filtersEl.innerHTML = Object.entries(categories).map(([key, category]) => {
    const count = getAllPlaces().filter(p => p.category === key).length;
    return `
      <label class="filter" style="--color:${category.color}">
        <input type="checkbox" value="${key}" ${activeCategories.has(key) ? 'checked' : ''}>
        <span class="dot"></span>
        <span class="filter-name">${category.label}</span>
        <span class="count">${count}</span>
      </label>
    `;
  }).join('');
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

export function renderPlaces(visibleList, placeListEl, visibleCountEl, categories) {
  visibleCountEl.textContent = visibleList.length.toString();

  if (visibleList.length === 0) {
    placeListEl.innerHTML = `<li><div class="empty-state"><strong>Aucun lieu trouvé</strong>Modifie la recherche ou active d'autres filtres.</div></li>`;
  } else {
    placeListEl.innerHTML = visibleList.map((place) => {
      const category = categories[place.category] || categories.water;
      const cardClass = place.userCreated ? 'place-card user-pin' : 'place-card';
      return `
        <li class="place-item">
          <button class="${cardClass}" type="button" data-place-id="${place.id}" style="--color:${category.color}">
            <strong>${place.name}</strong>
            <span class="place-meta"><span class="place-icon">${category.icon}</span>${category.label}</span>
          </button>
          <button class="place-route-add" type="button" data-add-route-id="${place.id}" title="Ajouter à l'itinéraire">＋</button>
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
