/**
 * @fileoverview Page profil — affichage et édition du profil utilisateur.
 */

import { authStore }       from '../../features/auth/AuthStore.js';
import { upsertProfile }   from '../../features/auth/profileService.js';
import { toast }           from '../../shared/ui/toast.js';
import { router }          from '../router.js';

/**
 * @param {HTMLElement} container
 */
export function renderProfilePage(container) {
  const { user, profile } = authStore.getState();

  const initials = (() => {
    const name = profile?.display_name || user?.email || '?';
    return name.slice(0, 2).toUpperCase();
  })();

  container.innerHTML = `
    <div class="page page--profile">

      <header class="profile-header">
        <button class="btn btn--ghost btn--sm" id="backBtn">← Dashboard</button>
        <h1 class="profile-header__title">Mon profil</h1>
      </header>

      <main class="profile-main">
        <div class="profile-card">

          <div class="profile-avatar" id="profileAvatar">
            ${profile?.avatar_url
              ? `<img src="${profile.avatar_url}" alt="Avatar" class="profile-avatar__img">`
              : `<span class="profile-avatar__initials">${initials}</span>`}
          </div>

          <div id="profileAlert" class="alert alert--error" hidden role="alert"></div>
          <div id="profileSuccess" class="alert alert--success" hidden role="status"></div>

          <form class="profile-form" id="profileForm" novalidate>

            <label class="form-field">
              <span class="form-field__label">Email</span>
              <input class="form-field__input" type="email"
                     value="${user?.email ?? ''}" disabled>
              <span class="form-field__hint">L'email ne peut pas être modifié ici.</span>
            </label>

            <label class="form-field">
              <span class="form-field__label">Nom affiché</span>
              <input class="form-field__input" type="text" id="displayName"
                     value="${profile?.display_name ?? ''}"
                     placeholder="Ton prénom ou pseudo" maxlength="60">
            </label>

            <label class="form-field">
              <span class="form-field__label">Bio <small>(facultatif)</small></span>
              <textarea class="form-field__input form-field__textarea" id="bio"
                        placeholder="Quelques mots sur toi…"
                        rows="3" maxlength="200">${profile?.bio ?? ''}</textarea>
            </label>

            <label class="form-field">
              <span class="form-field__label">URL d'avatar <small>(facultatif)</small></span>
              <input class="form-field__input" type="url" id="avatarUrl"
                     value="${profile?.avatar_url ?? ''}"
                     placeholder="https://…">
            </label>

            <div class="profile-actions">
              <button class="btn btn--primary" type="submit" id="saveBtn">
                Enregistrer
              </button>
            </div>

          </form>
        </div>
      </main>
    </div>`;

  container.querySelector('#backBtn').addEventListener('click', () => {
    router.navigate('dashboard');
  });

  // Prévisualisation avatar à la saisie de l'URL
  container.querySelector('#avatarUrl').addEventListener('input', e => {
    const url = e.target.value.trim();
    const avatarEl = container.querySelector('#profileAvatar');
    if (url) {
      avatarEl.innerHTML = `<img src="${url}" alt="Avatar" class="profile-avatar__img"
        onerror="this.parentElement.innerHTML='<span class=profile-avatar__initials>${initials}</span>'">`;
    } else {
      avatarEl.innerHTML = `<span class="profile-avatar__initials">${initials}</span>`;
    }
  });

  container.querySelector('#profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    const alertEl   = container.querySelector('#profileAlert');
    const successEl = container.querySelector('#profileSuccess');
    const saveBtn   = container.querySelector('#saveBtn');

    alertEl.hidden   = true;
    successEl.hidden = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Enregistrement…';

    const fields = {
      display_name: container.querySelector('#displayName').value.trim() || null,
      bio:          container.querySelector('#bio').value.trim(),
      avatar_url:   container.querySelector('#avatarUrl').value.trim() || null,
    };

    try {
      await upsertProfile(user.id, fields);
      await authStore.refreshProfile();
      successEl.textContent = 'Profil mis à jour.';
      successEl.hidden = false;
      toast.success('Profil enregistré !');
    } catch (err) {
      alertEl.textContent = err?.message ?? 'Erreur lors de la sauvegarde.';
      alertEl.hidden = false;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Enregistrer';
    }
  });
}
