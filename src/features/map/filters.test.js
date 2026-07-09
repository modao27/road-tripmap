// @vitest-environment happy-dom
// Rendu de la sidebar : filtres, légende, liste des lieux (+ highlight).
import { describe, it, expect, beforeEach } from 'vitest';
import { renderFilters, renderLegend, renderPlaces, getVisiblePlaces } from './filters.js';

const categories = {
  base:  { color: '#d56b1d', icon: '★', label: "Point d'ancrage" },
  water: { color: '#2477a6', icon: '💧', label: 'Cascade / lac' },
};
const categoryRank = new Map([['base', 0], ['water', 1]]);

const places = [
  { id: 'lac-vouglans',  name: 'Lac de Vouglans',      category: 'water' },
  { id: 'baume',         name: 'Baume-les-Messieurs',  category: 'base'  },
  { id: 'cascade-tufs',  name: 'Cascade des Tufs',     category: 'water', userCreated: true },
];
const getAllPlaces = () => places;

beforeEach(() => { document.body.innerHTML = ''; });

describe('getVisiblePlaces', () => {
  it('trie par rang de catégorie puis par nom (fr)', () => {
    const visible = getVisiblePlaces(getAllPlaces, new Set(['base', 'water']), '', categoryRank);
    expect(visible.map(p => p.id)).toEqual(['baume', 'cascade-tufs', 'lac-vouglans']);
  });

  it('filtre par catégories actives', () => {
    const visible = getVisiblePlaces(getAllPlaces, new Set(['water']), '', categoryRank);
    expect(visible.map(p => p.id)).toEqual(['cascade-tufs', 'lac-vouglans']);
  });

  it('filtre par recherche insensible à la casse du nom', () => {
    const visible = getVisiblePlaces(getAllPlaces, new Set(['base', 'water']), 'lac', categoryRank);
    expect(visible.map(p => p.id)).toEqual(['lac-vouglans']);
  });
});

describe('renderFilters', () => {
  it('rend une pill par catégorie avec compteur et état actif', () => {
    const el = document.createElement('div');
    renderFilters(el, categories, getAllPlaces, new Set(['water']));

    const pills = el.querySelectorAll('.filter-pill');
    expect(pills.length).toBe(2);

    const waterInput = el.querySelector('input[value="water"]');
    expect(waterInput.checked).toBe(true);
    expect(waterInput.closest('.filter-pill').classList.contains('active')).toBe(true);
    expect(waterInput.closest('.filter-pill').querySelector('.filter-pill-count').textContent).toBe('2');

    const baseInput = el.querySelector('input[value="base"]');
    expect(baseInput.checked).toBe(false);
    expect(baseInput.closest('.filter-pill').classList.contains('active')).toBe(false);
  });
});

describe('renderLegend', () => {
  it('rend un item par catégorie', () => {
    const el = document.createElement('div');
    renderLegend(el, categories);
    const items = el.querySelectorAll('.legend-item');
    expect(items.length).toBe(2);
    expect(el.textContent).toContain('Cascade / lac');
  });
});

describe('renderPlaces', () => {
  function render(visible, query = '') {
    const listEl  = document.createElement('ul');
    const countEl = document.createElement('span');
    renderPlaces(visible, listEl, countEl, categories, query);
    return { listEl, countEl };
  }

  it('rend les cartes, le compteur et le bouton itinéraire', () => {
    const { listEl, countEl } = render(places);
    expect(countEl.textContent).toBe('3');
    expect(listEl.querySelectorAll('.place-card').length).toBe(3);
    expect(listEl.querySelector('[data-place-id="baume"]')).not.toBeNull();
    expect(listEl.querySelector('[data-add-route-id="baume"]')).not.toBeNull();
  });

  it('marque les pins utilisateur (classe user-pin)', () => {
    const { listEl } = render(places);
    expect(listEl.querySelector('[data-place-id="cascade-tufs"]').classList.contains('user-pin')).toBe(true);
    expect(listEl.querySelector('[data-place-id="baume"]').classList.contains('user-pin')).toBe(false);
  });

  it('affiche l’état vide quand aucun lieu ne matche', () => {
    const { listEl, countEl } = render([]);
    expect(countEl.textContent).toBe('0');
    expect(listEl.textContent).toContain('Aucun lieu trouvé');
  });

  it('surligne la portion de nom qui matche la recherche', () => {
    const { listEl } = render([places[2]], 'tufs');
    const mark = listEl.querySelector('mark.search-highlight');
    expect(mark).not.toBeNull();
    expect(mark.textContent).toBe('Tufs');
  });

  it('neutralise un nom malveillant, même coupé par le highlight', () => {
    const evil = { id: 'x', name: '<img src=x onerror=alert(1)>', category: 'water' };
    // 'src' tombe au milieu du payload : chaque tranche doit être échappée
    const { listEl } = render([evil], 'src');
    expect(listEl.querySelector('img')).toBeNull();
    expect(listEl.querySelector('mark').textContent).toBe('src');
  });

  it('échappe les ids dans les attributs data-*', () => {
    const evil = { id: '" onmouseover="alert(1)', name: 'X', category: 'water' };
    const { listEl } = render([evil]);
    const card = listEl.querySelector('.place-card');
    expect(card.hasAttribute('onmouseover')).toBe(false);
    // l'attribut échappé retombe sur ses pieds au parsing
    expect(card.dataset.placeId).toBe('" onmouseover="alert(1)');
  });
});
