/**
 * @fileoverview Page de création d'un road trip.
 * Route : #/roadtrips/new (ProtectedRoute)
 *
 * Flow :
 *  1. Titre + description
 *  2. Recherche du point de départ (géocodage Nominatim)
 *  3. Création roadtrip → création pin "start" → redirect map.html?id=
 */

import { authStore }           from '../../features/auth/AuthStore.js';
import { createRoadtrip }      from '../../features/roadtrips/roadtripService.js';
import { createPin }           from '../../features/pins/pinService.js';
import { LocationSearchInput } from '../../features/search/LocationSearchInput.js';
import { toast }               from '../../shared/ui/toast.js';
import { router }              from '../router.js';

/**
 * @param {HTMLElement} container
 */
export function renderCreateRoadtripPage(container) {
  container.innerHTML = `
    <div class="page page--create">

      <header class="create-header">
        <button class="btn btn--ghost btn--sm" id="backBtn">← Retour</button>
        <h1 class="create-header__title">Nouveau road trip</h1>
      </header>

      <main class="create-main">
        <div class="create-card">

          <div class="create-steps">
            <div class="create-step create-step--active" data-step="1">
              <span class="create-step__num">1</span>
              <span class="create-step__label">Infos</span>
            </div>
            <div class="create-step__sep"></div>
            <div class="create-step" data-step="2">
              <span class="create-step__num">2</span>
              <span class="create-step__label">Départ</span>
            </div>
            <div class="create-step__sep"></div>
            <div class="create-step" data-step="3">
              <span class="create-step__num">3</span>
              <span class="create-step__label">Créer</span>
            </div>
          </div>

          <form id="createForm" novalidate>

            <!-- Étape 1 : titre + description -->
            <section class="create-section" id="section1">
              <h2 class="create-section__title">Donne un nom à ton aventure</h2>

              <label class="form-field">
                <span class="form-field__label">Titre du road trip *</span>
                <input class="form-field__input" type="text" id="tripTitle"
                       placeholder="Ex : Jura sauvage 2025" maxlength="80" required>
                <span class="form-field__error" id="titleErr"></span>
              </label>

              <label class="form-field">
                <span class="form-field__label">Description <small>(facultatif)</small></span>
                <textarea class="form-field__input form-field__textarea" id="tripDesc"
                          placeholder="Quelques mots sur ce voyage…" rows="3" maxlength="300"></textarea>
              </label>

              <div class="create-actions">
                <button class="btn btn--primary" type="button" id="nextStep1">
                  Continuer →
                </button>
              </div>
            </section>

            <!-- Étape 2 : point de départ -->
            <section class="create-section" id="section2" hidden>
              <h2 class="create-section__title">Où commence ton voyage ?</h2>
              <p class="create-section__hint">
                Optionnel — tu pourras le définir plus tard depuis la carte.
              </p>

              <div class="form-field">
                <span class="form-field__label">Point de départ</span>
                <div id="locationSearchMount"></div>
              </div>

              <div class="create-actions">
                <button class="btn btn--ghost" type="button" id="prevStep2">← Retour</button>
                <button class="btn btn--primary" type="button" id="nextStep2">
                  Continuer →
                </button>
              </div>
            </section>

            <!-- Étape 3 : récapitulatif + création -->
            <section class="create-section" id="section3" hidden>
              <h2 class="create-section__title">Prêt à partir ?</h2>

              <div class="create-recap" id="createRecap"></div>

              <div id="createAlert" class="alert alert--error" hidden role="alert"></div>

              <div class="create-actions">
                <button class="btn btn--ghost" type="button" id="prevStep3">← Retour</button>
                <button class="btn btn--primary" type="submit" id="createSubmit">
                  🚀 Créer mon road trip
                </button>
              </div>
            </section>

          </form>
        </div>
      </main>
    </div>`;

  // ── Refs ────────────────────────────────────────────────────────────────
  const titleInput   = container.querySelector('#tripTitle');
  const descInput    = container.querySelector('#tripDesc');
  const titleErr     = container.querySelector('#titleErr');
  const section1     = container.querySelector('#section1');
  const section2     = container.querySelector('#section2');
  const section3     = container.querySelector('#section3');
  const alertEl      = container.querySelector('#createAlert');
  const submitBtn    = container.querySelector('#createSubmit');
  const recapEl      = container.querySelector('#createRecap');

  // ── LocationSearchInput ─────────────────────────────────────────────────
  const lsiMount = container.querySelector('#locationSearchMount');
  const lsi      = new LocationSearchInput(lsiMount, {
    placeholder: 'Ville, région, lieu…',
  });

  // ── Stepper ─────────────────────────────────────────────────────────────
  function goTo(n) {
    [section1, section2, section3].forEach((s, i) => { s.hidden = i !== n - 1; });
    container.querySelectorAll('.create-step').forEach((el, i) => {
      el.classList.toggle('create-step--active',   i + 1 === n);
      el.classList.toggle('create-step--done',     i + 1 <  n);
    });
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  container.querySelector('#backBtn').addEventListener('click', () => router.navigate('dashboard'));

  container.querySelector('#nextStep1').addEventListener('click', () => {
    const title = titleInput.value.trim();
    if (!title) { titleErr.textContent = 'Le titre est requis.'; titleInput.focus(); return; }
    titleErr.textContent = '';
    goTo(2);
  });

  container.querySelector('#prevStep2').addEventListener('click', () => goTo(1));

  container.querySelector('#nextStep2').addEventListener('click', () => {
    updateRecap();
    goTo(3);
  });

  container.querySelector('#prevStep3').addEventListener('click', () => goTo(2));

  // ── Récap ────────────────────────────────────────────────────────────────
  function updateRecap() {
    const title    = titleInput.value.trim();
    const desc     = descInput.value.trim();
    const location = lsi.getValue();

    recapEl.innerHTML = `
      <div class="recap-item">
        <span class="recap-item__label">Titre</span>
        <span class="recap-item__value">${title}</span>
      </div>
      ${desc ? `<div class="recap-item">
        <span class="recap-item__label">Description</span>
        <span class="recap-item__value">${desc}</span>
      </div>` : ''}
      <div class="recap-item">
        <span class="recap-item__label">Point de départ</span>
        <span class="recap-item__value">
          ${location ? `📍 ${location.label}` : '<em>Non défini</em>'}
        </span>
      </div>`;
  }

  // ── Soumission ───────────────────────────────────────────────────────────
  container.querySelector('#createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.hidden       = true;
    submitBtn.disabled   = true;
    submitBtn.textContent = '⏳ Création en cours…';

    const { user } = authStore.getState();
    const location = lsi.getValue();
    const title    = titleInput.value.trim();
    const desc     = descInput.value.trim();

    try {
      // 1. Créer le roadtrip
      const trip = await createRoadtrip({
        title,
        description: desc,
        startLabel:  location?.label  ?? '',
        startLat:    location?.lat    ?? null,
        startLng:    location?.lng    ?? null,
        userId:      user.id,
      });

      // 2. Créer le pin "start" si point de départ défini
      if (location) {
        await createPin({
          roadtripId:  trip.id,
          type:        'start',
          title:       'Point de départ',
          description: location.label,
          lat:         location.lat,
          lng:         location.lng,
          createdBy:   user.id,
        });
      }

      toast.success(`Road trip "${title}" créé ! 🎉`);

      // 3. Redirection vers la carte
      setTimeout(() => {
        window.location.href = `map.html?id=${trip.id}${location ? '&onboard=true' : ''}`;
      }, 800);

    } catch (err) {
      alertEl.textContent  = err?.message ?? 'Une erreur est survenue.';
      alertEl.hidden       = false;
      submitBtn.disabled   = false;
      submitBtn.textContent = '🚀 Créer mon road trip';
      toast.error('La création a échoué.');
    }
  });

  // ── Cleanup ──────────────────────────────────────────────────────────────
  // Le LocationSearchInput est détruit quand la page est remplacée
  const obs = new MutationObserver(() => {
    if (!document.contains(container)) { lsi.destroy(); obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: false });
}
