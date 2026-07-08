// @vitest-environment happy-dom
// buildShareUrl en contexte SPA (index.html) — le cas map.html est couvert
// dans sharingService.test.js.
import { describe, it, expect, beforeAll } from 'vitest';

let buildShareUrl;

beforeAll(async () => {
  window.supabase = {
    createClient: () => ({
      auth: { onAuthStateChange() {}, getSession: async () => ({ data: { session: null } }) },
    }),
  };
  ({ buildShareUrl } = await import('./sharingService.js'));
});

describe('buildShareUrl (SPA)', () => {
  it('produit la route #/map/:slug depuis index.html', () => {
    window.location.href = 'http://localhost/index.html#/map';
    expect(buildShareUrl('jura-ete-2026'))
      .toBe('http://localhost/index.html#/map/jura-ete-2026');
  });

  it('encode le slug', () => {
    window.location.href = 'http://localhost/index.html#/map';
    expect(buildShareUrl('été 2026')).toContain('#/map/%C3%A9t%C3%A9%202026');
  });
});
