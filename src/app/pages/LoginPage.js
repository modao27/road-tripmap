/**
 * @fileoverview Page de connexion.
 */

import { signIn }    from '../../features/auth/authService.js';
import { authStore } from '../../features/auth/AuthStore.js';

export function renderLoginPage(container) {
  container.innerHTML = `
    <main class="page page--auth">
      <div class="auth-card">
        <div class="auth-card__header">
          <a class="auth-back" href="#/">← Accueil</a>
          <h1 class="auth-card__title">Connexion</h1>
          <p class="auth-card__sub">Bienvenue ! Entre tes identifiants pour continuer.</p>
        </div>

        <div id="authAlert" class="alert alert--error" hidden role="alert"></div>

        <form class="auth-form" id="loginForm" novalidate>
          <label class="form-field">
            <span class="form-field__label">Email</span>
            <input class="form-field__input" type="email" id="loginEmail"
                   autocomplete="email" required placeholder="toi@exemple.fr">
            <span class="form-field__error" id="loginEmailErr"></span>
          </label>

          <label class="form-field">
            <span class="form-field__label">Mot de passe</span>
            <div class="form-field__pw-wrap">
              <input class="form-field__input" type="password" id="loginPassword"
                     autocomplete="current-password" required placeholder="••••••••">
              <button class="btn-eye" type="button" aria-label="Afficher le mot de passe"
                      data-target="loginPassword">👁</button>
            </div>
            <span class="form-field__error" id="loginPwErr"></span>
          </label>

          <p class="auth-card__forgot">
            <a class="auth-link" href="#/forgot-password">Mot de passe oublié ?</a>
          </p>

          <button class="btn btn--primary btn--full" type="submit" id="loginSubmit">
            Se connecter
          </button>
        </form>

        <p class="auth-card__footer">
          Pas encore de compte ?
          <a class="auth-link" href="#/register">Créer un compte</a>
        </p>
      </div>
    </main>`;

  const form      = container.querySelector('#loginForm');
  const alertEl   = container.querySelector('#authAlert');
  const submitBtn = container.querySelector('#loginSubmit');

  // Toggle password visibility
  container.querySelectorAll('.btn-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = container.querySelector(`#${btn.dataset.target}`);
      input.type  = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '👁' : '🙈';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.hidden = true;
    authStore.clearError();

    const email    = container.querySelector('#loginEmail').value.trim();
    const password = container.querySelector('#loginPassword').value;

    // Validation locale
    let valid = true;
    if (!email) {
      container.querySelector('#loginEmailErr').textContent = 'Email requis.';
      valid = false;
    } else {
      container.querySelector('#loginEmailErr').textContent = '';
    }
    if (!password) {
      container.querySelector('#loginPwErr').textContent = 'Mot de passe requis.';
      valid = false;
    } else {
      container.querySelector('#loginPwErr').textContent = '';
    }
    if (!valid) return;

    submitBtn.disabled   = true;
    submitBtn.textContent = 'Connexion…';

    const { error } = await signIn(email, password);

    if (error) {
      alertEl.textContent = error;
      alertEl.hidden      = false;
      submitBtn.disabled   = false;
      submitBtn.textContent = 'Se connecter';
    }
    // Si succès, AuthStore déclenche onAuthChange → router redirige vers /dashboard
  });
}
