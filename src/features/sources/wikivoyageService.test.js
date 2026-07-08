// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { groupSectionsFromHtml } from './wikivoyageService.js';

const SAMPLE = `
  <div class="mw-heading"><h2><span class="mw-headline">Voir</span></h2></div>
  <ul>
    <li><b>Abbaye de Baume</b> – joyau roman</li>
    <li>Belvédère des Roches de Baume : vue sur la reculée</li>
    <li>ab</li>
    <li>12 rue du marché</li>
  </ul>
  <div class="mw-heading"><h2><span class="mw-headline">Manger</span></h2></div>
  <ul><li><strong>Le Grand Jardin</strong> - table gourmande</li></ul>
  <div class="mw-heading"><h2><span class="mw-headline">Section inconnue</span></h2></div>
  <ul><li>Ignorée car sans catégorie</li></ul>
`;

describe('groupSectionsFromHtml', () => {
  const grouped = groupSectionsFromHtml(SAMPLE);

  it('regroupe les sections connues avec icône et items', () => {
    expect(grouped['À voir'].items).toEqual([
      'Abbaye de Baume',
      'Belvédère des Roches de Baume',
    ]);
    expect(grouped['Manger'].items).toEqual(['Le Grand Jardin']);
    expect(grouped['À voir'].icon).toBeTruthy();
  });

  it('filtre les items trop courts ou commençant par un chiffre', () => {
    const items = grouped['À voir'].items;
    expect(items).not.toContain('ab');
    expect(items.some(i => i.startsWith('12'))).toBe(false);
  });

  it('ignore les sections sans catégorie UX', () => {
    expect(Object.keys(grouped)).toEqual(['À voir', 'Manger']);
  });

  it('rend un objet vide pour du HTML sans sections', () => {
    expect(groupSectionsFromHtml('<p>rien</p>')).toEqual({});
  });
});
