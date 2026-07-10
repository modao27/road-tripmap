import { describe, it, expect, vi, afterEach } from 'vitest';
import { describeWeatherCode, fetchWeatherDaily } from './weatherService.js';

describe('describeWeatherCode', () => {
  it('mappe les codes WMO usuels', () => {
    expect(describeWeatherCode(0).label).toBe('Ciel clair');
    expect(describeWeatherCode(61).label).toBe('Pluie');
    expect(describeWeatherCode(81).label).toBe('Pluie');   // averses
    expect(describeWeatherCode(95).label).toBe('Orage');
  });

  it('retombe sur un libellé générique pour un code inconnu', () => {
    expect(describeWeatherCode(42).label).toBe('Météo');
  });
});

describe('fetchWeatherDaily', () => {
  afterEach(() => vi.unstubAllGlobals());

  const openMeteoResponse = {
    daily: {
      time:                          ['2026-07-10', '2026-07-11'],
      weather_code:                  [0, 61],
      temperature_2m_max:            [24.6, 18.2],
      temperature_2m_min:            [11.3, 9.8],
      precipitation_probability_max: [5, 80],
    },
  };

  it('normalise la réponse quotidienne (°C arrondis)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify(openMeteoResponse))));

    const days = await fetchWeatherDaily(46.71, 5.64);
    expect(days).toEqual([
      { date: '2026-07-10', code: 0,  tMax: 25, tMin: 11, rainProb: 5 },
      { date: '2026-07-11', code: 61, tMax: 18, tMin: 10, rainProb: 80 },
    ]);
  });

  it('sert la même cellule 0.1° depuis le cache (un seul fetch)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(openMeteoResponse)));
    vi.stubGlobal('fetch', fetchMock);

    await fetchWeatherDaily(46.111, 5.222);
    await fetchWeatherDaily(46.149, 5.201); // même cellule (46.1, 5.2)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ne met pas un échec en cache (nouvel essai possible)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(openMeteoResponse)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWeatherDaily(44.5, 6.5)).rejects.toThrow('Open-Meteo 500');
    const days = await fetchWeatherDaily(44.5, 6.5);
    expect(days).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
