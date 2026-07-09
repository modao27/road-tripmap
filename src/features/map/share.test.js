// @vitest-environment happy-dom
// Modale de confirmation avant chargement d'une carte partagée.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// share.js importe sharingService → supabaseClient, qui exige le CDN
// window.supabase au chargement. Hors sujet ici : on mocke le service.
vi.mock('../sharing/sharingService.js', () => ({
  saveSharedMap: async () => {},
  titleToSlug:   () => 'slug',
  buildShareUrl: () => 'https://example.test/#/map/slug',
}));

const { confirmSharedMapLoad } = await import('./share.js');

function mountConfirmModal() {
  document.body.innerHTML = `
    <div id="sharedMapConfirmBackdrop" hidden>
      <span id="sharedMapConfirmName"></span>
      <button id="sharedMapLoadConfirm">Charger</button>
      <button id="sharedMapCancelConfirm">Annuler</button>
    </div>`;
  return document.getElementById('sharedMapConfirmBackdrop');
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('confirmSharedMapLoad', () => {
  it('affiche le titre et résout true sur « Charger »', async () => {
    const backdrop = mountConfirmModal();
    const promise = confirmSharedMapLoad('Jura été 2026');

    expect(backdrop.hidden).toBe(false);
    expect(document.getElementById('sharedMapConfirmName').textContent).toBe('Jura été 2026');

    document.getElementById('sharedMapLoadConfirm').click();
    await expect(promise).resolves.toBe(true);
    expect(backdrop.hidden).toBe(true);
  });

  it('résout false sur « Annuler »', async () => {
    mountConfirmModal();
    const promise = confirmSharedMapLoad('X');
    document.getElementById('sharedMapCancelConfirm').click();
    await expect(promise).resolves.toBe(false);
  });

  it('résout false sur Escape', async () => {
    mountConfirmModal();
    const promise = confirmSharedMapLoad('X');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(promise).resolves.toBe(false);
  });

  it('résout true directement si la modale est absente du markup', async () => {
    await expect(confirmSharedMapLoad('X')).resolves.toBe(true);
  });

  it('un titre malveillant reste du texte inerte (textContent)', async () => {
    mountConfirmModal();
    const promise = confirmSharedMapLoad('<img src=x onerror=alert(1)>');
    expect(document.querySelector('#sharedMapConfirmName img')).toBeNull();
    document.getElementById('sharedMapLoadConfirm').click();
    await promise;
  });
});
