# Plan d'amélioration — road-tripmap

> Établi le 2026-07-07 après audit complet du projet.
> Trois phases livrables indépendamment, commits atomiques à chaque étape.
> Cocher les cases au fur et à mesure.

## Contexte (résumé de l'audit)

Le projet contient **deux codebases parallèles** : la carte legacy (`js/` + `map.html`,
~3 300 lignes) et la SPA (`src/` + `index.html`, structure features/services propre).
La jonction est fragile : redirection `window.location` + pont de session
`sessionStorage['rta-session']` relu par un 3ᵉ client Supabase.
Les deux arborescences étant des **ES modules natifs**, `js/` peut importer depuis
`src/` — la migration peut donc être progressive, l'app restant fonctionnelle à
chaque commit.

Déjà fait (2026-07-07) :
- [x] Favicon 1,46 Mo → 19,7 Ko (`106936b`)
- [x] CDN épinglés (supabase-js 2.110.1) + hash SRI (`f2ca504`)
- [x] Logs de diagnostic retirés des Edge Functions + redéploiement (`9756007`)

---

## Phase A — Sécurité : échappement HTML (~1 séance)

**Objectif** : éliminer le XSS stocké livré via les cartes partagées (`?map=slug`)
et durcir tous les rendus de données externes. Les ~50 `innerHTML` du projet ne sont
pas tous vulnérables : seuls ceux qui interpolent des données utilisateur ou d'API
sont à traiter.

- [x] **A1** — Helper `escapeHtml()` + `safeUrl()` dans `src/shared/utils/escape.js`,
      importé aussi par les modules `js/` (import cross-arborescence) — `7efed0f`
- [x] **A2** — `popupHtml` (`js/pins.js`) : `name`, `description`, `interest`,
      `tip`, `mood`, `id` échappés — vecteur principal du XSS stocké — `41cf305`
- [x] **A3** — Rendus de données externes : Nominatim (geocode pin + onboarding),
      Overpass (`safeUrl` sur le tag `website`), DATAtourisme (popup + nearby),
      Wikivoyage, liste des lieux + highlight (`filters.js`), itinéraire
      (`routePlanner.js`) — `b5fe46f`, `43ae36d`, `96e9420`
      (`share.js` utilisait déjà textContent — rien à faire)
- [x] **A4** — Côté SPA : `RoadtripCard`, `PinPopup`, `PinList`, `PinDetailsPanel`,
      `LocationSearchInput`, `RoadtripHeader`, `DashboardPage`, `ProfilePage`
      (aperçu avatar reconstruit via DOM, sans onerror inline) — `1881686`
- [x] **A5** — Vérification : 12 assertions Node sur les fonctions de rendu pures
      (escapeHtml/safeUrl, popupHtml legacy, PinPopup, RoadtripCard) avec payloads
      `<img onerror>`, sortie d'attribut et `javascript:` — toutes passent.
      Reste à valider en navigateur : pin nommé `<img src=x onerror=alert(1)>` →
      partage → ouverture du lien en navigation privée

## Phase B — Architecture : fusionner `js/` dans la SPA (~3-5 séances)

| # | Étape | Risque |
|---|---|---|
| B1 | Dédupliquer les modules purs : `js/` importe config, storage, categories, service Overpass depuis `src/` ; supprimer les copies legacy (`CONFIG` de `js/app.js` ← `MAP_CONFIG` de `src/config/`) | Faible |
| B2 | Un seul client Supabase : remplacer les 2 clients de `js/supabase.js` + cache de token manuel par `src/shared/lib/supabaseClient.js` ; les CRUD déménagent dans `src/features/` | Moyen — retester le flux auth mobile (race condition JWT connue) |
| B3 | Extraire la logique pure restante vers `src/features/` : datatourisme, routePlanner (séparer OSRM/GPX du DOM), share | Faible |
| B4 | Découper `js/app.js` (901 lignes) : état / wiring onglets / rendu | Moyen |
| B5 | Porter la carte dans la SPA : page `MapPage` avec le markup de `map.html`, route `#/roadtrips/:id` rendue directement (fin de la redirection), route `#/map` pour la carte libre | Élevé — dernière étape |
| B6 | Nettoyage : supprimer `js/`, réduire `map.html` à une redirection (compat anciens liens `map.html?map=slug`), supprimer le pont `sessionStorage` | Faible |

