/**
 * enrichment.js
 * Enrichissement progressif des popups Overpass.
 * Wikipedia et Refuges.info sont chargés de façon indépendante,
 * chacun avec un timeout de 5 s et son propre cache mémoire.
 */

const WIKIPEDIA_SEARCH  = 'https://fr.wikipedia.org/w/api.php';
const WIKIPEDIA_SUMMARY = 'https://fr.wikipedia.org/api/rest_v1/page/summary';
const REFUGES_API       = 'https://www.refuges.info/api/bbox';
const TIMEOUT_MS        = 5000;

const wikiCache   = new Map();
const refugeCache = new Map();

// ── Timeout wrapper ───────────────────────────────────────────────────────────

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// ── Wikipedia ─────────────────────────────────────────────────────────────────

async function summaryByTitle(title) {
  const res = await fetch(`${WIKIPEDIA_SUMMARY}/${encodeURIComponent(title)}`);
  if (!res.ok) return null;
  const d = await res.json();
  const raw   = d.extract ?? '';
  const short = raw.length > 280 ? raw.slice(0, raw.lastIndexOf(' ', 280)) + '…' : raw;
  return {
    title:     d.title,
    extract:   short,
    thumbnail: d.thumbnail?.source ?? null,
    url:       d.content_urls?.desktop?.page ?? null,
  };
}

// Recherche par nom (lieu nommé dans OSM)
async function _fetchWikipediaByName(name) {
  const url = new URL(WIKIPEDIA_SEARCH);
  url.searchParams.set('action',   'query');
  url.searchParams.set('list',     'search');
  url.searchParams.set('srsearch', name);
  url.searchParams.set('srlimit',  '1');
  url.searchParams.set('srprop',   'snippet');
  url.searchParams.set('format',   'json');
  url.searchParams.set('origin',   '*');
  const res = await fetch(url);
  if (!res.ok) return null;
  const data  = await res.json();
  const hits  = data.query?.search;
  if (!hits?.length) return null;
  return summaryByTitle(hits[0].title);
}

// Géosearch : articles proches des coordonnées (lieu sans nom dans OSM)
async function _fetchWikipediaByCoords(lat, lng) {
  const url = new URL(WIKIPEDIA_SEARCH);
  url.searchParams.set('action',   'query');
  url.searchParams.set('list',     'geosearch');
  url.searchParams.set('gscoord',  `${lat}|${lng}`);
  url.searchParams.set('gsradius', '3000');
  url.searchParams.set('gslimit',  '1');
  url.searchParams.set('format',   'json');
  url.searchParams.set('origin',   '*');
  const res = await fetch(url);
  if (!res.ok) return null;
  const data    = await res.json();
  const results = data.query?.geosearch;
  if (!results?.length) return null;
  return summaryByTitle(results[0].title);
}

export async function fetchWikipedia(name, lat, lng, useGeo = false) {
  const key = useGeo ? `geo:${lat?.toFixed(3)},${lng?.toFixed(3)}` : name;
  if (wikiCache.has(key)) return wikiCache.get(key);
  const fetcher = useGeo ? _fetchWikipediaByCoords(lat, lng) : _fetchWikipediaByName(name);
  const result  = await withTimeout(fetcher);
  wikiCache.set(key, result);
  return result;
}

// ── Refuges.info ──────────────────────────────────────────────────────────────

async function _fetchRefuge(lat, lng) {
  const d    = 0.006; // ≈ 600 m
  const bbox = `${(lng-d).toFixed(4)},${(lat-d).toFixed(4)},${(lng+d).toFixed(4)},${(lat+d).toFixed(4)}`;
  const res  = await fetch(`${REFUGES_API}?bbox=${bbox}&type_points=refuge,cabane,bivouac&format=geojson`);
  if (!res.ok) return null;

  const data     = await res.json();
  const features = data.features ?? [];
  if (!features.length) return null;

  const closest = features.reduce((best, f) => {
    const [fLng, fLat] = f.geometry.coordinates;
    const dist = Math.hypot(fLat - lat, fLng - lng);
    return dist < best.dist ? { f, dist } : best;
  }, { f: features[0], dist: Infinity }).f;

  const p = closest.properties;
  return {
    altitude:    p.coord?.alt          ?? null,
    capacite:    p.carac?.cap_ete      ?? null,
    gardiennage: p.carac?.gardiennage  ?? null,
    eau:         p.carac?.eau_potable  ?? null,
    url:         p.lien                ?? null,
    acces:       p.acces?.from         ?? null,
  };
}

