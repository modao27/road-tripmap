/**
 * @fileoverview Page d'accueil publique.
 */

import { router } from '../router.js';

export function renderHomePage(container) {
  container.innerHTML = `
    <div class="page page--home">
      <header class="home-hero">
        <div class="home-hero__content">
          <div class="home-hero__badge">🗺️ Road Trip Map</div>
          <h1 class="home-hero__title">Ta carte outdoor,<br>toujours avec toi.</h1>
          <p class="home-hero__sub">
            Planifie tes aventures, repère cascades, refuges et via ferratas,
            partage tes itinéraires.
          </p>
          <div class="home-hero__actions">
            <button class="btn btn--primary btn--lg" id="heroRegister">
              Commencer gratuitement
            </button>
            <button class="btn btn--ghost btn--lg" id="heroLogin">
              Se connecter
            </button>
          </div>
        </div>
      </header>

      <section class="home-features">
        <div class="feature-card">
          <span class="feature-card__icon">📍</span>
          <h3>Pins personnalisés</h3>
          <p>Ajoute tes propres points d'intérêt avec descriptions, photos et conseils.</p>
        </div>
        <div class="feature-card">
          <span class="feature-card__icon">🔍</span>
          <h3>Découverte OSM</h3>
          <p>Trouve refuges, sources, panoramas et via ferratas autour de toi.</p>
        </div>
        <div class="feature-card">
          <span class="feature-card__icon">🗺</span>
          <h3>Itinéraires</h3>
          <p>Construis ton road trip étape par étape avec calcul de distance.</p>
        </div>
      </section>
    </div>`;

  container.querySelector('#heroRegister').addEventListener('click', () => router.navigate('register'));
  container.querySelector('#heroLogin').addEventListener('click',    () => router.navigate('login'));
}
