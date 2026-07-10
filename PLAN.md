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
- [ ] **E3** — Temps réel : Supabase Realtime (`postgres_changes` sur
      `pins`) pour voir les pins des co-éditeurs sans recharger
- [ ] **E4** — Import GPX (l'export existe déjà)

Dette technique au fil de l'eau :
- [ ] Leaflet chargé à la demande (index.html le charge même pour le
      dashboard) — à déplacer dans `ensureMapAssets`
- [ ] Convertir la carte libre (`user_pins`/localStorage) en roadtrip à
      la connexion — réconcilier les deux modèles de pins
- [ ] Tests E2E Playwright (login → roadtrip → pin → partage)
- [ ] Remonter les erreurs front (table Supabase ou Sentry)

### Reste côté compte Supabase (hors code)

- [x] Exécuter `016_legacy_tables.sql` dans le SQL Editor — fait le 2026-07-09
- [x] Exécuter `017_cache_purge.sql` — fait le 2026-07-07, job n°1
- [x] `npx supabase login` puis
      `npx supabase link --project-ref cmgrszuyzdrmnddyetfq` — fait le
      2026-07-09 ; les Edge Functions se déploient désormais via
      `npx supabase functions deploy <nom>`
- [ ] Lundi 2026-07-13 : vérifier la purge —
      `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 3;`
- [ ] Créer les 2 secrets GitHub du workflow migrations
      (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) — l'historique
      CLI est déjà synchronisé (001→018), `db push` no-op vérifié

## Ordre recommandé

**A → C1-C2 → B → C3-C4 → D1 → D2/D3/D4 au choix.**

Notes :
- La philosophie « zéro build » est conservée. Si TypeScript ou des imports npm
  côté front deviennent nécessaires un jour, Vite s'insérera après la phase B.
- Chaque étape de B laisse l'app fonctionnelle — on peut s'arrêter n'importe où
  sans dette supplémentaire.
