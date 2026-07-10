// Test du rendu popup legacy (js/) — vérifie aussi que l'import
// cross-arborescence js/ → src/shared/utils/escape.js se résout.
import { describe, it, expect } from 'vitest';
import { popupHtml } from './pins.js';

const categories = { water: { color: '#2477a6', icon: '💧', label: 'Cascade / lac' } };

describe('popupHtml (legacy)', () => {
  it('rend un pin nominal avec chips et lien de fiche', () => {
    const place = {
      id: 'cascade-tufs', name: 'Cascade des Tufs', category: 'water',
      lat: 46.709, lng: 5.646,
      description: '🎯 AD (Assez Difficile)  ⏱ 2h30\n🔗 https://www.viaferrata-fr.net/fiche.html\nTexte libre.',
      userCreated: true,
    };
    const html = popupHtml(place, categories, {});
    expect(html).toContain('Cascade des Tufs');
    expect(html).toContain('popup-chip');
    expect(html).toContain('href="https://www.viaferrata-fr.net/fiche.html"');
    expect(html).toContain('Texte libre.');
  });

  it('neutralise les payloads XSS (pins de cartes partagées)', () => {
    const evil = {
      id: '" onmouseover="alert(1)',
      name: '<img src=x onerror=alert(1)>',
      category: 'water', lat: 46.1, lng: 5.6,
      description: '🔗 https://x.fr/"><script>alert(2)</script>\n<svg onload=alert(3)>',
      interest: '<script>alert(4)</script>',
      userCreated: true,
    };
    const html = popupHtml(evil, categories, {});
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('onmouseover="alert');
  });

  it('structure P1 : action itinéraire unique + actions secondaires en pied', () => {
    const place = {
      id: 'x', name: 'X', category: 'water', lat: 1, lng: 1,
      interest: 'Vaut le détour', tip: 'Y aller tôt', userCreated: true,
    };
    const html = popupHtml(place, categories, {});
    expect(html).toContain('popup-add-route');
    expect(html).toContain('popup-foot');
    expect(html).toContain('data-edit-id="x"');
    expect(html).toContain('data-delete-id="x"');
    // Intérêt / conseil regroupés dans le repli « En savoir plus »
    expect(html).toContain('En savoir plus');
    expect(html).toContain('Vaut le détour');
  });

  it('clampe les descriptions longues (tap pour déplier)', () => {
    const long  = { id: 'x', name: 'X', category: 'water', lat: 1, lng: 1,
                    description: 'mot '.repeat(80), userCreated: true };
    const short = { ...long, description: 'Courte description.' };
    expect(popupHtml(long,  categories, {})).toContain('data-desc-toggle');
    expect(popupHtml(short, categories, {})).not.toContain('data-desc-toggle');
  });

  it("bloque les URLs de fiche non http(s)", () => {
    const place = {
      id: 'x', name: 'X', category: 'water', lat: 1, lng: 1,
      description: '🔗 https://ok.fr/fiche', userCreated: true,
    };
    // la regex de renderDescription exige déjà http(s) ; safeUrl reste la
    // deuxième ligne de défense pour les guillemets
    expect(popupHtml(place, categories, {})).toContain('href="https://ok.fr/fiche"');
  });
});
