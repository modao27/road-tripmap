import { describe, it, expect } from 'vitest';
import {
  OVERPASS_CATEGORIES, OSM_TO_APP_CAT,
  detectOsmCategory, buildOverpassQL,
} from './overpassService.js';

describe('tables de catégories', () => {
  it('chaque catégorie OSM a un mapping vers une catégorie app', () => {
    for (const key of Object.keys(OVERPASS_CATEGORIES)) {
      expect(OSM_TO_APP_CAT[key], `mapping manquant pour ${key}`).toBeDefined();
    }
  });

  it('chaque catégorie a label, icon, color et au moins un tag', () => {
    for (const [key, cat] of Object.entries(OVERPASS_CATEGORIES)) {
      expect(cat.label, key).toBeTruthy();
      expect(cat.icon, key).toBeTruthy();
      expect(cat.color, key).toMatch(/^#/);
      expect(cat.tags.length, key).toBeGreaterThan(0);
    }
  });
});

describe('detectOsmCategory', () => {
  it('détecte les catégories depuis les tags OSM', () => {
    expect(detectOsmCategory({ waterway: 'waterfall' })).toBe('waterfall');
    expect(detectOsmCategory({ natural: 'spring' })).toBe('water');
    expect(detectOsmCategory({ tourism: 'viewpoint' })).toBe('viewpoint');
    expect(detectOsmCategory({ amenity: 'shelter' })).toBe('shelter');
    expect(detectOsmCategory({ tourism: 'trailhead' })).toBe('trailhead');
  });

  it('distingue via ferrata et escalade', () => {
    expect(detectOsmCategory({ climbing: 'via_ferrata' })).toBe('via_ferrata');
    expect(detectOsmCategory({ sport: 'via_ferrata' })).toBe('via_ferrata');
    expect(detectOsmCategory({ leisure: 'climbing' })).toBe('escalade');
    expect(detectOsmCategory({ climbing: 'crag' })).toBe('escalade');
  });

  it('retombe sur bivouac par défaut', () => {
    expect(detectOsmCategory({})).toBe('bivouac');
    expect(detectOsmCategory({ tourism: 'camp_site' })).toBe('bivouac');
  });
});

describe('buildOverpassQL', () => {
  const center = { lat: 46.70912, lng: 5.64634 };

  it('génère une ligne node par tag des catégories sélectionnées', () => {
    const ql = buildOverpassQL(['waterfall', 'viewpoint'], center, 10000);
    expect(ql).toContain('node["waterway"="waterfall"](around:10000,46.70912,5.64634);');
    expect(ql).toContain('node["tourism"="viewpoint"](around:10000,46.70912,5.64634);');
    expect(ql).toContain('[out:json][timeout:30];');
    expect(ql).toContain('out body;');
  });

  it('arrondit le rayon et fixe 5 décimales sur les coordonnées', () => {
    const ql = buildOverpassQL(['waterfall'], { lat: 46.1, lng: 5.123456789 }, 1500.7);
    expect(ql).toContain('around:1501,46.10000,5.12346');
  });

  it('ignore les catégories inconnues sans planter', () => {
    const ql = buildOverpassQL(['inexistante'], center, 1000);
    expect(ql).not.toContain('node[');
  });
});
