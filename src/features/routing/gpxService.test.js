// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parseGpx, trackLengthMeters } from './gpxService.js';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="46.709" lon="5.646">
    <name>Baume-les-Messieurs</name>
    <desc>Point de départ</desc>
  </wpt>
  <wpt lat="46.703" lon="5.641"><name>Cascade des Tufs</name></wpt>
  <wpt lon="5.0"><name>Sans latitude</name></wpt>
  <trk><name>Randonnée</name><trkseg>
    <trkpt lat="46.709" lon="5.646"/>
    <trkpt lat="46.706" lon="5.643"/>
    <trkpt lat="46.703" lon="5.641"/>
  </trkseg></trk>
</gpx>`;

describe('parseGpx', () => {
  it('extrait waypoints (nom, desc) et tracé, ignore les points sans coordonnées', () => {
    const { waypoints, track } = parseGpx(SAMPLE);
    expect(waypoints).toEqual([
      { name: 'Baume-les-Messieurs', lat: 46.709, lng: 5.646, desc: 'Point de départ' },
      { name: 'Cascade des Tufs',    lat: 46.703, lng: 5.641, desc: '' },
    ]);
    expect(track).toEqual([[46.709, 5.646], [46.706, 5.643], [46.703, 5.641]]);
  });

  it('retombe sur les <rtept> quand le fichier n’a pas de <trk>', () => {
    const gpx = `<gpx version="1.1"><rte>
      <rtept lat="46.1" lon="5.1"/><rtept lat="46.2" lon="5.2"/>
    </rte></gpx>`;
    expect(parseGpx(gpx).track).toEqual([[46.1, 5.1], [46.2, 5.2]]);
  });

  it('nomme les waypoints anonymes', () => {
    const gpx = `<gpx version="1.1"><wpt lat="46.1" lon="5.1"/></gpx>`;
    expect(parseGpx(gpx).waypoints[0].name).toBe('Waypoint 1');
  });

  it('rejette un document dont la racine n’est pas <gpx>', () => {
    expect(() => parseGpx('<kml><Document/></kml>')).toThrow('Pas un fichier GPX');
  });
});

describe('trackLengthMeters', () => {
  it('somme les segments (≈ 1,11 km pour 0.01° de latitude)', () => {
    const len = trackLengthMeters([[46.0, 5.0], [46.01, 5.0]]);
    expect(len).toBeGreaterThan(1_050);
    expect(len).toBeLessThan(1_180);
  });

  it('vaut 0 pour moins de 2 points', () => {
    expect(trackLengthMeters([])).toBe(0);
    expect(trackLengthMeters([[46, 5]])).toBe(0);
  });
});
