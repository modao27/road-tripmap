/**
 * @fileoverview Bouton flottant de bascule clair/sombre — monté une seule
 * fois au démarrage (main.js), en dehors de #app : il survit aux
 * changements de page/route.
 */

import { getEffectiveTheme, toggleTheme, syncThemeWithSystem } from '../utils/theme.js';
import { ICON_SUN, ICON_MOON } from './icons.js';

let button = null;

function render() {
  if (!button) return;
  const isDark = getEffectiveTheme() === 'dark';
  button.innerHTML = isDark ? ICON_SUN : ICON_MOON;
  button.setAttribute('aria-label', isDark ? 'Passer au thème clair' : 'Passer au thème sombre');
  button.setAttribute('title', isDark ? 'Thème clair' : 'Thème sombre');
}

/** Monte le bouton (idempotent). */
export function mountThemeToggle() {
  if (button && document.contains(button)) return;

  button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-toggle';
  button.addEventListener('click', () => {
    toggleTheme();
    render();
  });

  document.body.appendChild(button);
  render();

  // Suit le système tant que l'utilisateur n'a pas fait de choix explicite
  window.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => { syncThemeWithSystem(); render(); });
}
