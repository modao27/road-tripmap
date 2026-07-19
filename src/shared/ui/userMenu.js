/**
 * @fileoverview Menu utilisateur partagé (profil + déconnexion) — un seul
 * bouton avatar avec menu déroulant, réutilisé par le header du dashboard
 * et celui de la carte (Phase H1 : fusionne les 2 icônes séparées).
 */

/** @returns {string} */
export function userMenuHtml() {
  return `
    <div class="user-menu">
      <button class="btn btn--ghost btn--icon user-menu__trigger" id="userMenuBtn"
              type="button" aria-haspopup="true" aria-expanded="false"
              title="Mon compte" aria-label="Mon compte">
        👤
      </button>
      <div class="user-menu__dropdown" id="userMenuDropdown" role="menu" hidden>
        <button class="user-menu__item" id="userMenuProfile" role="menuitem" type="button">Mon profil</button>
        <button class="user-menu__item user-menu__item--danger" id="userMenuLogout" role="menuitem" type="button">Se déconnecter</button>
      </div>
    </div>`;
}

/**
 * Câble l'ouverture/fermeture et les actions du menu. Sans `signal` (pages
 * simples, ex. dashboard) les listeners document se retirent eux-mêmes dès
 * que le conteneur a quitté le DOM. Avec `signal` (carte, cycle de vie geré
 * par AbortController — cf. Phase D2) le nettoyage est immédiat à l'abort.
 *
 * @param {HTMLElement} container
 * @param {{ onProfile: () => void, onLogout: () => void|Promise<void>, signal?: AbortSignal }} handlers
 */
export function wireUserMenu(container, { onProfile, onLogout, signal } = {}) {
  const trigger  = container.querySelector('#userMenuBtn');
  const dropdown = container.querySelector('#userMenuDropdown');
  if (!trigger || !dropdown) return;

  const close = () => { dropdown.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  const open  = () => { dropdown.hidden = false; trigger.setAttribute('aria-expanded', 'true'); };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.hidden ? open() : close();
  }, { signal });

  function onDocClick(e) {
    if (!signal && !document.contains(container)) { document.removeEventListener('click', onDocClick); return; }
    if (!dropdown.hidden && !container.contains(e.target)) close();
  }
  function onDocKey(e) {
    if (!signal && !document.contains(container)) { document.removeEventListener('keydown', onDocKey); return; }
    if (e.key === 'Escape' && !dropdown.hidden) { close(); trigger.focus(); }
  }
  document.addEventListener('click', onDocClick, { signal });
  document.addEventListener('keydown', onDocKey, { signal });

  container.querySelector('#userMenuProfile')?.addEventListener('click', () => { close(); onProfile?.(); }, { signal });
  container.querySelector('#userMenuLogout')?.addEventListener('click', async () => { close(); await onLogout?.(); }, { signal });
}