- [x] B1 — Dédupliquer les modules purs — `9f9d2bb` (config), `7394274` (storage),
      `058c0d6` (categories → src/config, fin de la dépendance src → js de
      bootstrap.js), `3a58aaa` (service Overpass canonique + 11 tests, −115 lignes)
- [x] B2 — Client Supabase unique — `34f2073` (CRUD éditeur carte dans
      pinService/roadtripService + fix persistance user_created), `48353f1`
      (js/supabase.js : 267 → ~55 lignes, adaptateur de ré-exports ; fin des
      2 clients supplémentaires et du cache de token manuel).
      ⚠ RLS des tables legacy (user_pins, place_overrides, shared_maps) non
      versionnées — à valider en navigateur connecté (sync pin perso)
- [x] B3 — Extraire datatourisme / routePlanner / share — `b43b148`
      (datatourismeService : catégories + fetch Edge Function, partagé entre
      l'onglet Découvrir et l'enrichissement popup), `2f7e1bd` (routingService :
      OSRM, haversine, optimisation, GPX + 11 tests), `14a97c5` (titleToSlug /
      buildShareUrl dans sharingService + 4 tests).
      Note : src/features/sources/enrichmentService.js (CamptoCamp /
      refuges.info) est du code mort jamais importé — à supprimer en B6
- [x] B4 — Découper js/app.js : 877 → 588 lignes — `2028fcc` (Wikivoyage :
      service src/features/sources + js/wikivoyage.js + 4 tests), `a86abd4`
      ('Aux alentours' → js/datatourisme.js), `c7ee3b6` (onboarding →
      js/onboarding.js, callback onPlaceCreated), `19f0722` (switch
      OSM/Tourisme → js/discover.js)
- [x] B5 — MapPage dans la SPA — `7f36998` (initMapApp(mapParam) exporté,
      entrée map.html séparée, hash préservé dans les replaceState), `7e37ed2`
      (markup → src/features/map/mapPageTemplate.js, map.html devient une
      coquille), `d432338` (MapPage + routes #/roadtrips/:id, #/map,
      #/map/:slug ; assets chargés à la demande ; sémantique reload-on-exit
      conservée pour éviter le double-wiring des listeners document ;
      liens dashboard et buildShareUrl au format SPA)
- [x] B6 — Suppression de js/ + compat liens — `3d2d421` (les 15 modules carte
      → src/features/map/ en git mv, adaptateur js/supabase.js remplacé par
      les imports directs des services + src/shared/lib/session.js ; map.html
      devient une redirection ?map= → routes SPA), `3db50da` (purge du code
      mort : bootstrap.js, maps/, editor/ + editor.css, PinPopup,
      LocationSearchInput, enrichmentService… ; README réécrit).
      **La double codebase n'existe plus.**

**Gains** : plus de double codebase, un seul client Supabase (fin des bugs de
session inter-onglets), chaque évolution ne se code qu'une fois.

## Phase C — Hygiène et outillage (~1-2 séances, parallélisable avec B)

- [x] **C1** — `package.json` en devDependencies uniquement (déploiement toujours
      sans build) : ESLint flat config + Vitest + happy-dom, scripts `lint` /
      `test` / `test:watch` / `serve`. Lint à 0 erreur (10 warnings unused-vars
      legacy, à purger en phase B) — `1717cbf`
- [x] **C2** — 25 tests Vitest (~0,7 s) : `escapeHtml`/`safeUrl`, `isUUID`/
      `generateUUID`/localStorage, `router.resolve`, rendus PinPopup /
      RoadtripCard / popupHtml legacy avec payloads XSS (non-régression
      phase A). Requêtes Overpass et export GPX : à couvrir en phase B quand
      la logique sera extraite du DOM — `41720cc`
- [x] **C3** — Supabase CLI en devDependency + `config.toml` committé — `e36e9a1`.
      Reste côté compte : `npx supabase login` puis
      `npx supabase link --project-ref cmgrszuyzdrmnddyetfq` (une fois)
- [x] **C4** — Migration 016 : tables legacy (user_pins, place_overrides,
      shared_maps) versionnées avec RLS — un nouvel environnement se
      reconstruit en rejouant 001→017, l'objectif de la baseline est atteint
      sans squash. Migration 017 : purge pg_cron hebdo des 3 caches — `e36e9a1`.
      017 exécutée en prod le 2026-07-07 (job pg_cron n°1 planifié ✅)

## Phase D — Suite (post-audit)

