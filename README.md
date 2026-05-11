# Road trip outdoor dans le Jura 🗺️

Carte interactive pour planifier un road trip outdoor autour de **Baume-les-Messieurs** dans le Jura. Sans planning imposé — une carte libre pour repérer cascades, belvédères, villages, bivouacs, lacs et via ferratas.

![Aperçu de la carte](https://img.shields.io/badge/Leaflet-1.9.4-brightgreen) ![ES Modules](https://img.shields.io/badge/JS-ES%20Modules-blue) ![Pas de build tool](https://img.shields.io/badge/build-aucun-lightgrey)

---

## Fonctionnalités

- **30 lieux préchargés** — cascades, lacs, randonnées, bivouacs, via ferratas, villages
- **Filtres par catégorie** avec compteurs dynamiques
- **Recherche textuelle** en temps réel
- **3 fonds de carte** — OpenStreetMap, IGN topo (Géoportail), satellite (ESRI)
- **Clusters de marqueurs** — regroupement automatique à faible zoom
- **Géolocalisation** — affiche ta position sur la carte
- **Pins personnalisés** — ajouter, modifier, supprimer des lieux
  - Recherche de localisation via **Nominatim** (OpenStreetMap, sans clé API)
  - Placement manuel au clic sur la carte
  - Persistance locale (localStorage)
- **Édition des lieux existants** — override des données d'origine, réinitialisable
- **Sidebar redimensionnable** — glisser-déposer, double-clic pour réinitialiser
- **Responsive mobile** — sidebar en overlay sur petit écran
- **Aucune dépendance de build** — ES modules natifs

---

## Lancer le projet

Les ES modules nécessitent un serveur HTTP (pas `file://`).

### VS Code Live Server *(recommandé)*
1. Installer l'extension **Live Server** (Ritwick Dey)
2. Clic droit sur `index.html` → **Open with Live Server**
3. S'ouvre sur `http://localhost:5500`

### npx serve
```bash
npx serve .
```
Puis ouvrir `http://localhost:3000`.

### Python
```bash
python -m http.server 8000
```
Puis ouvrir `http://localhost:8000`.

---

## Structure du projet

```
road-trip-jura/
├── index.html                # HTML pur — structure + liens CDN + module entry
├── css/
│   └── style.css             # Tous les styles
└── js/
    ├── app.js                # Point d'entrée — CONFIG, état partagé, bootstrap
    ├── map.js                # Leaflet, layers, markers, clusters, focusPlace
    ├── ui.js                 # Sidebar, resizer, toasts
    ├── pins.js               # Pins utilisateur — création, édition, suppression
    ├── filters.js            # Filtres, légende, liste des lieux
    ├── geocode.js            # Module Nominatim autonome (réutilisable)
    ├── storage.js            # localStorage — lecture/écriture
    └── data/
        ├── places.js         # Les 30 lieux (coordonnées approximatives)
        └── categories.js     # Définition des 6 catégories
```

---

## Configuration

Toute la configuration est centralisée en haut de `js/app.js` :

```js
const CONFIG = {
  defaultCenter: [46.709, 5.646], // Baume-les-Messieurs
  defaultZoom: 10,
  focusZoom: 13,
  clusterRadius: 50,
  geocodeLimit: 5,
  geocodeDebounce: 350,           // ms avant la requête Nominatim
  sidebarDefault: 390,            // px
  sidebarMin: 240,
  sidebarMax: 720,
};
```

---

## Catégories

| Catégorie | Icône | Description |
|---|---|---|
| Point d'ancrage | ★ | Base principale du séjour |
| Bivouac | ⛺ | Spots de bivouac en forêt ou lac |
| Via ferrata | 🧗 | Parcours aériens équipés |
| Randonnée / belvédère | 🥾 | Sentiers et points de vue |
| Cascade / lac | 💧 | Sites aquatiques |
| Village / patrimoine | 🏘️ | Villages, villes, gastronomie |

---

## Ajouter des lieux

Éditer `js/data/places.js` en suivant la structure existante :

```js
{
  id: "identifiant-unique",       // kebab-case, unique
  name: "Nom du lieu",
  category: "water",              // base | bivouac | via | hike | water | village
  lat: 46.1234,
  lng: 5.6789,
  description: "Description courte.",
  interest: "Ce qui vaut le détour.",
  tip: "Conseil pratique.",
  mood: "Ambiance / nature"
}
```

---

## Technologies

| Outil | Usage |
|---|---|
| [Leaflet 1.9.4](https://leafletjs.com/) | Carte interactive |
| [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) | Clustering des marqueurs |
| [Nominatim](https://nominatim.org/) | Géocodage (OpenStreetMap) |
| [IGN Géoportail](https://geoservices.ign.fr/) | Fond de carte topographique |
| ES Modules natifs | Pas de build tool |

---

## Déploiement sur GitHub Pages

Dans les **Settings** du dépôt → **Pages** → Source : `main` / `/ (root)` → Save.

Le site sera disponible sur `https://ton-pseudo.github.io/road-trip-jura/` en quelques minutes.

---

## Notes terrain

> Les coordonnées des lieux sont **approximatives**. Vérifier avant usage sur le terrain.
> Certains bivouacs sont en forêt domaniale — se renseigner sur la réglementation locale avant de planter la tente.
