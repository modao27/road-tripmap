/**
 * @fileoverview Markup de la page carte (source unique).
 * Injecté par la MapPage de la SPA (src/app/pages/MapPage.js).
 * Markup statique uniquement — aucune donnée interpolée (le menu
 * utilisateur ci-dessous est retiré du DOM par mapApp.js en carte libre
 * anonyme / lecture d'une carte partagée, où il n'y a rien à proposer).
 */

import { userMenuHtml } from '../../shared/ui/userMenu.js';

export const MAP_PAGE_HTML = `
  <main class="app">
    <aside class="sidebar" id="sidebar" aria-label="Navigation carte">

      <!-- En-tête collapsible -->
      <header class="sidebar-header">
        <div class="sidebar-header-top">
          <a class="map-back-link" href="index.html#/dashboard">← Mes road trips</a>
          <div class="sidebar-header-top-actions">
            <button class="btn btn--ghost btn--icon" id="shareButton" type="button" title="Partager cette carte" aria-label="Partager cette carte">🔗</button>
            ${userMenuHtml()}
          </div>
        </div>
        <div class="sidebar-header-main">
          <p class="eyebrow">Carte libre</p>
          <h1>Road trip outdoor dans le Jura</h1>
          <button class="sidebar-collapse-btn" id="sidebarCollapseBtn" type="button" title="Masquer la sidebar" aria-label="Masquer la sidebar">◀</button>
        </div>
        <p class="intro sidebar-intro" id="sidebarIntro">Une carte sans planning imposé pour repérer cascades, belvédères, villages, spots nature et via ferrata autour de Baume-les-Messieurs.</p>
      </header>

      <!-- Onglets -->
      <div class="sidebar-tabs" role="tablist">
        <button class="sidebar-tab active" id="tabPlaces" role="tab" aria-selected="true" aria-controls="tabPanePlaces" type="button">Lieux</button>
        <button class="sidebar-tab" id="tabRoute" role="tab" aria-selected="false" aria-controls="tabPaneRoute" type="button">
          Road Trip <span class="tab-badge" id="tabRouteBadge" hidden>0</span>
        </button>
        <button class="sidebar-tab" id="tabDiscover" role="tab" aria-selected="false" aria-controls="tabPaneDiscover" type="button">
          Découvrir <span class="tab-badge" id="tabDiscoverBadge" hidden>0</span>
        </button>
      </div>

      <div class="sidebar-body">

        <!-- Panneau Lieux -->
        <div class="tab-pane active" id="tabPanePlaces" role="tabpanel" aria-labelledby="tabPlaces">
          <section class="controls" aria-label="Filtres et recherche">
            <!-- Recherche déclenchable -->
            <button class="search-trigger" id="searchToggle" type="button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Rechercher un lieu
            </button>
            <input id="searchInput" class="search" type="search" placeholder="Rechercher un lieu…" aria-label="Recherche de lieu" hidden>
            <!-- Aperçu des filtres actifs, visible même tiroir fermé -->
            <div class="filter-chips" id="filterChipsPreview" aria-label="Filtres actifs"></div>

            <!-- Filtres avec show/hide intégré : replié par défaut (Phase H7),
                 le panneau Lieux ne s'ouvre plus systématiquement sur un mur
                 de filtres — l'aperçu ci-dessus suffit pour voir l'état actif. -->
            <details class="filter-section">
              <summary>
                <span class="filter-summary-label">Filtres <span class="filter-count" id="filterActiveCount"></span></span>
                <svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4,6 8,10 12,6"/></svg>
              </summary>
              <div class="filters" id="filters"></div>
              <div class="legend" id="legend" aria-label="Légende des catégories"></div>
              <div class="filter-footer">
                <button class="filter-footer-btn" id="showAllButton" type="button">tout afficher</button>
                <button class="filter-footer-btn" id="hideAllButton" type="button">tout masquer</button>
              </div>
            </details>

          </section>
          <section class="places-panel">
            <p class="places-title"><span>Lieux visibles</span><span id="visibleCount" aria-live="polite" aria-atomic="true"></span></p>
            <ul class="place-list" id="placeList"></ul>
          </section>
        </div>

        <!-- Panneau Découvrir -->
        <div class="tab-pane" id="tabPaneDiscover" role="tabpanel" aria-labelledby="tabDiscover">

          <!-- Contrôles de recherche -->
          <section class="controls" aria-label="Recherche de points d'intérêt">

            <!-- Switch source de données -->
            <div class="source-switch" role="group" aria-label="Source de données">
              <button class="source-btn active" id="sourceOsm"      type="button">OSM</button>
              <button class="source-btn"        id="sourceTourisme"  type="button">Tourisme officiel 🇫🇷</button>
            </div>

            <!-- Catégories OSM (Overpass) -->
            <div class="overpass-cats" id="osmCats">
              <button class="overpass-cat-btn active" data-overpass-cat="bivouac"     type="button">⛺ Bivouac</button>
              <button class="overpass-cat-btn active" data-overpass-cat="shelter"     type="button">🏠 Refuges</button>
              <button class="overpass-cat-btn"        data-overpass-cat="water"       type="button">💧 Sources</button>
              <button class="overpass-cat-btn"        data-overpass-cat="waterfall"   type="button">🌊 Cascades</button>
              <button class="overpass-cat-btn"        data-overpass-cat="viewpoint"   type="button">🔭 Panoramas</button>
              <button class="overpass-cat-btn"        data-overpass-cat="via_ferrata" type="button">🧗 Via ferrata</button>
              <button class="overpass-cat-btn"        data-overpass-cat="escalade"    type="button">🪨 Escalade</button>
              <button class="overpass-cat-btn"        data-overpass-cat="trailhead"   type="button">🥾 Départs</button>
            </div>

            <!-- Catégories DATAtourisme (masquées par défaut) -->
            <div class="overpass-cats" id="tourismeCats" hidden>
              <button class="overpass-cat-btn active" data-dt-cat="hebergement" type="button">🏕 Hébergement</button>
              <button class="overpass-cat-btn active" data-dt-cat="restaurant"  type="button">🍽 Restauration</button>
              <button class="overpass-cat-btn active" data-dt-cat="evenement"   type="button">🎭 Événements</button>
              <button class="overpass-cat-btn active" data-dt-cat="patrimoine"  type="button">🏛 Patrimoine</button>
            </div>

            <div class="radius-control">
              <div class="radius-header">
                <span class="radius-title">Rayon de recherche</span>
                <strong class="radius-value" id="radiusLabel">10 km</strong>
              </div>
              <input type="range" id="radiusSlider" min="1" max="50" value="10" step="1"
                     class="radius-slider" aria-label="Rayon de recherche en kilomètres">
            </div>

            <div class="overpass-actions">
              <button class="button" id="overpassSearch" type="button">🔍 Chercher dans cette zone</button>
              <button class="secondary" id="overpassClear" type="button" hidden>✕ Effacer les résultats</button>
            </div>
            <p class="overpass-status" id="overpassStatus"></p>
          </section>

          <!-- Résultats -->
          <section class="places-panel">
            <p class="places-title">
              <span>Résultats</span>
              <span id="discoverCount" aria-live="polite" aria-atomic="true"></span>
            </p>
            <ul class="place-list" id="overpassResultList"></ul>
            <p class="discover-empty" id="discoverEmpty">Déplace le cercle sur la carte et lance une recherche.</p>
          </section>

        </div>

        <!-- Panneau Road Trip -->
        <div class="tab-pane" id="tabPaneRoute" role="tabpanel" aria-labelledby="tabRoute">
          <section class="route-panel" id="routePanel">
            <select id="routeMode" class="route-mode-select">
              <option value="driving">🚗 Voiture</option>
              <option value="cycling">🚴 Vélo</option>
              <option value="walking">🚶 À pied</option>
            </select>
            <div class="route-stats" id="routeStats" hidden>
              <span class="route-stat">📏 <strong id="routeDistance">—</strong></span>
              <span class="route-stat">⏱ <strong id="routeDuration">—</strong></span>
              <span class="route-stat" id="routeStepCount"></span>
            </div>
            <ul class="route-steps" id="routeSteps" aria-label="Étapes de l'itinéraire"></ul>
            <p class="route-empty" id="routeEmpty">Ajoute des lieux depuis leurs popups ou les cartes.</p>
            <div class="route-actions">
              <button class="secondary" id="routeAddDay"   type="button"
                      title="Découper l'itinéraire en journées">📅 + Jour</button>
              <button class="secondary" id="routeOptimize" type="button">⚡ Optimiser</button>
              <button class="secondary" id="routeShare"    type="button">🔗 Partager</button>
              <button class="secondary" id="routeGpx"      type="button"
                      title="Exporter l'itinéraire en GPX">📥 GPX</button>
              <button class="secondary" id="routeGpxImport" type="button"
                      title="Afficher un fichier GPX sur la carte">📂 Importer GPX</button>
              <button class="secondary" id="routeClear"    type="button">✕ Effacer</button>
            </div>
            <input type="file" id="gpxFileInput" accept=".gpx,application/gpx+xml" hidden>
          </section>
        </div>

      </div>

      <footer class="footer">
        Fond de carte © OpenStreetMap contributors
        <span id="syncStatus" class="sync-status" hidden></span>
      </footer>
    </aside>

    <div id="resizer" class="resizer" role="separator" aria-orientation="vertical" aria-label="Redimensionner la sidebar"></div>
    <div class="toast-wrap" id="toastWrap" aria-live="polite" aria-atomic="false"></div>

    <section class="map-wrap" aria-label="Carte interactive du Jura">
      <button class="mobile-toggle" id="sidebarToggle" type="button" aria-expanded="false" aria-label="Afficher ou masquer la sidebar">☰</button>
      <button class="sidebar-expand-tab" id="sidebarExpandTab" type="button" title="Afficher la sidebar" aria-label="Afficher la sidebar" hidden>▶</button>

      <!-- Pile flottante haut-centre : sélecteur de mode (toujours visible,
           Phase H5) + bandeaux conditionnels (repositionnement de pin,
           ajout rapide H6) — un conteneur commun pour éviter les
           chevauchements/décalages magiques entre ces éléments. -->
      <div class="map-top-stack">
        <div class="mode-switcher" id="modeSwitcher" role="tablist" aria-label="Mode">
          <button class="mode-btn" data-mode="explore" role="tab" type="button" aria-selected="false">🧭 <span class="mode-btn-label">Explorer</span></button>
          <button class="mode-btn" data-mode="edit" role="tab" type="button" aria-selected="false">✏️ <span class="mode-btn-label">Modifier</span></button>
          <button class="mode-btn" data-mode="roadtrip" role="tab" type="button" aria-selected="false">🗺️ <span class="mode-btn-label">Road Trip</span></button>
        </div>

        <div class="pin-hint" id="pinHint" hidden>Cliquez sur la carte pour placer un pin <button type="button" id="pinHintCancel">Annuler</button></div>

        <!-- Ajout rapide (Phase H6) : ouvert par le FAB 📌, pas de backdrop
             bloquant — recherche ou clic direct sur la carte, le pin est
             créé tout de suite (nom éditable ensuite via la fiche). -->
        <div class="quick-add" id="quickAdd" hidden>
          <div class="geocode-wrap">
            <input type="search" id="quickAddInput" class="quick-add-input"
                   placeholder="Nom, adresse, ville…" autocomplete="off"
                   aria-label="Rechercher un lieu à ajouter">
            <ul id="quickAddResults" class="geocode-results" hidden></ul>
          </div>
          <p class="quick-add-hint">ou clique directement sur la carte
            <button type="button" id="quickAddCancel">Annuler</button>
          </p>
        </div>
      </div>

      <!-- Actions carte : flottantes, accessibles même sidebar masquée (Phase H3) -->
      <div class="map-fabs" aria-label="Actions rapides">
        <button class="map-fab" id="recenterButton" type="button" title="Recentrer sur Baume-les-Messieurs" aria-label="Recentrer sur Baume-les-Messieurs">⌖</button>
        <button class="map-fab" id="geolocateButton" type="button" title="Ma position" aria-label="Ma position">📍</button>
        <button class="map-fab" id="pinModeButton" type="button" title="Ajouter un pin" aria-label="Ajouter un pin">📌</button>
      </div>
      <div class="layer-switcher" id="layerSwitcher" role="group" aria-label="Fond de carte">
        <button class="layer-btn active" data-base="osm" type="button">🗺 Carte</button>
        <button class="layer-btn" data-base="ign" type="button">⛰ IGN</button>
        <button class="layer-btn" data-base="sat" type="button">🛰 Satellite</button>
      </div>
      <button class="route-badge" id="routeBadge" hidden type="button" aria-label="Voir l'itinéraire">
        🗺 <span id="routeBadgeCount">0</span> étape<span id="routeBadgePlural">s</span>
      </button>
      <div id="map"></div>
    </section>
  </main>

  <!-- Bannière carte partagée chargée -->
  <div class="shared-map-banner" id="sharedMapBanner" hidden>
    <span>✅ Carte partagée chargée : <strong id="sharedMapTitle"></strong></span>
    <button type="button" id="sharedMapClose" aria-label="Fermer la bannière">✕</button>
  </div>

  <!-- Modale de confirmation avant chargement -->
  <div class="pin-modal-backdrop" id="sharedMapConfirmBackdrop" hidden>
    <div class="pin-modal" role="dialog" aria-modal="true" aria-labelledby="sharedConfirmHeading">
      <h3 id="sharedConfirmHeading">Carte partagée</h3>
      <p>Afficher la carte <strong id="sharedMapConfirmName"></strong>&nbsp;?</p>
      <p class="shared-confirm-note">Tes pins personnels et ta carte restent intacts — ce chargement n'écrase rien.</p>
      <div class="pin-modal-actions">
        <button class="secondary" id="sharedMapCancelConfirm" type="button">Annuler</button>
        <button class="button"    id="sharedMapLoadConfirm"   type="button">Charger la carte</button>
      </div>
    </div>
  </div>

  <!-- Modale de partage -->
  <div class="pin-modal-backdrop" id="shareModalBackdrop" hidden>
    <div class="pin-modal" role="dialog" aria-modal="true" aria-labelledby="shareModalTitle">
      <h3 id="shareModalTitle">Partager cette carte</h3>
      <label class="pin-field">
        Titre de la carte
        <input type="text" id="shareTitle" placeholder="Ex : Road trip Jura juin 2025" maxlength="80">
      </label>
      <label class="pin-field">
        Description (facultatif)
        <textarea id="shareDesc" placeholder="Notes, contexte, conseils…"></textarea>
      </label>
      <div class="share-includes">
        <p>Ce lien inclura :</p>
        <ul>
          <li>Tes pins personnalisés</li>
          <li>Le centre et le zoom de la carte</li>
          <li>Le fond de carte actif</li>
          <li>Les filtres actifs</li>
        </ul>
      </div>
      <div class="pin-modal-actions">
        <button class="secondary" id="shareCancelBtn" type="button">Annuler</button>
        <button class="button" id="shareConfirmBtn" type="button">Créer le lien</button>
      </div>
    </div>
  </div>

  <div class="pin-modal-backdrop" id="pinModalBackdrop" hidden>
    <div class="pin-modal" role="dialog" aria-modal="true" aria-labelledby="pinModalTitle">
      <h3 id="pinModalTitle">Nouveau pin</h3>
      <div class="pin-field">
        Localisation
        <div class="geocode-wrap">
          <input type="search" id="pinGeocode" class="pin-geocode-input" placeholder="Rechercher une ville, un lieu, une adresse…" autocomplete="off">
          <ul id="geocodeResults" class="geocode-results" hidden></ul>
        </div>
        <div id="pinLocationTag" class="pin-location-tag" hidden>
          <span id="pinLocationLabel"></span>
          <button type="button" id="pinLocationClear" aria-label="Effacer la position">✕</button>
        </div>
        <button type="button" id="pinMapClickBtn" class="pin-map-click-btn">Ou cliquer sur la carte</button>
      </div>
      <label class="pin-field">
        Nom du lieu
        <input type="text" id="pinName" placeholder="Ex : Vue sur la reculée" maxlength="80">
      </label>
      <label class="pin-field">
        Catégorie
        <select id="pinCategory"></select>
      </label>
      <label class="pin-field">
        Note (facultatif)
        <textarea id="pinNote" placeholder="Description, conseil…"></textarea>
      </label>
      <div class="pin-modal-actions">
        <button class="secondary" id="pinCancelBtn" type="button">Annuler</button>
        <button class="button" id="pinConfirmBtn" type="button">Créer le pin</button>
      </div>
    </div>
  </div>

  <!-- Overlay onboard : destination de départ (affiché si ?onboard=true + aucun pin) -->
  <div class="onboard-overlay" id="onboardOverlay" hidden>
    <div class="onboard-card">
      <h2 class="onboard-title">Où commence ton road trip ?</h2>
      <p class="onboard-hint">Cherche ta destination pour centrer la carte et créer ton point de départ.</p>
      <div class="onboard-search-wrap">
        <input type="search" id="onboardSearch" class="onboard-search"
               placeholder="Ville, région, massif…" autocomplete="off">
        <ul id="onboardResults" class="geocode-results onboard-results" hidden></ul>
      </div>
      <button class="secondary onboard-skip" id="onboardSkip" type="button">
        Passer cette étape →
      </button>
    </div>
  </div>
`;
