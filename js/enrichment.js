/**
 * enrichment.js
 * Enrichit les popups Overpass avec des données externes :
 *  - Wikipedia FR : description, photo, lien article
 *  - Refuges.info  : détails refuge (altitude, capacité, eau, gardiennage)
 */

const WIKIPEDIA_SEARCH  = 'https://fr.wikipedia.org/w/api.php';
const WIKIPEDIA_SUMMARY = 'https://fr.wikipedia.org/api/rest_v1/page/summary';
const REFUGES_API       = 'https://www.refuges.info/api/bbox';

// Cache en mémoire : évite les re-fetches sur réouverture de popup
const cache = new Map();

// ── Wikipedia ─────────────────────────────────────────────────────────────────

async function fetchWikipedia(name) {
  // Recherche de l'article le plus pertinent
  const searchUrl = new URL(WIKIPEDIA_SEARCH);
  searchUrl.searchParams.set('action', 'query');
  searchUrl.searchParams.set('list', 'search');
  searchUrl.searchParams.set('srsearch', name);
  searchUrl.searchParams.set('srlimit', '1');
  searchUrl.searchParams.set('srprop', 'snippet');
  searchUrl.searchParams.set('format', 'json');
  searchUrl.searchParams.set('origin', '*');

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return null;
  const searchData = await searchRes.json();

  const hits = searchData.query?.search;
  if (!hits?.length) return null;

  const title = hits[0].title;

  // Résumé complet avec photo
  const summaryRes = await fetch(`${WIKIPEDIA_SUMMARY}/${encodeURIComponent(title)}`);
  if (!summaryRes.ok) return null;
  const d = await summaryRes.json();

  // Extrait limité à 280 caractères
  const raw   = d.extract ?? '';
  const short = raw.length > 280 ? raw.slice(0, raw.lastIndexOf(' ', 280)) + '…' : raw;

  return {
    title:     d.title,
    extract:   short,
    thumbnail: d.thumbnail?.source ?? null,
    url:       d.content_urls?.desktop?.page ?? null,
  };
}

// ── Refuges.info ──────────────────────────────────────────────────────────────

async function fetchRefuge(lat, lng) {
  const delta = 0.006; // ~600 m
  const bbox  = `${(lng - delta).toFixed(4)},${(lat - delta).toFixed(4)},${(lng + delta).toFixed(4)},${(lat + delta).toFixed(4)}`;

  const url = `${REFUGES_API}?bbox=${bbox}&type_points=refuge,cabane,bivouac&format=geojson`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data     = await res.json();
  const features = data.features ?? [];
  if (!features.length) return null;

  // Point le plus proche des coordonnées
  const closest = features.reduce((best, f) => {
    const [fLng, fLat] = f.geometry.coordinates;
    const d = Math.hypot(fLat - lat, fLng - lng);
    return d < best.d ? { f, d } : best;
  }, { f: features[0], d: Infinity }).f;

  const p = closest.properties;

  return {
    nom:          p.nom,
    altitude:     p.coord?.alt ?? null,
    capacite:     p.carac?.cap_ete ?? null,
    gardiennage:  p.carac?.gardiennage ?? null,
    eau:          p.carac?.eau_potable ?? null,
    url:          p.lien ?? null,
    acces:        p.acces?.from ?? null,
  };
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

/**
 * @param {string} name        Nom du lieu
 * @param {number} lat
 * @param {number} lng
 * @param {string} category    Clé de catégorie Overpass (ex: 'shelter', 'waterfall')
 * @returns {Promise<{wikipedia?, refuge?}>}
 */
export async function enrichPlace(name, lat, lng, category) {
  const key = `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);

  const isRefuge = ['shelter', 'bivouac'].includes(category);

  const [wikiResult, refugeResult] = await Promise.allSettled([
    fetchWikipedia(name),
    isRefuge ? fetchRefuge(lat, lng) : Promise.resolve(null),
  ]);

  const result = {
    wikipedia: wikiResult.status === 'fulfilled' ? wikiResult.value : null,
    refuge:    refugeResult.status === 'fulfilled' ? refugeResult.value : null,
  };

  cache.set(key, result);
  return result;
}

// ── Rendu HTML de l'enrichissement ───────────────────────────────────────────

export function buildEnrichHtml({ wikipedia, refuge }) {
  if (!wikipedia && !refuge) return '';

  const parts = [];

  if (wikipedia?.thumbnail) {
    parts.push(`<img class="pe-photo" src="${wikipedia.thumbnail}" alt="" loading="lazy">`);
  }

  if (wikipedia?.extract) {
    parts.push(`<p class="pe-extract">${wikipedia.extract}</p>`);
  }

  if (refuge) {
    const tags = [
      refuge.altitude                   ? `⛰ ${refuge.altitude} m`             : null,
      refuge.capacite                   ? `👤 ${refuge.capacite} places`         : null,
      refuge.gardiennage === 'oui'      ? '✅ Gardienné'                         : null,
      refuge.gardiennage === 'partiel'  ? '🔶 Gardiennage partiel'              : null,
      refuge.eau === 'oui'              ? '💧 Eau potable'                       : null,
    ].filter(Boolean);

    if (tags.length) {
      parts.push(`<div class="pe-tags">${tags.map(t => `<span class="pe-tag">${t}</span>`).join('')}</div>`);
    }

    if (refuge.acces) {
      parts.push(`<p class="pe-access"><strong>Accès :</strong> ${refuge.acces}</p>`);
    }
  }

  const links = [
    wikipedia?.url  ? `<a class="pe-link" href="${wikipedia.url}"  target="_blank" rel="noopener">📖 Wikipedia</a>`   : null,
    refuge?.url     ? `<a class="pe-link" href="${refuge.url}"     target="_blank" rel="noopener">🏠 Refuges.info</a>` : null,
  ].filter(Boolean);

  if (links.length) {
    parts.push(`<div class="pe-links">${links.join('')}</div>`);
  }

  return parts.join('');
}
