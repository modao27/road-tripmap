# Road trip outdoor — Jura

Carte interactive pour planifier un road trip outdoor autour de **Baume-les-Messieurs** dans le Jura. Sans planning imposé — une carte libre pour repérer cascades, belvédères, villages, bivouacs, lacs et via ferratas.

![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-brightgreen) ![ES Modules](https://img.shields.io/badge/JS-ES%20Modules-blue) ![Supabase](https://img.shields.io/badge/Supabase-cloud-3ECF8E) ![Build](https://img.shields.io/badge/build-aucun-lightgrey)

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

### Partage & collaboration
- **Cartes partagées** — snapshot public via URL `?map=slug`
  - Inclut : pins, centre, zoom, fond de carte, filtres
- Confirmation avant chargement si données locales existantes
- Bannière "Carte partagée chargée"

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
2. Clic droit sur `map.html` → **Open with Live Server**

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
2. Exécuter les migrations dans **SQL Editor** (dossier `supabase/migrations/` — dans l'ordre numérique)
3. Déployer les trois Edge Functions (dossier `supabase/functions/`) via l'éditeur Supabase Dashboard
4. Configurer les secrets dans **Dashboard → Project Settings → Edge Functions → Secrets** :

| Secret | Description |
|---|---|
| `DATATOURISME_API_KEY` | Clé API [DATAtourisme](https://datadocs.datatourisme.fr/) |

5. Renseigner les credentials dans `js/supabase.js` :

```js
const SUPABASE_URL      = 'https://VOTRE_PROJET.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_CLE_ANON';
```

> La clé `anon` est publique par design — la sécurité est assurée par les politiques RLS.

---

## Structure du projet

```
road-trip-jura/
├── map.html                Point d'entrée principal de la carte
├── index.html              Page d'accueil / redirection
├── css/
│   └── style.css           Tous les styles (dark mode inclus)
├── js/
│   ├── app.js              Bootstrap — état global, onglets, wiring des modules
│   ├── map.js              Leaflet : init, layers, markers, clusters
│   ├── ui.js               Sidebar, resizer, toasts, focus trap
│   ├── pins.js             Pins utilisateur — CRUD + geocoding + popupHtml
│   ├── filters.js          Filtres, légende, liste des lieux
│   ├── overpass.js         Onglet Découvrir — recherche OSM via Overpass API
│   ├── datatourisme.js     Onglet Découvrir — recherche Tourisme officiel (DATAtourisme)
│   ├── routePlanner.js     Itinéraire — OSRM, GPX, drag & drop
│   ├── share.js            Partage — modale, slug, bannière
│   ├── storage.js          localStorage — toutes les clés
│   ├── supabase.js         Client Supabase — CRUD + cartes partagées
│   └── data/
│       ├── places.js       35 lieux statiques
│       └── categories.js   7 catégories
└── supabase/
    ├── migrations/         015 migrations SQL (schéma + RLS + caches)
    └── functions/
        ├── via-ferrata-info/     Enrichissement via ferrata (CamptoCamp + cache)
        ├── climbing-info/        Enrichissement escalade (cache Supabase)
        └── datatourisme-nearby/  POIs touristiques officiels (DATAtourisme + cache 7j)
```

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

Éditer `js/data/places.js` :

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
| [DATAtourisme](https://datadocs.datatourisme.fr/) | POIs touristiques officiels français |
| [Supabase](https://supabase.com/) | Base de données cloud + RLS + Edge Functions |
| [IGN Géoportail](https://geoservices.ign.fr/) | Fond de carte topographique |
| ES Modules natifs | Pas de build tool |

---

## Déploiement sur GitHub Pages

**Settings** → **Pages** → Source : `main` / `/ (root)` → Save.

Le site sera disponible sur `https://ton-pseudo.github.io/road-trip-jura/`.

> GitHub Pages sert les fichiers via HTTPS — les ES modules fonctionnent sans serveur local.
> Les Edge Functions Supabase continuent de tourner indépendamment.

---

## Notes terrain

> Les coordonnées des lieux sont **approximatives**. Vérifier avant usage sur le terrain.
> Certains bivouacs sont en forêt domaniale — se renseigner sur la réglementation locale.
> Via ferrata Roche au Dade : fermée depuis mars 2026 (roche dégradée) — vérifier réouverture.
> Gorges de l'Abîme : fermées par arrêté municipal (travaux en cours 2026).
