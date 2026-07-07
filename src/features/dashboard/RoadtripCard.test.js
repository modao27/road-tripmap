import { describe, it, expect } from 'vitest';
import { renderRoadtripCard } from './RoadtripCard.js';

const trip = {
  id: 'a3bb189e-8bf9-4888-9912-ace4e6543002',
  title: 'Jura été 2026',
  description: 'Cascades & belvédères',
  pin_count: 3,
  updated_at: new Date().toISOString(),
};

describe('renderRoadtripCard', () => {
  it('rend titre, description et méta', () => {
    const html = renderRoadtripCard(trip, 0);
    expect(html).toContain('Jura été 2026');
    expect(html).toContain('Cascades &amp; belvédères');
    expect(html).toContain('3 pins');
    expect(html).toContain(`map.html?map=${trip.id}`);
  });

  it('neutralise titre et description malveillants (XSS)', () => {
    const evil = {
      ...trip,
      title: '<img src=x onerror=alert(1)>',
      description: '" onmouseover="alert(2)',
    };
    const html = renderRoadtripCard(evil, 1);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onmouseover="alert');
    // data-title doit rester une valeur d'attribut inerte
    expect(html).toContain('data-title="&lt;img');
  });
});
