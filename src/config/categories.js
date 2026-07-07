/**
 * @fileoverview Catégories de lieux de l'application (source unique).
 * Utilisées par la carte legacy (js/) et la SPA (src/).
 */

export const categories = {
  base:     { label: "Point d'ancrage",       color: "#912d2d", icon: "★"  },
  bivouac:  { label: "Bivouac",               color: "#2f6f36", icon: "⛺" },
  via:      { label: "Via ferrata",            color: "#d56b1d", icon: "🧗" },
  escalade: { label: "Escalade",              color: "#7b4b2a", icon: "🪨" },
  hike:     { label: "Randonnée / belvédère", color: "#6f513f", icon: "🥾" },
  water:    { label: "Cascade / lac",          color: "#2477a6", icon: "💧" },
  village:  { label: "Village / patrimoine",  color: "#605d80", icon: "🏘️" }
};
