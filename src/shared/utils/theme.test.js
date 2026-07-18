// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredTheme, getEffectiveTheme, applyTheme, toggleTheme, syncThemeWithSystem, THEME_STORAGE_KEY } from './theme.js';

beforeEach(() => {
  localStorage.removeItem(THEME_STORAGE_KEY);
  delete document.documentElement.dataset.theme;
});

describe('getStoredTheme', () => {
  it("retourne null sans préférence explicite", () => {
    expect(getStoredTheme()).toBeNull();
  });

  it('ignore une valeur corrompue', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'violet');
    expect(getStoredTheme()).toBeNull();
  });
});

describe('applyTheme', () => {
  it('pose data-theme sur <html> et mémorise le choix', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
  });
});

describe('toggleTheme', () => {
  it('bascule clair -> sombre -> clair', () => {
    applyTheme('light');
    expect(toggleTheme()).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
    expect(toggleTheme()).toBe('light');
    expect(getStoredTheme()).toBe('light');
  });
});

describe('getEffectiveTheme', () => {
  it('renvoie la préférence explicite si présente', () => {
    applyTheme('dark');
    expect(getEffectiveTheme()).toBe('dark');
  });
});

describe('syncThemeWithSystem', () => {
  it("ne touche pas data-theme si une préférence explicite existe", () => {
    applyTheme('light');
    document.documentElement.dataset.theme = 'light';
    syncThemeWithSystem();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it("pose data-theme sans le mémoriser quand rien n'est explicite", () => {
    syncThemeWithSystem();
    expect(['light', 'dark']).toContain(document.documentElement.dataset.theme);
    expect(getStoredTheme()).toBeNull();
  });
});
