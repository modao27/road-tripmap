/**
 * @fileoverview Page d'accueil publique — vitrine (Phase G1).
 */

import { router } from '../router.js';
import { observeScrollReveal } from '../../shared/ui/scrollReveal.js';
import {
  ICON_MAP_PIN, ICON_IMAGE, ICON_SHARE,
  ICON_CALENDAR, ICON_WIFI_OFF, ICON_USERS, ICON_CLOUD, ICON_DOWNLOAD, ICON_COMPASS,
} from '../../shared/ui/icons.js';

const BLOCS = [
  {
    icon: ICON_MAP_PIN,
    title: 'Construisez votre itinéraire',
    text: 'Ajoutez des lieux depuis la carte, réordonnez-les par glisser-déposer, '
      + 'calculez distance et durée, exportez en GPX.',
  },
  {
    icon: ICON_IMAGE,
    title: 'Retrouvez vos souvenirs',
    text: 'Chaque road trip garde ses lieux, ses notes et ses photos — '
      + 'accessibles même sans réseau, une fois consultés.',
  },
  {
    icon: ICON_SHARE,
    title: 'Partagez vos voyages',
    text: 'Invitez des co-équipiers en temps réel, ou partagez un lien '
      + 'public en lecture seule.',
  },
];

const FEATURES = [
  { icon: ICON_CALENDAR, title: 'Planning par jour', text: 'Organisez l’itinéraire jour par jour, avec distance et durée de chaque étape.' },
  { icon: ICON_WIFI_OFF, title: 'Hors-ligne en pleine montagne', text: 'L’app et les zones déjà consultées restent disponibles sans réseau.' },
  { icon: ICON_USERS, title: 'Collaboration en temps réel', text: 'Les ajouts de vos co-équipiers apparaissent sur la carte sans recharger.' },
  { icon: ICON_CLOUD, title: 'Météo outdoor', text: 'Prévisions à 7 jours directement dans chaque popup de lieu.' },
  { icon: ICON_DOWNLOAD, title: 'Import / export GPX', text: 'Récupérez votre itinéraire ou importez une trace existante.' },
  { icon: ICON_COMPASS, title: 'Explorer autour de vous', text: 'Bivouacs, refuges, cascades, via ferratas — dans une zone que vous dessinez.' },
];

const GALLERY = [
  { file: 'gallery-route',   alt: 'Route de montagne sinueuse face à un sommet enneigé' },
  { file: 'gallery-lac',     alt: 'Lac turquoise entouré de montagnes des Dolomites' },
  { file: 'gallery-refuge',  alt: 'Refuge de montagne isolé au milieu des rochers' },
  { file: 'gallery-cascade', alt: 'Cascade dans une forêt luxuriante' },
  { file: 'gallery-rando',   alt: 'Randonneur sac au dos sur un sentier de crête' },
  { file: 'gallery-village', alt: 'Village de montagne à flanc de colline' },
];

const FAQ = [
  { q: 'C’est gratuit ?', a: 'Oui, entièrement — pas d’abonnement, pas de fonctionnalité payante cachée.' },
  { q: 'Ça marche hors ligne ?', a: 'Une fois consultées, les zones de carte restent disponibles sans réseau, comme les lieux et l’itinéraire déjà enregistrés.' },
  { q: 'On peut être plusieurs sur un road trip ?', a: 'Oui — invitez des co-équipiers : les modifications de chacun apparaissent en temps réel, sans recharger la page.' },
  { q: 'Que deviennent mes données ?', a: 'Elles restent les vôtres : stockage sécurisé, visibles seulement par vous et vos co-équipiers, jamais revendues ni suivies par des traqueurs publicitaires.' },
];

function blocHtml({ icon, title, text }) {
  return `
    <div class="home-bloc" data-animate>
      <span class="home-bloc__icon">${icon}</span>
      <h2 class="home-bloc__title">${title}</h2>
      <p class="home-bloc__text">${text}</p>
    </div>`;
}

