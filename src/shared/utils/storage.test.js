// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { storageGet, storageSet, storageRemove, generateUUID, isUUID } from './storage.js';

describe('isUUID', () => {
  it('accepte un UUID v4 valide', () => {
    expect(isUUID('a3bb189e-8bf9-4888-9912-ace4e6543002')).toBe(true);
  });

  it('rejette les autres formats', () => {
    expect(isUUID('mon-slug-de-carte')).toBe(false);
    expect(isUUID('')).toBe(false);
    expect(isUUID('a3bb189e-8bf9-1888-9912-ace4e6543002')).toBe(false); // v1
  });
});

describe('generateUUID', () => {
  it('produit un UUID v4 valide et unique', () => {
    const a = generateUUID();
    const b = generateUUID();
    expect(isUUID(a)).toBe(true);
    expect(isUUID(b)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('storageGet / storageSet / storageRemove', () => {
  it('round-trip JSON', () => {
    storageSet('t-key', { pins: [1, 2], name: 'été' });
    expect(storageGet('t-key', null)).toEqual({ pins: [1, 2], name: 'été' });
    storageRemove('t-key');
    expect(storageGet('t-key', 'fallback')).toBe('fallback');
  });

  it('retourne le fallback sur JSON corrompu', () => {
    localStorage.setItem('t-bad', '{pas du json');
    expect(storageGet('t-bad', 42)).toBe(42);
    storageRemove('t-bad');
  });
});
