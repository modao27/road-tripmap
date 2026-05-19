/**
 * @fileoverview Page de réinitialisation du mot de passe.
 * Accessible après que l'utilisateur a cliqué le lien dans son email
 * (événement PASSWORD_RECOVERY → authStore.needsPasswordReset = true).
 */

import { updatePassword } from '../../features/auth/authService.js';
import { authStore }      from '../../features/auth/AuthStore.js';
import { router }         from '../router.js';

export function renderResetPasswordPage(container) {
  container.innerHTML = `
    <div class="page page--auth">
      <div class="auth-card">
        <div class="auth-card__header">
          <h1 class="auth-card__title">Nouveau mot de passe</h1>
          <p class="auth-card__sub">Choisis un mot de passe d'au moins 6 caractères.</p>
        </div>

        <div id="authAlert" class="alert alert--error" hidden role="alert"></div>

        <form class="auth-form" id="resetForm" novalidate>
          <label class="form-field">
            <span class="form-field__label">Nouveau mot de passe</span>
            <div class="form-field__pw-wrap">
              <input class="form-field__input" type="password" id="newPassword"
                     autocomplete="new-password" required placeholder="••••••••"
                     minlength="6">
              <button class="btn-eye" type="button" aria-label="Afficher"
                      data-target="newPassword">👁</button>
            </div>
            <span class="form-field__error" id="newPwErr"></span>
          </label>

          <label class="form-field">
            <span class="form-field__label">Confirmer</span>
            <div class="form-field__pw-wrap">
              <input class="form-field__input" type="password" id="confirmPassword"
                     autocomplete="new-password" required placeholder="••••••••">
              <button class="btn-eye" type="button" aria-label="Afficher"
                      data-target="confirmPassword">👁</button>
            </div>
            <span class="form-field__error" id="confirmPwErr"></span>
          </label>

          <button class="btn btn--primary btn--full" type="submit" id="resetSubmit">
            Mettre à jour le mot de passe
          </button>
        </form>
      </div>
    </div>`;

  container.querySelectorAll('.btn-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = container.querySelector(`#${btn.dataset.target}`);
      input.type  = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '👁' : '🙈';
    });
  });

  const form       = container.querySelector('#resetForm');
  const alertEl    = container.querySelector('#authAlert');
  const submitBtn  = container.querySelector('#resetSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.hidden = true;

    const pw      = container.querySelector('#newPassword').value;
    const confirm = container.querySelector('#confirmPassword').value;
    const pwErr   = container.querySelector('#newPwErr');
    const cfErr   = container.querySelector('#confirmPwErr');

    pwErr.textContent = '';
    cfErr.textContent = '';

    let valid = true;
    if (pw.length < 6)  { pwErr.textContent = 'Minimum 6 caractères.'; valid = false; }
    if (pw !== confirm) { cfErr.textContent = 'Les mots de passe ne correspondent pas.'; valid = false; }
    if (!valid) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Mise à jour…';

    const { error } = await updatePassword(pw);

    if (error) {
      alertEl.textContent = error;
      alertEl.hidden      = false;
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Mettre à jour le mot de passe';
    } else {
      authStore.clearPasswordReset();
      router.navigate('dashboard');
    }
  });
}
