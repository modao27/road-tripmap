import { describe, it, expect } from 'vitest';
import { renderPinPopup } from './PinPopup.js';

const categories = { water: { color: '#2477a6', icon: '💧', label: 'Cascade / lac' } };

const pin = {
  id: 'a3bb189e-8bf9-4888-9912-ace4e6543002',
  name: 'Cascade des Tufs',
  description: 'Superbe le matin',
  category: 'water',
  lat: 46.709, lng: 5.646,
  userCreated: true,
};

describe('renderPinPopup', () => {
  it('rend nom, description et actions utilisateur', () => {
    const html = renderPinPopup(pin, categories, {});
    expect(html).toContain('Cascade des Tufs');
    expect(html).toContain('Superbe le matin');
    expect(html).toContain('popup-delete'); // pin userCreated → supprimable
    expect(html).toContain('openstreetmap.org');
  });

  it("reflète l'état in-route", () => {
    expect(renderPinPopup(pin, categories, {}, true)).toContain("Dans l'itinéraire");
    expect(renderPinPopup(pin, categories, {}, false)).toContain("Ajouter à l'itinéraire");
  });

  it('neutralise un nom et une description malveillants (XSS)', () => {
    const evil = {
      ...pin,
      name: '<img src=x onerror=alert(1)>',
      description: '<script>alert(2)</script>',
      id: '" onmouseover="alert(3)',
    };
    const html = renderPinPopup(evil, categories, {});
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onmouseover="alert');
    expect(html).toContain('&lt;img'); // affiché littéralement
  });
});
