import { describe, it, expect } from 'vitest';
import { contrastRatio, AA_NORMAL_TEXT, AA_LARGE_TEXT } from './contrast.js';

describe('contrastRatio', () => {
  it('calcule le ratio maximal (noir/blanc)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('est symétrique', () => {
    expect(contrastRatio('#235D7E', '#FAF9F6'))
      .toBeCloseTo(contrastRatio('#FAF9F6', '#235D7E'), 5);
  });
});

// Paires réellement utilisées par css/tokens.css (Phase G) — à tenir
// synchronisées si la palette change. Couvre les usages texte réels, pas
// toutes les combinaisons possibles.
describe('tokens.css — audit de contraste AA', () => {
  const light = {
    bg: '#FAF9F6', surface: '#FFFFFF', text: '#1E293B', muted: '#6B727C',
    primary: '#235D7E', accent: '#F08C46', accentInk: '#9C5B2E', onPrimary: '#FFFFFF',
    onAccent: '#1E293B', primaryText: '#235D7E',
  };
  const dark = {
    bg: '#08141C', surface: '#0F222E', text: '#EDEBE6', muted: '#9DA0A6',
    primary: '#235D7E', accent: '#F08C46', onPrimary: '#FFFFFF',
    onAccent: '#1E293B', primaryText: '#7096AB',
  };

  it('texte principal sur fond (clair et sombre)', () => {
    expect(contrastRatio(light.text, light.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(light.text, light.surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.text, dark.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.text, dark.surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('texte atténué (--color-muted) sur fond (clair et sombre)', () => {
    expect(contrastRatio(light.muted, light.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.muted, dark.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('bouton primaire : texte blanc sur --color-primary', () => {
    expect(contrastRatio(light.onPrimary, light.primary)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.onPrimary, dark.primary)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('bouton accent : texte marine sur --color-accent (le blanc échoue, 2.46:1)', () => {
    expect(contrastRatio(light.text, light.accent)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio('#FFFFFF', light.accent)).toBeLessThan(AA_NORMAL_TEXT);
  });

  it('--color-on-accent est fixe (pas var(--color-text)) : --color-accent ne '
    + "s'assombrit pas en mode sombre, contrairement à --color-text (clair) — "
    + 'sinon le texte des boutons orange devient illisible en sombre (régression '
    + 'trouvée par Lighthouse, 2.06:1)', () => {
    expect(light.onAccent).toBe(dark.onAccent);
    expect(contrastRatio(dark.onAccent, dark.accent)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.text, dark.accent)).toBeLessThan(AA_NORMAL_TEXT);
  });

  it('lien/texte orange sur fond clair : nécessite --color-accent-ink assombri', () => {
    expect(contrastRatio(light.accentInk, light.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(light.accent, light.bg)).toBeLessThan(AA_NORMAL_TEXT);
  });

  it('accent directement sur fond sombre (pas besoin de l\'assombrir)', () => {
    expect(contrastRatio(dark.accent, dark.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('bordures/séparateurs restent au moins au seuil UI (3:1, non-texte)', () => {
    expect(contrastRatio(light.primary, light.bg)).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
    expect(contrastRatio(dark.text, dark.bg)).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });

  it('--color-primary-text : titres/liens en --color-primary sur fond/surface '
    + "sombres — --color-primary lui-même ne s'éclaircit pas entre les thèmes "
    + '(utile en fond de bouton), donc en texte son contraste tombe à ~2.3:1 sur '
    + 'une surface sombre (régression trouvée par Lighthouse sur /#/login)', () => {
    expect(contrastRatio(light.primaryText, light.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(light.primaryText, light.surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.primaryText, dark.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.primaryText, dark.surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.primary, dark.surface)).toBeLessThan(AA_NORMAL_TEXT);
  });
});
