/**
 * @fileoverview Ratio de contraste WCAG 2.x entre deux couleurs hexadécimales.
 *
 * Sert à l'audit scripté (contrast.test.js) des paires texte/fond des
 * design tokens (css/tokens.css, Phase G) — un token retouché sans repasser
 * par ce calcul peut retomber sous le seuil AA sans que ça se voie à l'œil
 * (l'orange #F08C46 avec du texte blanc ne fait que 2.46:1).
 */

function srgbToLinear(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** @param {string} hex - couleur 6 chiffres, avec ou sans '#' */
function relativeLuminance(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * Ratio de contraste WCAG entre deux couleurs (1 à 21).
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number}
 */
export function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Seuils WCAG AA. */
export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3.0;
