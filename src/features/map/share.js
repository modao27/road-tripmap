// Slug et URL de partage : src/features/sharing/sharingService.js
// (source unique). Ce module garde la modale, la bannière et le DOM.
import { saveSharedMap, titleToSlug, buildShareUrl } from '../sharing/sharingService.js';

// ── Modale de partage ─────────────────────────────────────────────────────────

export function initShareModal({
  map,
  getActiveLayerKey,
  activeCategories,
  getUserPlaces,
  getPlaceOverrides,
  toastWrap,
  showToastFn,
  setSyncStatusFn,
  // AbortSignal de démontage de la carte (navigation SPA)
  signal,
}) {
  const backdrop    = document.getElementById('shareModalBackdrop');
  const titleInput  = document.getElementById('shareTitle');
  const descInput   = document.getElementById('shareDesc');
  const confirmBtn  = document.getElementById('shareConfirmBtn');
  const cancelBtn   = document.getElementById('shareCancelBtn');
  const shareBtn    = document.getElementById('shareButton');

  if (!backdrop) return;

  function openModal() {
    titleInput.value = '';
    descInput.value  = '';
    backdrop.hidden  = false;
    titleInput.focus();
  }

  function closeModal() {
    backdrop.hidden = true;
  }

  async function createShare() {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }

    confirmBtn.disabled    = true;
    confirmBtn.textContent = 'Création…';
    setSyncStatusFn('saving');

    const center = map.getCenter();

    try {
      const slug = await saveSharedMap(titleToSlug(title), {
        title,
        description: descInput.value.trim(),
        pins:        getUserPlaces(),
        overrides:   getPlaceOverrides(),
        center_lat:  center.lat,
        center_lng:  center.lng,
        zoom:        map.getZoom(),
        base_layer:  getActiveLayerKey(),
        filters:     [...activeCategories],
      });

      const url = buildShareUrl(slug);

      try {
        await navigator.clipboard.writeText(url);
      } catch {
        prompt('Copie ce lien pour partager ta carte :', url);
      }

      setSyncStatusFn('saved');
      closeModal();
      showToastFn(toastWrap, '🔗 Lien copié dans le presse-papier !', 'success');
    } catch (err) {
      setSyncStatusFn('error');
      showToastFn(toastWrap, 'Erreur lors de la création du lien', 'error');
      console.error('[share]', err);
    } finally {
      confirmBtn.disabled    = false;
      confirmBtn.textContent = 'Créer le lien';
    }
  }

  shareBtn?.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);
  confirmBtn.addEventListener('click', createShare);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') createShare(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !backdrop.hidden) closeModal();
  }, { signal });
}

// ── Bannière "carte partagée chargée" ────────────────────────────────────────

export function showSharedMapBanner(title) {
  const banner  = document.getElementById('sharedMapBanner');
  const titleEl = document.getElementById('sharedMapTitle');
  if (!banner || !titleEl) return;
  titleEl.textContent = title;
  banner.hidden = false;
  document.getElementById('sharedMapClose')?.addEventListener('click', () => {
    banner.hidden = true;
  });
}

// ── Modale de confirmation avant chargement ───────────────────────────────────

export function confirmSharedMapLoad(title, signal = undefined) {
  return new Promise((resolve) => {
    const backdrop  = document.getElementById('sharedMapConfirmBackdrop');
    const nameEl    = document.getElementById('sharedMapConfirmName');
    const loadBtn   = document.getElementById('sharedMapLoadConfirm');
    const cancelBtn = document.getElementById('sharedMapCancelConfirm');

    if (!backdrop) { resolve(true); return; }

    nameEl.textContent = title;
    backdrop.hidden = false;

    function done(value) {
      backdrop.hidden = true;
      loadBtn.removeEventListener('click', onLoad);
      cancelBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onOutside);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    }

    const onLoad    = () => done(true);
    const onCancel  = () => done(false);
    const onOutside = (e) => { if (e.target === backdrop) done(false); };
    const onKey     = (e) => { if (e.key === 'Escape') done(false); };

    loadBtn.addEventListener('click', onLoad);
    cancelBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey, { signal });
  });
}
