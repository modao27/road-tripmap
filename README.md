# Road trip outdoor dans le Jura

Carte interactive pour planifier un road trip outdoor autour de **Baume-les-Messieurs** dans le Jura. Sans planning imposé — une carte libre pour repérer cascades, belvédères, villages, bivouacs, lacs et via ferratas.

![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-brightgreen) ![ES Modules](https://img.shields.io/badge/JS-ES%20Modules-blue) ![Supabase](https://img.shields.io/badge/Supabase-cloud-3ECF8E) ![Build](https://img.shields.io/badge/build-aucun-lightgrey)

---

## Fonctionnalités

### Carte
- **30 lieux préchargés** — cascades, lacs, randonnées, bivouacs, via ferratas, villages
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
2. Exécuter le SQL dans **SQL Editor** :

```sql
create table user_pins (
  id text primary key, map_id text not null,
  name text not null, category text not null,
  lat float8 not null, lng float8 not null,
  description text default '', user_created boolean default true,
  created_at timestamptz default now()
);

create table place_overrides (
  place_id text not null, map_id text not null,
  name text, category text, description text, lat float8, lng float8,
  primary key (place_id, map_id)
);

create table shared_maps (
  slug text primary key, title text not null,
  description text default '', pins jsonb default '[]',
  overrides jsonb default '{}', center_lat float8 not null,
  center_lng float8 not null, zoom int not null default 10,
  base_layer text not null default 'osm', filters jsonb not null default '[]',
  created_at timestamptz default now()
);

alter table user_pins       enable row level security;
alter table place_overrides enable row level security;
alter table shared_maps     enable row level security;

create policy "anon access" on user_pins       for all using (true) with check (true);
create policy "anon access" on place_overrides for all using (true) with check (true);
create policy "public read" on shared_maps     for select using (true);
create policy "public write" on shared_maps    for insert with check (true);
```

3. Renseigner les credentials dans `js/supabase.js` :

```js
const SUPABASE_URL      = 'https://VOTRE_PROJET.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_CLE_ANON';
```

> La clé `anon` est publique par design — la sécurité est assurée par les politiques RLS.

---

## Structure du projet

```
road-trip-jura/
├── index.html              HTML pur + CDN + <script type="module">
├── css/
│   └── style.css           Tous les styles (dark mode inclus)
└── js/
    ├── app.js              Point d'entrée — CONFIG, état, bootstrap
    ├── map.js              Leaflet : init, layers, markers, clusters
    ├── ui.js               Sidebar, resizer, toasts, focus trap
    ├── pins.js             Pins utilisateur — CRUD + geocoding
    ├── filters.js          Filtres, légende, liste des lieux
    ├── routePlanner.js     Itinéraire — OSRM, GPX, drag & drop
    ├── share.js            Partage — modale, slug, bannière
    ├── storage.js          localStorage — toutes les clés
    ├── supabase.js         Client Supabase — CRUD + cartes partagées
    └── data/
        ├── places.js       30 lieux statiques
        └── categories.js   6 catégories
```

---

## Configuration

```js
// js/app.js
export const CONFIG = {
  defaultCenter:   [46.709, 5.646], // Baume-les-Messieurs
  defaultZoom:     10,
  focusZoom:       13,
  clusterRadius:   50,
  geocodeLimit:    5,
  geocodeDebounce: 350,             // ms avant la requête Nominatim
  sidebarDefault:  390,             // px
  sidebarMin:      240,
  sidebarMax:      720,
};
```

---

## Catégories

| Catégorie | Icône | Description |
|---|---|---|
| Point d'ancrage | ★ | Base principale du séjour |
| Bivouac | ⛺ | Spots en forêt ou lac |
| Via ferrata | 🧗 | Parcours aériens équipés |
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
  category:    "water",               // base | bivouac | via | hike | water | village
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
| [Supabase](https://supabase.com/) | Base de données cloud + RLS |
| [IGN Géoportail](https://geoservices.ign.fr/) | Fond de carte topographique |
| ES Modules natifs | Pas de build tool |

---

## Déploiement sur GitHub Pages

**Settings** → **Pages** → Source : `main` / `/ (root)` → Save.

Le site sera disponible sur `https://ton-pseudo.github.io/road-trip-jura/`.

> GitHub Pages sert les fichiers via HTTPS — les ES modules fonctionnent sans serveur local.

---

## Notes terrain

> Les coordonnées des lieux sont **approximatives**. Vérifier avant usage sur le terrain.
> Certains bivouacs sont en forêt domaniale — se renseigner sur la réglementation locale.
