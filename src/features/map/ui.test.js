// @vitest-environment happy-dom
// Composants UI de la carte : toasts, indicateur de sync, focus trap,
// resizer (dont le débranchement AbortSignal — non-régression D2).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast, setSyncStatus, trapFocus, initResizer } from './ui.js';

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.style.removeProperty('--sidebar');
});

afterEach(() => { vi.useRealTimers(); });

describe('showToast', () => {
  it('ajoute un toast typé puis déclenche son animation de sortie', () => {
    vi.useFakeTimers();
    const wrap = document.createElement('div');
    showToast(wrap, 'Hors ligne', 'error');

    const toast = wrap.querySelector('.toast.error');
    expect(toast.textContent).toBe('Hors ligne');

    vi.advanceTimersByTime(4000);
    expect(toast.style.animation).toContain('toast-out');
  });
});

describe('setSyncStatus', () => {
  function mountStatusEl() {
    const el = document.createElement('span');
    el.id = 'syncStatus';
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }

  it('affiche l’état demandé', () => {
    const el = mountStatusEl();
    setSyncStatus('saving');
    expect(el.hidden).toBe(false);
    expect(el.className).toBe('sync-status sync-saving');
  });

  it('masque automatiquement l’état saved après 3 s', () => {
    vi.useFakeTimers();
    const el = mountStatusEl();
    setSyncStatus('saved');
    expect(el.hidden).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(el.hidden).toBe(true);
  });

  it('ne fait rien sans élément #syncStatus (page sans carte)', () => {
    expect(() => setSyncStatus('saving')).not.toThrow();
  });
});

describe('trapFocus', () => {
  function mountModal() {
    const modal = document.createElement('div');
    modal.innerHTML = '<button id="first">A</button><button id="last">B</button>';
    document.body.appendChild(modal);
    return modal;
  }

  function pressTab(target, shiftKey = false) {
    target.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
  }

  it('reboucle du dernier élément vers le premier (Tab)', () => {
    const modal = mountModal();
    trapFocus(modal);
    modal.querySelector('#last').focus();
    pressTab(modal.querySelector('#last'));
    expect(document.activeElement.id).toBe('first');
  });

  it('reboucle du premier vers le dernier (Shift+Tab)', () => {
    const modal = mountModal();
    trapFocus(modal);
    modal.querySelector('#first').focus();
    pressTab(modal.querySelector('#first'), true);
    expect(document.activeElement.id).toBe('last');
  });

  it('le cleanup retourné débranche le piège', () => {
    const modal = mountModal();
    const cleanup = trapFocus(modal);
    cleanup();
    modal.querySelector('#last').focus();
    pressTab(modal.querySelector('#last'));
    expect(document.activeElement.id).toBe('last');
  });
});

describe('initResizer', () => {
  const config = { sidebarMin: 280, sidebarMax: 640, sidebarDefault: 390 };

  function mountResizer() {
    const resizer = document.createElement('div');
    resizer.id = 'resizer';
    document.body.appendChild(resizer);
    return resizer;
  }

  function drag(resizer, fromX, toX) {
    resizer.dispatchEvent(new MouseEvent('mousedown', { clientX: fromX, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: toX }));
    document.dispatchEvent(new MouseEvent('mouseup'));
  }

  const sidebarWidth = () =>
    document.documentElement.style.getPropertyValue('--sidebar');

  it('redimensionne la sidebar au drag (borné par la config)', () => {
    const resizer = mountResizer();
    const map = { invalidateSize: vi.fn() };
    initResizer(map, config);

    drag(resizer, 100, 150);
    expect(sidebarWidth()).toBe('440px'); // 390 (défaut) + 50
    expect(map.invalidateSize).toHaveBeenCalled();

    drag(resizer, 100, 900);
    expect(sidebarWidth()).toBe('640px'); // clampé à sidebarMax
  });

  it('un signal aborté débranche les listeners document (démontage D2)', () => {
    const resizer = mountResizer();
    const map = { invalidateSize: vi.fn() };
    const controller = new AbortController();
    initResizer(map, config, controller.signal);

    controller.abort();
    drag(resizer, 100, 150);
    expect(sidebarWidth()).toBe(''); // plus aucun listener → rien n'a bougé
    expect(map.invalidateSize).not.toHaveBeenCalled();
  });
});
