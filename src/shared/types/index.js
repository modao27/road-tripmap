/**
 * @fileoverview Définitions de types métier (JSDoc @typedef)
 * Utilisés par VS Code pour l'autocomplétion et la vérification de types
 * sans nécessiter de compilation TypeScript.
 */

// ── Roadtrip ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Roadtrip
 * @property {string}  id          - UUID du roadtrip
 * @property {string}  owner_id    - UUID du propriétaire
 * @property {string}  title       - Nom affiché
 * @property {string}  description - Description courte
 * @property {'private'|'shared'|'public'} visibility
 * @property {string}  [slug]      - Slug de partage (quand visibility ≠ private)
 * @property {string}  cover_color - Couleur de couverture hex
 * @property {string}  created_at  - ISO 8601
 * @property {string}  updated_at  - ISO 8601
 */

/**
 * @typedef {Object} MapView
 * @property {number} lat
 * @property {number} lng
 * @property {number} zoom
 */

// ── Pin ───────────────────────────────────────────────────────────────────────

/**
 * @typedef {'bivouac'|'water'|'hike'|'village'|'via'|'base'|'cascade'} PinCategory
 */

/**
 * @typedef {'user'|'import'|'overpass'} PinSource
 */

/**
 * @typedef {Object} Pin
 * @property {string}      id          - UUID
 * @property {string}      name        - Nom affiché sur la carte
 * @property {PinCategory} category    - Catégorie du lieu
 * @property {number}      lat
 * @property {number}      lng
 * @property {string}      [description]
 * @property {string}      [tip]       - Conseil pratique
 * @property {string}      [interest]  - Intérêt du lieu
 * @property {string}      [mood]      - Ambiance
 * @property {boolean}     userCreated - Créé par l'utilisateur (vs import statique)
 * @property {PinSource}   [source]    - Origine du pin
 */

/**
 * @typedef {Partial<Pin>} PinOverride
 * Surcharges appliquées par l'utilisateur sur un lieu statique.
 */

/**
 * @typedef {Object<string, PinOverride>} PlaceOverrides
 * Dictionnaire indexé par place.id.
 */

// ── Route Planner ─────────────────────────────────────────────────────────────

/**
 * @typedef {'driving'|'cycling'|'walking'} TravelMode
 */

/**
 * @typedef {Object} RouteStep
 * @property {string} placeId  - Référence à un Pin
 * @property {string} label    - Nom affiché dans l'itinéraire
 */

/**
 * @typedef {Object} RouteStats
 * @property {number} distanceMeters
 * @property {number} durationSeconds
 */

// ── Map ───────────────────────────────────────────────────────────────────────

/**
 * @typedef {'osm'|'ign'|'sat'} BaseLayerKey
 */

/**
 * @typedef {Object} MapConfig
 * @property {[number, number]} defaultCenter - [lat, lng]
 * @property {number}           defaultZoom
 * @property {number}           focusZoom
 * @property {number}           clusterRadius
 * @property {number}           geocodeLimit
 * @property {number}           geocodeDebounce
 * @property {number}           sidebarDefault
 * @property {number}           sidebarMin
 * @property {number}           sidebarMax
 */

// ── Sharing ───────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SharedMap
 * @property {string}         slug
 * @property {string}         title
 * @property {string}         [description]
 * @property {Pin[]}          pins
 * @property {PlaceOverrides} overrides
 * @property {string[]}       filters    - Catégories actives
 * @property {number}         center_lat
 * @property {number}         center_lng
 * @property {number}         zoom
 * @property {BaseLayerKey}   base_layer
 */

// ── Category ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CategoryDef
 * @property {string} label
 * @property {string} icon   - Emoji
 * @property {string} color  - Hex color
 */

/**
 * @typedef {Object<PinCategory, CategoryDef>} Categories
 */

// ── Enrichissement POI ────────────────────────────────────────────────────────

/**
 * @typedef {Object} C2CEnrichment
 * @property {string} [title]
 * @property {string} [rating]       - Ex: "D", "TD"
 * @property {number} [elevation]
 * @property {number} [heightDiff]
 * @property {string} [description]
 * @property {string} [url]
 */

/**
 * @typedef {Object} RefugeEnrichment
 * @property {number} [altitude]
 * @property {number} [capacite]
 * @property {string} [gardiennage] - "oui"|"non"|"partiel"
 * @property {string} [eau]         - "oui"|"non"
 * @property {string} [url]
 * @property {string} [acces]
 */

export {};