function featureHtml({ icon, title, text }) {
  return `
    <div class="home-feature" data-animate>
      <span class="home-feature__icon">${icon}</span>
      <h3 class="home-feature__title">${title}</h3>
      <p class="home-feature__text">${text}</p>
    </div>`;
}

function galleryItemHtml({ file, alt }) {
  return `
    <img class="home-gallery__img" data-animate
         src="images/home/${file}.webp" alt="${alt}" loading="lazy" decoding="async" width="800" height="600">`;
}

function faqItemHtml({ q, a }) {
  return `
    <details class="home-faq__item">
      <summary>${q}</summary>
      <p>${a}</p>
    </details>`;
}

export function renderHomePage(container) {
  container.innerHTML = `
    <div class="page home">
      <header class="home-hero">
        <picture class="home-hero__media">
          <source media="(max-width: 640px)" srcset="images/home/hero-960.webp">
          <img class="home-hero__img" src="images/home/hero-1920.webp"
               alt="Route de montagne menant vers un sommet enneigé"
               width="1920" height="1080" fetchpriority="high">
        </picture>
        <div class="home-hero__scrim"></div>

        <nav class="home-hero__nav">
          <span class="home-hero__badge">🗺️ Road Trip Map</span>
          <button class="home-hero__navlink" id="heroLogin" type="button">Se connecter</button>
        </nav>

        <div class="home-hero__content">
          <h1 class="home-hero__title">Planifiez vos road trips simplement.</h1>
          <p class="home-hero__sub">
            Itinéraire, lieux et souvenirs au même endroit — hors-ligne en montagne,
            à plusieurs, gratuitement.
          </p>
          <div class="home-hero__actions">
            <button class="btn btn--accent" id="heroRegister">Commencer gratuitement</button>
            <button class="btn btn--outline btn--on-photo" id="heroDiscover" type="button">Découvrir ↓</button>
          </div>
          <button class="home-hero__tryfree" id="heroTryFree" type="button">Essayer sans compte →</button>
        </div>
      </header>

      <main>
        <section class="home-blocs" id="blocs">
          ${BLOCS.map(blocHtml).join('')}
        </section>

        <section class="home-showcase" data-animate>
          <div class="home-showcase__frame">
            <div class="home-showcase__bar" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
            <img class="home-showcase__img" src="images/home/app-screenshot.webp"
                 alt="Capture de l'application : carte et itinéraire d'un road trip"
                 loading="lazy" decoding="async" width="1280" height="800">
          </div>
        </section>

        <section class="home-features" id="features">
          <h2 class="home-section-title" data-animate>Pensé pour le terrain</h2>
          <div class="home-features__grid">
            ${FEATURES.map(featureHtml).join('')}
          </div>
        </section>

        <section class="home-gallery">
          <h2 class="home-section-title" data-animate>Ça donne envie de partir</h2>
          <div class="home-gallery__grid">
            ${GALLERY.map(galleryItemHtml).join('')}
          </div>
        </section>

        <section class="home-faq" id="faq">
          <h2 class="home-section-title" data-animate>Questions fréquentes</h2>
          <div class="home-faq__list" data-animate>
            ${FAQ.map(faqItemHtml).join('')}
          </div>
        </section>
      </main>

      <footer class="home-footer">
        <p>© ${new Date().getFullYear()} Road Trip Map</p>
        <a href="https://github.com/modao27/road-tripmap" target="_blank" rel="noopener">Code source</a>
      </footer>
    </div>`;

  container.querySelector('#heroRegister').addEventListener('click', () => router.navigate('register'));
  container.querySelector('#heroLogin').addEventListener('click',    () => router.navigate('login'));
  container.querySelector('#heroTryFree').addEventListener('click',  () => router.navigate('map'));
  container.querySelector('#heroDiscover').addEventListener('click', () => {
    container.querySelector('#blocs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  return observeScrollReveal(container);
}
