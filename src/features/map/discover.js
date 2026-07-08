// Onglet Découvrir — switch de source OSM (Overpass) / Tourisme officiel
// (DATAtourisme) et routage des boutons Chercher / Effacer vers le bon module.
import { DT_CATEGORIES } from './datatourisme.js';

/**
 * @param {{
 *   overpassModule: { doSearch: () => void, clearResults: () => void,
 *                     getCircleState: () => { lat: number, lng: number, radiusKm: number } },
 *   dtModule:       { search: (lat, lng, radiusKm, cats: Set<string>) => void,
 *                     clear: () => void },
 * }} params
 */
export function initDiscoverSourceSwitch({ overpassModule, dtModule }) {
  let discoverMode        = 'osm';
  const sourceOsmBtn      = document.getElementById('sourceOsm');
  const sourceTourismeBtn = document.getElementById('sourceTourisme');
  const osmCatsEl         = document.getElementById('osmCats');
  const tourismeCatsEl    = document.getElementById('tourismeCats');
  const dtCatBtns         = document.querySelectorAll('[data-dt-cat]');
  const selectedDtCats    = new Set(Object.keys(DT_CATEGORIES));

  dtCatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.dtCat;
      if (selectedDtCats.has(cat)) {
        if (selectedDtCats.size > 1) { selectedDtCats.delete(cat); btn.classList.remove('active'); }
      } else {
        selectedDtCats.add(cat); btn.classList.add('active');
      }
    });
  });

  function setDiscoverMode(mode) {
    discoverMode = mode;
    sourceOsmBtn?.classList.toggle('active', mode === 'osm');
    sourceTourismeBtn?.classList.toggle('active', mode === 'tourisme');
    if (osmCatsEl)      osmCatsEl.hidden      = mode !== 'osm';
    if (tourismeCatsEl) tourismeCatsEl.hidden = mode !== 'tourisme';
    if (mode === 'osm') dtModule.clear();
    else overpassModule.clearResults();
  }

  sourceOsmBtn?.addEventListener('click',      () => setDiscoverMode('osm'));
  sourceTourismeBtn?.addEventListener('click', () => setDiscoverMode('tourisme'));

  document.getElementById('overpassSearch')?.addEventListener('click', () => {
    if (discoverMode === 'osm') {
      overpassModule.doSearch();
    } else {
      const { lat, lng, radiusKm } = overpassModule.getCircleState();
      dtModule.search(lat, lng, radiusKm, selectedDtCats);
    }
  });

  document.getElementById('overpassClear')?.addEventListener('click', () => {
    overpassModule.clearResults();
    dtModule.clear();
  });
}
