# Road trip outdoor

Application web de planification de road trip outdoor. La carte agrège plusieurs sources de données en temps réel — OpenStreetMap, données touristiques officielles françaises (DATAtourisme), Wikivoyage — et les enrichit à la volée pour donner un aperçu complet d'une zone avant d'y aller.

Trois modes de travail dans la même interface :
- **Lieux** — 35 POI statiques (bivouacs, via ferratas, cascades, villages…) + pins personnalisés synchronisés sur Supabase
- **Road Trip** — construction d'un itinéraire par drag & drop, calcul d'itinéraire OSRM, export GPX, partage par URL
- **Découvrir** — exploration par zone (cercle draggable) en mode OSM (Overpass) ou Tourisme officiel 🇫🇷 (DATAtourisme)

Les popups des villes et points d'ancrage s'enrichissent automatiquement avec les sections Wikivoyage et les hébergements/restaurants/événements/patrimoine à proximité.

Aucun outil de build — ES modules natifs, Leaflet en CDN, Supabase pour la persistence et les Edge Functions d'enrichissement.

![CI](https://github.com/modao27/road-tripmap/actions/workflows/ci.yml/badge.svg) ![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-brightgreen) ![ES Modules](https://img.shields.io/badge/JS-ES%20Modules-blue) ![Supabase](https://img.shields.io/badge/Supabase-cloud-3ECF8E) ![Build](https://img.shields.io/badge/build-aucun-lightgrey)

---

## Fonctionnalités

### Carte
- **35 lieux préchargés** — cascades, lacs, randonnées, bivouacs, via ferratas, villages, points d'ancrage
- **Filtres par catégorie** avec compteurs dynamiques
- **Recherche textuelle** avec highlight du texte correspondant
- **3 fonds de carte** — OpenStreetMap, IGN topo (Géoportail), satellite (ESRI)
- **Clusters de marqueurs** — regroupement automatique à faible zoom
- **Géolocalisation** — affiche ta position sur la carte
- **Mémoire de la vue** — centre et zoom restaurés au rechargement

### Pins personnalisés
- Ajouter, modifier, supprimer des lieux
- Recherche de localisation via **Nominatim** (OpenStreetMap, sans clé API)
- Placement manuel au clic sur la carte
- Édition des lieux statiques (overrides réinitialisables)
- Persistance locale (localStorage) + synchronisation **Supabase**

### Itinéraire (Road Trip)
- Ajouter des lieux depuis les popups ou la liste
- Réordonnancement par **drag & drop**
- Tracé automatique via **OSRM** (voiture / vélo / à pied)
- Distance totale + durée estimée
- Optimisation de l'ordre (algorithme du plus proche voisin)
- Export **GPX** (waypoints + tracé)
- **Import GPX** — affiche un tracé et ses waypoints sur la carte,
  chaque waypoint peut devenir un pin
- Partage via URL (`?route=id1,id2&rmode=driving`)
- Restauration automatique au rechargement

### Onglet Découvrir

#### Mode OSM (Overpass)
Recherche de POIs dans une zone draggable sur la carte :
- ⛺ Bivouacs · 🏠 Refuges · 💧 Sources · 🌊 Cascades
- 🔭 Panoramas · 🧗 Via ferratas · 🪨 Escalade · 🥾 Départs de randonnée
- Rayon ajustable de 1 à 50 km
- Enrichissement automatique via ferrata ([viaferrata-fr.net](https://viaferrata-fr.net)) et escalade ([theCrag](https://www.thecrag.com/), [FFME](https://www.ffme.fr/)) via Edge Functions Supabase
- Bouton "Ajouter à ma carte" depuis le résultat

#### Mode Tourisme officiel 🇫🇷 (DATAtourisme)
Switch dans le même onglet pour basculer sur les données officielles :
- 🏕 Hébergement · 🍽 Restauration · 🎭 Événements · 🏛 Patrimoine
- Markers sur la carte + liste dans la sidebar
- Cache 7 jours côté Supabase (cellule 0.1°)
- Rayon partagé avec le mode OSM

### Enrichissement des popups ville / ancrage

Pour les lieux de type **Village** ou **Point d'ancrage**, les popups affichent automatiquement :

**Wikivoyage** (API MediaWiki) :
- Sections À voir · À faire · Acheter · Manger · Boire/Sortir · Se loger · Y aller · Comprendre · Aux environs
- Accordion exclusif, lien vers l'article complet
- Cache session navigateur

**DATAtourisme** (via Edge Function) :
- Hébergements · Restauration · Événements proches (rayon 15 km)
- Cache 7 jours côté Supabase

**Météo** ([Open-Meteo](https://open-meteo.com/), sans clé) — toutes les popups :
- Prévisions 7 jours : icône, min/max, probabilité de pluie au survol
- Cache session par zone de ~11 km

### Partage & collaboration
- **Temps réel** — sur un roadtrip, les pins des co-équipiers (ajouts,
  déplacements, suppressions) apparaissent sans recharger (Supabase
  Realtime, RLS respectée)
- **Cartes partagées** — snapshot public via URL `?map=slug`
  - Inclut : pins, centre, zoom, fond de carte, filtres
- Confirmation avant chargement si données locales existantes
- Bannière "Carte partagée chargée"

### PWA & hors-ligne
- **Installable** (manifest + icônes) — l'app s'ajoute à l'écran d'accueil
- **Service worker** : l'app et les zones de carte déjà consultées restent
  disponibles sans réseau (tuiles en cache, plafonné) ; les données
  Supabase gardent leur repli localStorage
- Après un déploiement, le nouveau code apparaît au rechargement suivant
  (stale-while-revalidate). En dev : DevTools → Application →
  Service workers → cocher *Update on reload*

### UX & accessibilité
- **Dark mode** natif (`prefers-color-scheme: dark`)
- Cross-highlight sidebar ↔ carte au survol
- `Ctrl+F` / `Cmd+F` → focus sur la recherche
- Focus trap dans les modales (accessibilité clavier)
- `aria-live` sur le compteur de lieux visibles
- Sidebar redimensionnable (glisser-déposer, double-clic pour réinitialiser)
- Responsive mobile — sidebar en overlay
- Aucune dépendance de build — ES modules natifs

---

## Lancer le projet

Les ES modules nécessitent un serveur HTTP (pas `file://`).

### VS Code Live Server *(recommandé)*
1. Installer l'extension **Live Server** (Ritwick Dey)
2. Clic droit sur `index.html` → **Open with Live Server**

### npx serve
```bash
npx serve .
```

### Python
```bash
python -m http.server 8000
```

---

## Configuration Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Appliquer les migrations (`supabase/migrations/`, ordre numérique) :

```bash
npx supabase login                                  # une fois
npx supabase link --project-ref VOTRE_REF           # une fois
npx supabase db push
```

   En production, le workflow `.github/workflows/migrations.yml` exécute
   `db push` automatiquement à chaque push sur `main` qui touche une
   migration. Renseigner deux secrets GitHub (Settings → Secrets → Actions) :
   `SUPABASE_ACCESS_TOKEN` (Account → Access Tokens) et
   `SUPABASE_DB_PASSWORD` (Project Settings → Database).
   Le SQL Editor reste une alternative manuelle — les migrations sont
   idempotentes, mais `db push` tient l'historique à jour.

3. Déployer les trois Edge Functions avec le CLI :

```bash
npx supabase functions deploy via-ferrata-info
npx supabase functions deploy climbing-info
npx supabase functions deploy datatourisme-nearby
```

4. Configurer les secrets dans **Dashboard → Project Settings → Edge Functions → Secrets** :

| Secret | Description |
|---|---|
| `DATATOURISME_API_KEY` | Clé API [DATAtourisme](https://datadocs.datatourisme.fr/) |

5. Renseigner les credentials dans `src/shared/lib/supabaseClient.js` :

```js
export const SUPABASE_URL      = 'https://VOTRE_PROJET.supabase.co';
export const SUPABASE_ANON_KEY = 'VOTRE_CLE_ANON';
```

> La clé `anon` est publique par design — la sécurité est assurée par les politiques RLS.

---

## Structure du projet

```
road-tripmap/
├── index.html              Point d'entrée unique (SPA)
├── map.html                Redirection de compatibilité (anciens liens ?map=)
├── css/                    auth / dashboard / style (carte, chargé à la demande)
├── src/
│   ├── app/
│   │   ├── main.js         Bootstrap SPA — routeur + garde auth
│   │   ├── router.js       Routes hash (#/dashboard, #/roadtrips/:id, #/map…)
│   │   └── pages/          Home, Login, Register, Dashboard, Profile, MapPage…
│   ├── config/             Constantes (carte, URLs externes) + catégories
│   ├── features/
│   │   ├── map/            La carte : mapApp (wiring), Leaflet, pins, filtres,
│   │   │                   itinéraire, onglet Découvrir, partage, onboarding
│   │   ├── pins/           pinService — tables user_pins + pins (Supabase)
│   │   ├── roadtrips/      roadtripService — CRUD roadtrips + invitations
│   │   ├── routing/        routingService — OSRM, haversine, optimisation, GPX
│   │   ├── sharing/        sharingService — snapshots publics + slugs
│   │   ├── sources/        Services Overpass, DATAtourisme, Wikivoyage
│   │   ├── auth/           AuthStore + services profil
│   │   └── dashboard/      Composants liste de roadtrips
│   └── shared/
│       ├── lib/            Client Supabase unique + session
│       └── utils/          escapeHtml/safeUrl, localStorage
└── supabase/
    ├── migrations/         15 migrations SQL (schéma + RLS + caches)
    └── functions/
        ├── via-ferrata-info/     Enrichissement via ferrata (cache Supabase)
        ├── climbing-info/        Enrichissement escalade FFME (cache Supabase)
        └── datatourisme-nearby/  POIs touristiques officiels (cache 7j)
```

Outillage (dev uniquement, le déploiement reste sans build) :
`npm run lint` (ESLint) · `npm test` (Vitest, ~90 tests) ·
`npm run test:e2e` (Playwright, parcours publics) · `npm run serve`
La CI GitHub Actions rejoue lint + tests unitaires + E2E sur chaque
push et pull request ; les erreurs front remontent dans la table
`client_errors` (purge automatique après 30 jours).

---

## Catégories

| Catégorie | Icône | Description |
|---|---|---|
| Point d'ancrage | ★ | Base principale du séjour |
| Bivouac | ⛺ | Spots en forêt ou lac |
| Via ferrata | 🧗 | Parcours aériens équipés |
| Escalade | 🪨 | Sites d'escalade |
| Randonnée / belvédère | 🥾 | Sentiers et points de vue |
| Cascade / lac | 💧 | Sites aquatiques |
| Village / patrimoine | 🏘️ | Villages, villes, gastronomie |

---

## Ajouter des lieux statiques

Éditer `src/features/map/places.js` :

```js
{
  id:          "identifiant-unique",  // kebab-case, unique
  name:        "Nom du lieu",
  category:    "water",               // base | bivouac | via | escalade | hike | water | village
  lat:         46.1234,
  lng:         5.6789,
  description: "Description courte.",
  interest:    "Ce qui vaut le détour.",
  tip:         "Conseil pratique.",
  mood:        "Ambiance / nature"
}
```

---

## Technologies

| Outil | Usage |
|---|---|
| [Leaflet 1.9.4](https://leafletjs.com/) | Carte interactive |
| [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) | Clustering |
| [OSRM](https://project-osrm.org/) | Calcul d'itinéraire (API publique) |
| [Nominatim](https://nominatim.org/) | Géocodage (OpenStreetMap) |
| [Overpass API](https://overpass-api.de/) | Recherche POI OpenStreetMap |
| [Wikivoyage](https://fr.wikivoyage.org/) | Enrichissement popup ville (API MediaWiki) |
| [Open-Meteo](https://open-meteo.com/) | Prévisions météo 7 jours dans les popups |
| [DATAtourisme](https://datadocs.datatourisme.fr/) | POIs touristiques officiels français |
| [Supabase](https://supabase.com/) | Base de données cloud + RLS + Edge Functions |
| [IGN Géoportail](https://geoservices.ign.fr/) | Fond de carte topographique |
| ES Modules natifs | Pas de build tool |

---

## Déploiement — GitHub Pages + domaine

**Settings** → **Pages** → Source : `main` / `/ (root)` → Save.

L'app est servie sur **https://my-roadtrip-map.fr** (fichier `CNAME` à la
racine ; l'URL `modao27.github.io/road-tripmap` redirige automatiquement).

DNS chez le registrar :

| Type | Nom | Valeur |
|---|---|---|
| A | `@` | `185.199.108.153` · `185.199.109.153` · `185.199.110.153` · `185.199.111.153` |
| CNAME | `www` | `modao27.github.io` |

Puis **Enforce HTTPS** dans Settings → Pages (certificat automatique), et
déclarer le domaine dans **Supabase → Authentication → URL Configuration**
(Site URL + Redirect URLs) pour les emails d'auth.

> GitHub Pages sert les fichiers via HTTPS — les ES modules fonctionnent sans serveur local.
> Les Edge Functions Supabase continuent de tourner indépendamment.

---

## Notes terrain

> Les coordonnées des lieux sont **approximatives**. Vérifier avant usage sur le terrain.
> Certains bivouacs sont en forêt domaniale — se renseigner sur la réglementation locale.
> Via ferrata Roche au Dade : fermée depuis mars 2026 (roche dégradée) — vérifier réouverture.
> Gorges de l'Abîme : fermées par arrêté municipal (travaux en cours 2026).
