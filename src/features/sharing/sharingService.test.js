// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest';

let titleToSlug, buildShareUrl;

beforeAll(async () => {
  // sharingService importe le client Supabase, qui exige window.supabase
  // (CDN) — stub minimal avant l'import dynamique.
  window.supabase = {
    createClient: () => ({
      auth: { onAuthStateChange() {}, getSession: async () => ({ data: { session: null } }) },
    }),
  };
  ({ titleToSlug, buildShareUrl } = await import('./sharingService.js'));
});

describe('titleToSlug', () => {
  it('kebab-case sans accents ni caractères spéciaux', () => {
    expect(titleToSlug('Road trip Jura — été 2026 !')).toBe('road-trip-jura-ete-2026');
    expect(titleToSlug("L'Étoile & le lac")).toBe('letoile-le-lac');
  });

  it('tronque à 50 caractères', () => {
    expect(titleToSlug('a'.repeat(80)).length).toBe(50);
  });

  it("fallback 'carte' si rien d'utilisable", () => {
    expect(titleToSlug('🗺️ !!!')).toBe('carte');
    expect(titleToSlug('')).toBe('carte');
  });
});

describe('buildShareUrl', () => {
  it('ajoute ?map=slug et retire le hash', () => {
    window.location.href = 'http://localhost/map.html?onboard=true#section';
    const url = new URL(buildShareUrl('mon-slug'));
    expect(url.searchParams.get('map')).toBe('mon-slug');
    expect(url.searchParams.get('onboard')).toBe('true');
    expect(url.hash).toBe('');
  });
});
