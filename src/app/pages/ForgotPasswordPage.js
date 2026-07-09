/**
 * @fileoverview Page "Mot de passe oublié".
 * Envoie un email de réinitialisation via Supabase.
 * L'URL de redirection (window.location.origin + '/') doit être
 * whitelistée dans Supabase → Authentication → URL Configuration.
 */

import { resetPasswordForEmail } from '../../features/auth/authService.js';

export function renderForgotPasswordPage(container) {
  container.innerHTML = `
    <div class="page page--auth">
      <div class="auth-card">
        <div class="auth-card__header">
          <a class="auth-back" href="#/login">← Retour à la connexion</a>
          <h1 class="auth-card__title">Mot de passe oublié</h1>
          <p class="auth-card__sub">
            Entre ton email et on t'envoie un lien de réinitialisation.
          </p>
        </div>

        <div id="authAlert"   class="alert alert--error"   hidden role="alert"></div>
        <div id="authSuccess" class="alert alert--success" hidden role="status"></div>

        <form class="auth-form" id="forgotForm" novalidate>
          <label class="form-field">
            <span class="form-field__label">Email</span>
            <input class="form-field__input" type="email" id="forgotEmail"
                   autocomplete="email" required placeholder="toi@exemple.fr">
            <span class="form-field__error" id="forgotEmailErr"></span>
          </label>

          <button class="btn btn--primary btn--full" type="submit" id="forgotSubmit">
            Envoyer le lien
          </button>
        </form>

        <p class="auth-card__footer">
          Tu te souviens ?
          <a class="auth-link" href="#/login">Se connecter</a>
        </p>
      </div>
    </div>`;

  const form      = container.querySelector('#forgotForm');
  const alertEl   = container.querySelector('#authAlert');
  const successEl = container.querySelector('#authSuccess');
  const submitBtn = container.querySelector('#forgotSubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.hidden   = true;
    successEl.hidden = true;

    const email = container.querySelector('#forgotEmail').value.trim();
    const emailErr = container.querySelector('#forgotEmailErr');

    if (!email) {
      emailErr.textContent = 'Email requis.';
      return;
    }
    emailErr.textContent = '';

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Envoi…';

    const { error } = await resetPasswordForEmail(email);

    if (error) {
      alertEl.textContent = error;
      alertEl.hidden      = false;
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Envoyer le lien';
    } else {
      form.hidden           = true;
      successEl.textContent = 'Email envoyé ! Vérifie ta boîte de réception.';
      successEl.hidden      = false;
    }
  });
}
