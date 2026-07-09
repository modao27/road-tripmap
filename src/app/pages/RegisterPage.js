/**
 * @fileoverview Page d'inscription.
 */

import { signUp }    from '../../features/auth/authService.js';

export function renderRegisterPage(container) {
  container.innerHTML = `
    <div class="page page--auth">
      <div class="auth-card">
        <div class="auth-card__header">
          <a class="auth-back" href="#/">← Accueil</a>
          <h1 class="auth-card__title">Créer un compte</h1>
          <p class="auth-card__sub">Rejoins des milliers de voyageurs outdoor.</p>
        </div>

        <div id="authAlert" class="alert alert--error" hidden role="alert"></div>
        <div id="authSuccess" class="alert alert--success" hidden role="status"></div>

        <form class="auth-form" id="registerForm" novalidate>
          <label class="form-field">
            <span class="form-field__label">Email</span>
            <input class="form-field__input" type="email" id="regEmail"
                   autocomplete="email" required placeholder="toi@exemple.fr">
            <span class="form-field__error" id="regEmailErr"></span>
          </label>

          <label class="form-field">
            <span class="form-field__label">Mot de passe</span>
            <div class="form-field__pw-wrap">
              <input class="form-field__input" type="password" id="regPassword"
                     autocomplete="new-password" required placeholder="Min. 6 caractères">
              <button class="btn-eye" type="button" aria-label="Afficher le mot de passe"
                      data-target="regPassword">👁</button>
            </div>
            <span class="form-field__error" id="regPwErr"></span>
          </label>

          <label class="form-field">
            <span class="form-field__label">Confirmer le mot de passe</span>
            <div class="form-field__pw-wrap">
              <input class="form-field__input" type="password" id="regConfirm"
                     autocomplete="new-password" required placeholder="Répète ton mot de passe">
              <button class="btn-eye" type="button" aria-label="Afficher le mot de passe"
                      data-target="regConfirm">👁</button>
            </div>
            <span class="form-field__error" id="regConfirmErr"></span>
          </label>

          <button class="btn btn--primary btn--full" type="submit" id="regSubmit">
            Créer mon compte
          </button>
        </form>

        <p class="auth-card__footer">
          Déjà un compte ?
          <a class="auth-link" href="#/login">Se connecter</a>
        </p>
      </div>
    </div>`;

  const form       = container.querySelector('#registerForm');
  const alertEl    = container.querySelector('#authAlert');
  const successEl  = container.querySelector('#authSuccess');
  const submitBtn  = container.querySelector('#regSubmit');

  container.querySelectorAll('.btn-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = container.querySelector(`#${btn.dataset.target}`);
      input.type  = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '👁' : '🙈';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.hidden  = true;
    successEl.hidden = true;

    const email    = container.querySelector('#regEmail').value.trim();
    const password = container.querySelector('#regPassword').value;
    const confirm  = container.querySelector('#regConfirm').value;

    let valid = true;

    if (!email) {
      container.querySelector('#regEmailErr').textContent = 'Email requis.';
      valid = false;
    } else {
      container.querySelector('#regEmailErr').textContent = '';
    }

    if (password.length < 6) {
      container.querySelector('#regPwErr').textContent = 'Minimum 6 caractères.';
      valid = false;
    } else {
      container.querySelector('#regPwErr').textContent = '';
    }

    if (password !== confirm) {
      container.querySelector('#regConfirmErr').textContent = 'Les mots de passe ne correspondent pas.';
      valid = false;
    } else {
      container.querySelector('#regConfirmErr').textContent = '';
    }

    if (!valid) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Création…';

    const { user, error } = await signUp(email, password);

    if (error) {
      alertEl.textContent = error;
      alertEl.hidden      = false;
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Créer mon compte';
      return;
    }

    // Si confirmation email désactivée → user connecté directement
    if (user?.confirmed_at || user?.email_confirmed_at) {
      // AuthStore détectera la session → redirection auto
    } else {
      // Email de confirmation envoyé
      successEl.textContent = '✅ Un email de confirmation t\'a été envoyé. Vérifie ta boîte mail.';
      successEl.hidden      = false;
      submitBtn.textContent = 'Email envoyé';
    }
  });
}
