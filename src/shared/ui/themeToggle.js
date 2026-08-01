/**
 * @fileoverview Bouton de bascule clair/sombre — intégré dans les headers
 * de chaque page (dashboard, map), monté au chargement de la page.
 */

import { getEffectiveTheme, toggleTheme, syncThemeWithSystem } from '../utils/theme.js';
import { ICON_SUN, ICON_MOON } from './icons.js';

/** Retourne le HTML du bouton theme-toggle. */
export function themeToggleHtml() {
  const isDark = getEffectiveTheme() === 'dark';
  return `
    <button class="btn btn--ghost btn--icon theme-toggle" type="button" 
            aria-label="${isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}"
            title="${isDark ? 'Thème clair' : 'Thème sombre'}">
      ${isDark ? ICON_SUN : ICON_MOON}
    </button>
  `;
}

function renderButton(button) {
  if (!button) return;
  const isDark = getEffectiveTheme() === 'dark';
  button.innerHTML = isDark ? ICON_SUN : ICON_MOON;
  button.setAttribute('aria-label', isDark ? 'Passer au thème clair' : 'Passer au thème sombre');
  button.setAttribute('title', isDark ? 'Thème clair' : 'Thème sombre');
}

/** Monte le bouton (cherche dans le DOM et wire les events). */
export function mountThemeToggle() {
  const buttons = document.querySelectorAll('.theme-toggle');
  
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      toggleTheme();
      // Re-render tous les boutons theme-toggle présents
      document.querySelectorAll('.theme-toggle').forEach(renderButton);
    });
    renderButton(button);
  });

  // Suit le système tant que l'utilisateur n'a pas fait de choix explicite
  window.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => { 
      syncThemeWithSystem(); 
      document.querySelectorAll('.theme-toggle').forEach(renderButton);
    });
}
