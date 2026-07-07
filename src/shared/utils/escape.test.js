import { describe, it, expect } from 'vitest';
import { escapeHtml, safeUrl } from './escape.js';

describe('escapeHtml', () => {
  it('neutralise les balises HTML', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>'))
      .toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('neutralise les guillemets (contexte attribut)', () => {
    expect(escapeHtml('" onmouseover="alert(1)'))
      .toBe('&quot; onmouseover=&quot;alert(1)');
    expect(escapeHtml("l'étoile")).toBe('l&#39;étoile');
  });

  it("échappe l'esperluette en premier (pas de double échappement)", () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    expect(escapeHtml('Baume & Messieurs')).toBe('Baume &amp; Messieurs');
  });

  it('laisse passer texte accentué et emojis', () => {
    expect(escapeHtml('Cascade des Tufs 💧 — à Baume-les-Messieurs'))
      .toBe('Cascade des Tufs 💧 — à Baume-les-Messieurs');
  });

  it('gère null/undefined/nombres', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(46.709)).toBe('46.709');
  });
});

describe('safeUrl', () => {
  it('accepte http(s) et échappe les caractères d\'attribut', () => {
    expect(safeUrl('https://example.fr/page')).toBe('https://example.fr/page');
    expect(safeUrl('http://example.fr')).toBe('http://example.fr');
    expect(safeUrl('https://a.fr/"x')).toBe('https://a.fr/&quot;x');
  });

  it('bloque les schémas dangereux', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('JavaScript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeUrl('vbscript:x')).toBe('');
  });

  it('rejette vide / null / URL relative', () => {
    expect(safeUrl('')).toBe('');
    expect(safeUrl(null)).toBe('');
    expect(safeUrl('/chemin/relatif')).toBe('');
    expect(safeUrl('//protocole-relatif.fr')).toBe('');
  });
});