Pistes identifiées après clôture de l'audit, par ordre de valeur/effort.

- [x] **D1** — CI GitHub Actions : `npm run lint` + `npm test` sur chaque
      push / pull request — `849397a` (workflow Node 24, cache npm),
      `0d29e72` (purge des 7 warnings no-unused-vars + `--max-warnings 0` :
      la CI échoue au moindre warning). Badge CI dans le README
- [x] **D2** — Vraie navigation SPA sur la carte — `921ba4f` (AbortSignal
      optionnel dans les 6 modules qui posent des listeners document),
      `511f739` (mapApp propage le signal + destroy()), `72bfc4e`
      (MapPage possède l'AbortController et retourne le démontage :
      abort + map.remove() + style.css désactivé + document.title
      restauré ; main.js appelle pageCleanup au lieu de location.reload).
      ⚠ À valider en navigateur : aller-retours dashboard ↔ carte ↔
      roadtrip, pas de doublons (popups, toasts, Ctrl+F, Escape),
      scroll du dashboard intact après visite de la carte
- [x] **D3** — Mode hors-ligne (PWA) — `8aee7de` (manifest + icônes
      192/512, app installable), `871a145` (service worker : app shell
      et CDN en stale-while-revalidate, tuiles cache-first plafonné à
      800 entrées, API données jamais interceptées).
      Trois correctifs suite aux tests terrain : `b0a9c8b` (miroir
      localStorage des pins/infos roadtrip — ils n'avaient aucun repli
      local), `588e4a6` (démarrage plafonné à ~3,5 s au lieu des ~10 s
      de retries du refresh JWT), `ce4a3b5` (session en localStorage —
      sessionStorage mourait à la fermeture → redirection /login hors
      ligne ; repli optimiste sur la session stockée).
      Validée hors ligne le 2026-07-10 ✅ (app + pins + tuiles + session)
- [x] **D4** — Étendre la couverture de tests DOM (happy-dom) : 76 tests.
      `0d82d56` (filters.js : pills/légende/liste, tri, highlight,
      XSS coupé par le highlight), `a310a84` (ui.js : toasts, sync,
      focus trap, resizer avec non-régression du démontage D2 par
      AbortSignal), `f55bf97` (share.js : modale de confirmation de
      carte partagée, sharingService mocké).
      La partie DOM de routePlanner/pins nécessite un stub Leaflet —
      reportée, le cœur (routingService, popupHtml) est déjà couvert

## Phase E — Produit (établie le 2026-07-09)

Ordre retenu : **E1 → D3 (PWA) → E2**, le reste au fil de l'eau.

- [x] **E1** — Planning par jour — `84ec493` (migration 018 : colonne
      `pins.day`, appliquée en prod ✅ — vérifiée par REST), `4a96e9f`
      (legs OSRM par tronçon + 3 tests), `53cf875` (updatePinOrder
      persiste la journée), `0c11111` (UI : bouton 📅 + Jour, en-têtes
      Jour N avec distance/durée du jour, drag & drop inter-jours,
      optimisation par jour, partage ?rdays=).
      Validée en navigateur le 2026-07-10 ✅
- [x] **E2** — Météo outdoor — `afcaebc` (weatherService : Open-Meteo
      7 jours, codes WMO, cache par cellule 0.1°, 5 tests), `f0eb9c1`
      (bande météo compacte dans toutes les popups de lieux, tooltip
      pluie ≥ 30 %, silencieuse hors ligne).
      ⚠ À valider en navigateur : ouvrir une popup → bande 7 jours
      sous la catégorie ; deux pins proches = une seule requête (réseau)
- [x] **E3** — Temps réel — `3873086` (migration 019 : pins publiée sur
      Realtime — première migration déployée par la CI), `fe4f37a`
      (abonnement par roadtrip, insert/update/delete des co-équipiers
      appliqués à la carte et à l'itinéraire sans recharger, anti-boucle
      sur les échos de nos propres écritures, désabonnement au démontage).
      Validée le 2026-07-10 ✅ (2 onglets, migration 019 déployée par
      la CI au premier push)
- [x] **E4** — Import GPX — `8456c68` (gpxService : parsing pur GPX
      1.0/1.1, waypoints + tracé + longueur, 6 tests), `92bdd0e`
      (bouton 📂 dans l'onglet Road Trip : tracé pointillé violet sur
      couche dédiée, waypoints → « Ajouter à ma carte », fitBounds,
      toast récapitulatif).
      Validée le 2026-07-10 ✅

