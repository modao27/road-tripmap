/**
 * @fileoverview URL de base de l'app, sous-chemin compris.
 *
 * Hébergée sur GitHub Pages, l'app vit sous /road-tripmap/ :
 * `origin + '/'` pointerait hors de l'app (404). Résoudre '.' contre
 * l'URL courante donne toujours le bon répertoire — le hash est ignoré
 * et ça reste correct en local (racine).
 */

/** @returns {string} ex. https://modao27.github.io/road-tripmap/ */
export function appBaseUrl() {
  return new URL('.', window.location.href).href;
}
