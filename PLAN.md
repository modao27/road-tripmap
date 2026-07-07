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
- [ ] B4 — Découper js/app.js
- [ ] B5 — MapPage dans la SPA
- [ ] B6 — Suppression de js/ + compat liens

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
- [ ] **C3** — Supabase CLI : `supabase link` + `config.toml` committé, fin du
      copier-coller Dashboard pour déployer les Edge Functions
- [ ] **C4** — BDD : migration baseline consolidée (nouveaux environnements ;
      la prod garde son historique) + job `pg_cron` de purge des 3 tables de cache

## Ordre recommandé

**A → C1-C2 → B → C3-C4.**

Notes :
- La philosophie « zéro build » est conservée. Si TypeScript ou des imports npm
  côté front deviennent nécessaires un jour, Vite s'insérera après la phase B.
- Chaque étape de B laisse l'app fonctionnelle — on peut s'arrêter n'importe où
  sans dette supplémentaire.