## Phase F — UX des popups de pins (établie le 2026-07-10)

Constat : 12 blocs empilés au même niveau (titre, catégorie, météo,
chips, description, Wikivoyage, intérêt, conseil, ambiance,
DATAtourisme, OSM, boutons), tout se charge à l'ouverture, pas de
hauteur max globale, boutons d'édition surdimensionnés — illisible et
inadapté au mobile. Principe : 3 niveaux de lecture (identifier/agir →
comprendre → explorer), une seule action primaire.

- [x] **P1** — Restructurer la popup — `d6fe25a` (a+b : en-tête compact,
      action itinéraire unique, icônes de pied, description clampée à
      4 lignes/tap pour déplier, Intérêt/Conseil/Ambiance dans un repli
      « En savoir plus » ; +2 tests), `8613dc0` (c : Wikivoyage et
      Aux alentours en `<details>` uniformes, **fetch au dépliage** —
      2 requêtes économisées par popup non consultée), `6debfa8`
      (d : corps scrollable ≤ 46vh, mobile 82vw/36vh, croix 32px,
      double scroll wiki supprimé).
      Validée le 2026-07-10 ✅ (desktop + mobile, mode sombre compris)
- [x] **P2** — Mobile : bottom sheet — `a94b0d1` (popup Leaflet
      reparentée et dockée en bas via .sheet-popup, poignée, swipe
      bas = réduire/fermer, swipe haut ou tap = étendre 32vh → 64vh ;
      même contenu et câblage, desktop inchangé). Corrections P1 au
      passage : `b67096a` (ResizeObserver — la popup ne sort plus de
      l'écran au dépliage des replis), `897f4c9` (variantes sombres
      des nouveaux blocs).
      Validée le 2026-07-10 ✅
- [x] **P3** — Polish — `53ffeab` (squelettes shimmer dans les replis
      et la bande météo — plus de saut de mise en page —, fold-in au
      dépliage, sheet-up à l'ouverture du bottom sheet,
      prefers-reduced-motion respecté)

Garde-fous : tests XSS de popupHtml maintenus verts, délégations
data-* conservées, popup fonctionnelle à chaque commit.

Dette technique au fil de l'eau :
- [x] Leaflet chargé à la demande — `43c6518` (rejoint markercluster
      dans ensureMapAssets ; le dashboard ne paie plus ~150 Ko de carte)
- [x] Convertir la carte libre en roadtrip — `cf5afa4` (bannière
      dashboard quand des pins de carte libre existent ; import ordonné,
      intérêt/conseil/ambiance repliés dans la description, purge de
      l'ancien modèle après conversion, « Ignorer » mémorisé)
- [x] Tests E2E Playwright — `7bd65f8` (3 smoke publics : accueil,
      carte libre complète, inscription ; job e2e dans la CI ;
      `93955ac` : bug du badge itinéraire trouvé par le premier run).
      Extension possible : parcours authentifié (compte de test en
      secret CI)
- [x] Remonter les erreurs front — `6aedfdf` (migration 020 :
      table client_errors insert-only + purge 30 j intégrée au cron ;
      errorReporter : max 5/session, dédoublonné, silencieux).
      ⚠ La 020 partira par la CI au push ; consultation :
      `SELECT * FROM client_errors ORDER BY created_at DESC;`

### Reste côté compte Supabase (hors code)

- [x] Exécuter `016_legacy_tables.sql` dans le SQL Editor — fait le 2026-07-09
- [x] Exécuter `017_cache_purge.sql` — fait le 2026-07-07, job n°1
- [x] `npx supabase login` puis
      `npx supabase link --project-ref cmgrszuyzdrmnddyetfq` — fait le
      2026-07-09 ; les Edge Functions se déploient désormais via
      `npx supabase functions deploy <nom>`
- [x] Purge pg_cron vérifiée — `cron.job_run_details` : status
      `succeeded` ✅. **Le plan est intégralement soldé.**
- [x] Créer les 2 secrets GitHub du workflow migrations
      (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) — faits le
      2026-07-09, validés par les runs Migrations verts (019 déployée
      par la CI)

## Phase G — Refonte « compagnon de voyage » (établie 2026-07-17)

Constat : l'identité visuelle actuelle (vert forêt, sobre) ne correspond
plus à l'ambition du produit — une vitrine qui donne envie d'essayer,
une app qui tient la promesse. Nouvelle palette : #235D7E (bleu
principal), #E8DCC8 (sable), #F08C46 (orange, accent CTA/itinéraires),
#FAF9F6 (fond clair), #1E293B (texte). Mode sombre dérivé (fonds
bleu-nuit, accents conservés), bascule manuelle par-dessus le réglage
système.

