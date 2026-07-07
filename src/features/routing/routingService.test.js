import { describe, it, expect } from 'vitest';
import {
  estimateDuration, formatDistance, formatDuration,
  haversine, nearestNeighborOrder, buildGpx,
} from './routingService.js';

describe('haversine', () => {
  it('calcule une distance connue (Paris → Lyon ≈ 392 km)', () => {
    const d = haversine(48.8566, 2.3522, 45.7640, 4.8357);
    expect(d).toBeGreaterThan(380_000);
    expect(d).toBeLessThan(400_000);
  });

  it('renvoie 0 pour le même point', () => {
    expect(haversine(46.7, 5.6, 46.7, 5.6)).toBe(0);
  });
});

describe('formats', () => {
  it('formatDistance : m sous 1 km, km au-delà', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(12_400)).toBe('12.4 km');
  });

  it('formatDuration : minutes puis heures', () => {
    expect(formatDuration(45 * 60)).toBe('45 min');
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe('2h05');
  });
});

describe('estimateDuration', () => {
  it('null en voiture (OSRM fait foi)', () => {
    expect(estimateDuration(10_000, 'driving')).toBeNull();
  });

  it('16 km/h à vélo, 4 km/h à pied', () => {
    expect(estimateDuration(16_000, 'cycling')).toBe(3600);
    expect(estimateDuration(4_000, 'walking')).toBe(3600);
  });
});

describe('nearestNeighborOrder', () => {
  const a = { id: 'a', lat: 46.0, lng: 5.0 };
  const b = { id: 'b', lat: 46.1, lng: 5.0 };
  const c = { id: 'c', lat: 46.5, lng: 5.0 };

  it('réordonne par plus proche voisin depuis le premier', () => {
    expect(nearestNeighborOrder([a, c, b]).map(p => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('ne modifie pas le tableau source et laisse < 3 éléments intacts', () => {
    const input = [c, a];
    expect(nearestNeighborOrder(input).map(p => p.id)).toEqual(['c', 'a']);
    expect(input).toHaveLength(2);
  });
});

describe('buildGpx', () => {
  const places = [
    { name: 'Baume & <les> Messieurs', lat: 46.709, lng: 5.646 },
    { name: 'Cascade des Tufs',        lat: 46.703, lng: 5.641 },
  ];

  it('contient waypoints et route, avec noms XML échappés', () => {
    const gpx = buildGpx(places);
    expect(gpx).toContain('<?xml version="1.0"');
    expect(gpx).toContain('<wpt lat="46.709" lon="5.646">');
    expect(gpx).toContain('Baume &amp; &lt;les&gt; Messieurs');
    expect(gpx).toContain('<rtept lat="46.703" lon="5.641">');
    expect(gpx).not.toContain('<trk>');
  });

  it('ajoute le tracé <trk> quand une géométrie OSRM est fournie', () => {
    const geometry = { coordinates: [[5.646, 46.709], [5.641, 46.703]] };
    const gpx = buildGpx(places, geometry);
    expect(gpx).toContain('<trk><name>Tracé Road Trip</name>');
    expect(gpx).toContain('<trkpt lat="46.709" lon="5.646"/>');
  });
});