export async function fetchRefuge(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (refugeCache.has(key)) return refugeCache.get(key);
  const result = await withTimeout(_fetchRefuge(lat, lng));
  refugeCache.set(key, result);
  return result;
}

// ── Skeleton HTML (espace réservé immédiat) ───────────────────────────────────

export function buildSkeletonHtml(category) {
  const isRefuge = ['shelter', 'bivouac'].includes(category);
  return `
    <div class="pe-section" data-pe="wiki">
      <div class="pe-sk pe-sk--photo"></div>
      <div class="pe-sk pe-sk--line" style="width:92%"></div>
      <div class="pe-sk pe-sk--line" style="width:75%"></div>
      <div class="pe-sk pe-sk--line" style="width:45%"></div>
    </div>
    ${isRefuge ? `
    <div class="pe-section pe-sep" data-pe="refuge">
      <div class="pe-sk pe-sk--line" style="width:60%"></div>
      <div class="pe-sk pe-sk--tags"></div>
    </div>` : ''}`;
}

// ── HTML Wikipedia ────────────────────────────────────────────────────────────

export function buildWikiHtml(data, catColor, showTitle = false) {
  if (!data) return null;
  const parts = [];

  // Titre affiché quand le lieu n'a pas de nom dans OSM (résultat géosearch)
  if (showTitle && data.title) {
    parts.push(`<strong class="pe-wiki-title">${data.title}</strong>`);
  }
  if (data.thumbnail) {
    parts.push(`
      <div class="pe-photo-wrap" style="--cat:${catColor}">
        <img class="pe-photo" src="${data.thumbnail}" alt="" loading="lazy"
             onerror="this.style.opacity=0">
      </div>`);
  }
  if (data.extract) {
    parts.push(`<p class="pe-extract">${data.extract}</p>`);
  }
  if (data.url) {
    parts.push(`<div class="pe-links">
      <a class="pe-link" href="${data.url}" target="_blank" rel="noopener">📖 Wikipedia</a>
    </div>`);
  }
  if (!parts.length) return null;

  return `<span class="pe-badge">🌐 Wikipedia</span>${parts.join('')}`;
}

// ── HTML Refuges.info ─────────────────────────────────────────────────────────

export function buildRefugeHtml(data) {
  if (!data) return null;

  const tags = [
    data.altitude                  ? `⛰ ${data.altitude} m`     : null,
    data.capacite                  ? `👤 ${data.capacite} places` : null,
    data.gardiennage === 'oui'     ? '✅ Gardienné'               : null,
    data.gardiennage === 'partiel' ? '🔶 Gardiennage partiel'    : null,
    data.eau === 'oui'             ? '💧 Eau potable'             : null,
  ].filter(Boolean);

  const parts = [];
  if (tags.length) {
    parts.push(`<div class="pe-tags">${tags.map(t => `<span class="pe-tag">${t}</span>`).join('')}</div>`);
  }
  if (data.acces) {
    parts.push(`<p class="pe-access"><strong>Accès :</strong> ${data.acces}</p>`);
  }
  if (data.url) {
    parts.push(`<div class="pe-links">
      <a class="pe-link" href="${data.url}" target="_blank" rel="noopener">🏠 Refuges.info</a>
    </div>`);
  }
  if (!parts.length) return null;

  return `<span class="pe-badge">🏠 Refuges.info</span>${parts.join('')}`;
}