Ordre : G0 → G1 → G2 → G3 → G4, ~7-10 séances, commits atomiques, app
fonctionnelle à chaque commit, validation en navigateur (desktop +
téléphone) entre les lots.

- [x] **G0** — Socle de l'identité (~1 séance) : polices Outfit + Inter
      auto-hébergées (sous-jeu latin, `fonts/*.woff2`, zéro requête
      Google Fonts) — `42e18d2` ; `css/tokens.css` (palette claire/sombre
      + nuances hover/teintes/bordures dérivées et vérifiées par calcul,
      pas au jugé) et audit de contraste WCAG AA scripté
      (`src/shared/utils/contrast.js` + 9 tests — confirme que l'orange
      #F08C46 avec texte blanc échoue à 2.46:1 et impose un texte marine
      sur les CTA orange, 5.95:1) — `041f1d1` ; composants de base
      (`css/components.css` : boutons 48px/rayon 12, cards rayon 18,
      transitions + `prefers-reduced-motion`), icônes Lucide en SVG
      inline (`src/shared/ui/icons.js`, zéro dépendance), bascule
      clair/sombre (`src/shared/utils/theme.js` + `themeToggle.js`,
      bouton flottant monté hors `#app` donc persistant entre les
      routes, mémorisation localStorage, script anti-flash synchrone
      dans `<head>`) — `02dd2f9`.
      Validé en navigateur (Playwright) le 2026-07-17 : polices servies
      en 200, aucune erreur console, bascule clair/sombre fonctionnelle
      sur l'accueil et persistante sur `/#/login` ; pages existantes
      (vert forêt) non impactées — le re-skin est G2.
- [x] **G1** — Nouvelle page d'accueil : photos Unsplash (licence
      gratuite, vérifiée photo par photo — plusieurs résultats de
      recherche étaient en Unsplash+ payant, écartés), hero + galerie
      en webp déjà redimensionné par le CDN Unsplash — `142f86c` ;
      icônes supplémentaires + `scrollReveal.js` (révélation au scroll,
      repli immédiat si `prefers-reduced-motion`) — `69c74d3` ; capture
      Playwright de l'app (`scripts/screenshot-home.mjs`, régénérable
      via `npm run screenshot:home`, encodage PNG→WebP par le Chromium
      embarqué faute de cwebp local) — `bc97868` ; `HomePage.js`
      reconstruite section par section (hero, 3 blocs, capture encadrée,
      6 fonctionnalités illustrées, galerie lazy, FAQ en `<details>`
      natifs, footer), `css/home.css` entièrement sur les tokens Phase G,
      suppression du CSS mort de l'ancienne page dans `auth.css`
      (`.home-hero`, `.feature-card`, `.btn--lg`) — `6467916`.
      Validé en navigateur (Playwright) le 2026-07-18 : clair/sombre,
      scroll progressif (20 sections `[data-animate]` révélées), FAQ,
      « Découvrir » (scroll), « Essayer sans compte » → `#/map`, mobile
      390px, aucune requête en échec, aucune erreur console.
      Décision Unsplash tranchée par Paul (« passe à G1 ») : sélection
      faite et intégrée sans validation photo par photo préalable.
