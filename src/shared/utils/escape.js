/**
 * @fileoverview Échappement HTML — protection XSS.
 *
 * À utiliser sur TOUTE donnée non maîtrisée interpolée dans du HTML :
 * - saisie utilisateur (noms de pins, titres de road trips, notes…)
 * - données distantes (Supabase, Nominatim, Overpass, DATAtourisme,
 *   Wikivoyage, Edge Functions)
 *
 * Les cartes partagées (?map=slug) livrent des pins créés par d'autres
 * utilisateurs : sans échappement, un nom de pin contenant du HTML
 * s'exécute chez toute personne qui ouvre le lien (XSS stocké).
 */

/**
 * Échappe les caractères spéciaux HTML.
 * Sûr pour le texte et pour les valeurs d'attributs entre guillemets.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Valide et échappe une URL destinée à un attribut href.
 * N'accepte que http(s) — bloque javascript:, data:, vbscript:, etc.
 * @param {unknown} url
 * @returns {string} URL échappée, ou '' si le schéma est interdit
 */
export function safeUrl(url) {
  const s = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  return escapeHtml(s);
}
