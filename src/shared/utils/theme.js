/**
 * @fileoverview Bascule clair/sombre — mémorisée en localStorage,
 * par-dessus le réglage système (prefers-color-scheme).
 *
 * Stockage en chaîne brute (pas storageGet/storageSet JSON) car
 * index.html lit la même clé de façon synchrone avant le premier paint,
 * pour éviter un flash de thème (FOUC) — les deux lectures doivent
 * s'accorder sans encodage JSON.
 */

export const THEME_STORAGE_KEY = 'rtm-theme';

/** @returns {'light'|'dark'|null} Préférence explicite de l'utilisateur, sinon null. */
export function getStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} Préférence sombre du système d'exploitation. */
export function systemPrefersDark() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** @returns {'light'|'dark'} Thème réellement affiché (choix explicite ou repli système). */
export function getEffectiveTheme() {
  return getStoredTheme() ?? (systemPrefersDark() ? 'dark' : 'light');
}

/**
 * Applique un thème (attribut sur <html> lu par css/tokens.css) et le mémorise.
 * @param {'light'|'dark'} theme
 */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // navigation privée / quota plein : le thème reste appliqué pour la session
  }
}

/** Inverse le thème actuellement effectif et l'applique. @returns {'light'|'dark'} */
export function toggleTheme() {
  const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