- [x] **G2** — Re-skin complet de l'app : correctif de fond d'abord
      (`data-theme` toujours résolu explicitement, plus jamais délégué
      à `prefers-color-scheme` — sinon la bascule manuelle n'aurait
      affecté que les tokens, pas la carte, dont le dark mode est posé
      dans `css/style.css`) — `17a6af1` ; `css/auth.css` +
      `css/dashboard.css` migrés vers les tokens, doublon mort
      `.alert--success` supprimé — `57fd812` ; `css/style.css` (2700
      lignes) migré entièrement — `--forest` → `--color-primary`
      partout SAUF les éléments d'itinéraire (marqueurs numérotés,
      badge mobile, stats, jours, bouton « ajouter », tracé OSRM dans
      `routePlanner.js`) → `--color-accent` orange, conformément au
      brief ; rgba() recolorées teinte par teinte (alpha conservé) ;
      variables de catégorie mortes (`--lake/--rock/--village/--orange`)
      supprimées ; couleurs de catégorie (rouge/violet/marron…)
      volontairement non touchées — sémantique, pas identité de marque ;
      le bloc de dark mode existant (~150 règles) migré vers
      `[data-theme="dark"]` plutôt que supprimé — `2b5cc42` ; derniers
      hex verts recolorés côté JS (tracé de route, cercle de
      géolocalisation, dégradé de cover, textes d'erreur) — `17f344b`.
      Validé en navigateur (Playwright) le 2026-07-18 : carte libre
      clair/sombre, popup de lieu, onglet Road Trip, zéro erreur
      console.
- [x] **G3** — Passe mobile : audit Playwright à 390px (iPhone) sur
      auth/accueil/carte, punch-list précise plutôt qu'au jugé —
      boutons/champs/onglets/replis passés à 44px minimum (auth,
      formulaires, composants) — `016bd1f` ; sidebar, onglets, barre
      d'action, sélecteur de fond, boutons de route et de popup, croix
      de fermeture Leaflet (32px visés au clair mais 24px réellement
      rendus), catégories Découvrir — `d0dae89` (bug préexistant
      corrigé au passage : `.source-btn` référençait des variables
      jamais définies, le bouton actif OSM/Tourisme n'avait donc
      jamais de fond) ; page d'accueil — `80af0ec`. Safe areas
      (encoche) : `viewport-fit=cover` + `env(safe-area-inset-*)` sur
      tout élément fixed/absolute touchant un bord d'écran (bascule
      clair/sombre, hamburger, sidebar mobile, badge itinéraire,
      bottom sheet, pied de carte, nav de la vitrine).
      Volontairement laissés sous 44px : marqueurs Leaflet et
      contrôles de zoom (convention universelle des cartes), liens
      d'attribution légale, liens de texte inline dans une phrase.
      Revalidé par le même audit (Playwright) le 2026-07-18 : plus
      aucune cible manquante hors exceptions ci-dessus ; captures
      mobile (login, sidebar ouverte, popup) sans régression visuelle.
- [x] **G4** — Branding et garde-fous : favicon + icônes PWA redessinés
      (montagnes/route/soleil/oiseaux) aux couleurs exactes des tokens
      — dessinés en SVG, rasterisés via le Chromium de Playwright (pas
      d'outil d'édition d'image sur la machine), `manifest.webmanifest`
      + `theme-color` alignés, version du service worker incrémentée
      pour un rafraîchissement immédiat de l'icône — `d6e47cb`.
      Lighthouse (accessibilité) a trouvé deux vraies régressions
      invisibles à l'œil : `--color-on-accent` et l'usage texte de
      `--color-primary` valaient tous les deux une couleur qui ne
      s'éclaircit pas (ou s'éclaircit à tort) entre les thèmes — texte
      illisible en sombre (2.06:1 et 2.28:1 mesurés, seuil 4.5:1).
      Nouveau token `--color-primary-text` + fixation de
      `--color-on-accent`, tests de contraste étendus pour documenter
      pourquoi — `5d1d21f`. Landmark `<main>` manquant sur l'accueil et
      les 4 pages d'auth, également trouvé par Lighthouse — `e389cf5`.
      Script de captures de référence avant/après
      (`npm run screenshot:reference`) — `cb402bc`.
      Résultat : Lighthouse accessibilité 100/100 sur accueil,
      connexion, inscription et carte (objectif ≥ 95 dépassé).

**Phase G soldée** (G0 → G4, 2026-07-17 au 2026-07-18) : identité
visuelle bleu/sable/orange sur toute l'app (vitrine, auth, dashboard,
carte), clair/sombre cohérent partout, mobile ≥ 44px avec safe areas,
branding et accessibilité validés par Lighthouse. Tous les commits
sont locaux (non poussés) — c'est Paul qui pousse et valide en
navigateur/téléphone, cf. [[road-tripmap-conventions]].

## Ordre recommandé

**A → C1-C2 → B → C3-C4 → D1 → D2/D3/D4 au choix.**

Notes :
- La philosophie « zéro build » est conservée. Si TypeScript ou des imports npm
  côté front deviennent nécessaires un jour, Vite s'insérera après la phase B.
- Chaque étape de B laisse l'app fonctionnelle — on peut s'arrêter n'importe où
  sans dette supplémentaire.
