import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { searchStations } from './stationsService.js';

// Le dataset est chargé paresseusement une seule fois pour la vie du module
// (comme weatherService le fait par cellule) : on stub fetch une seule fois
// ici et on vérifie le nombre d'appels en tout dernier, plutôt que de
// re-stuber à chaque test (le cache ignorerait de toute façon le restub).
const fixture = [
  { uic: '1', name: 'Paris Gare de Lyon',   lat: 48.844, lng: 2.374, main: true },
  { uic: '2', name: 'Lyon Part-Dieu',       lat: 45.760, lng: 4.859, main: true },
  { uic: '3', name: 'Lyon Perrache',        lat: 45.749, lng: 4.826, main: false },
  { uic: '4', name: 'Lyon Saint-Paul',      lat: 45.766, lng: 4.827, main: false },
  { uic: '5', name: 'Chamonix-Mont-Blanc',  lat: 45.917, lng: 6.869, main: true },
];

let fetchMock;

describe('searchStations', () => {
  beforeAll(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterAll(() => vi.unstubAllGlobals());

  it('ne recherche pas en dessous de 2 caractères', async () => {
    expect(await searchStations('l')).toEqual([]);
    expect(await searchStations(' ')).toEqual([]);
  });

  it('trouve par sous-chaîne, insensible à la casse', async () => {
    const results = await searchStations('lyon');
    expect(results.map(s => s.name)).toEqual(
      expect.arrayContaining(['Lyon Part-Dieu', 'Lyon Perrache', 'Lyon Saint-Paul', 'Paris Gare de Lyon'])
    );
  });

  it('priorise les correspondances en préfixe puis les gares principales', async () => {
    const results = await searchStations('lyon');
    // "Lyon …" (préfixe) doit passer avant "Paris Gare de Lyon" (sous-chaîne seulement)
    expect(results[results.length - 1].name).toBe('Paris Gare de Lyon');
    // Parmi les préfixes, la gare principale (Part-Dieu) d'abord
    expect(results[0].name).toBe('Lyon Part-Dieu');
  });

  it('ignore les accents', async () => {
    const results = await searchStations('chamonix');
    expect(results.map(s => s.name)).toEqual(['Chamonix-Mont-Blanc']);
  });

  it("ne charge le dataset qu'une seule fois pour tous les appels ci-dessus (cache)", () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
