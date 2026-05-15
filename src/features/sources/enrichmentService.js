/**
 * @fileoverview Service d'enrichissement des POI Overpass.
 * Responsabilité : interroger CamptoCamp et Refuges.info, retourner
 * des données structurées. Ne génère pas de HTML.
 *
 * @typedef {import('../../shared/types/index.js').C2CEnrichment}     C2CEnrichment
 * @typedef {import('../../shared/types/index.js').RefugeEnrichment}  RefugeEnrichment
 */

import { CAMPTOCAMP_URL, REFUGES_URL, ENRICHMENT_TIMEOUT_MS } from '../../config/index.js';

const c2cCache    = new Map();
const refugeCache = new Map();

// ── Timeout ───────────────────────────────────────────────────────────────────

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('enrichment timeout')), ENRICHMENT_TIMEOUT_MS)
    ),
  ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripMarkup(text = '') {
  return text.replace(/\[.*?\]/g, '').replace(/<[^>]+>/g, '').trim();
}

function truncate(text, max = 280) {
  if (text.length <= max) return text;
  return text.slice(0, text.lastIndexOf(' ', max)) + '…';
}

// ── CamptoCamp ────────────────────────────────────────────────────────────────

/**
 * @param {string} searchTerm - Nom spécifique de la via ferrata
 * @returns {Promise<C2CEnrichment|null>}
 */
async function _fetchC2C(searchTerm) {
  const url = `${CAMPTOCAMP_URL}?q=${encodeURIComponent(searchTerm)}&t=r&limit=5`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const docs = data.routes?.documents ?? [];
  if (!docs.length) return null;

  const doc    = docs[0];
  const locale = doc.locales?.find(l => l.lang === 'fr') ?? doc.locales?.[0] ?? {};
  const raw    = stripMarkup(locale.summary ?? locale.description ?? '');

  return {
    title:       locale.title ?? null,
    rating:      doc.difficulties?.via_ferrata_rating ?? null,
    elevation:   doc.elevation_max  ?? null,
    heightDiff:  doc.height_diff_up ?? null,
    description: truncate(raw) || null,
    url: doc.document_id
      ? `https://www.camptocamp.org/routes/${doc.document_id}`
      : null,
  };
}

/**
 * @param {string} searchTerm
 * @returns {Promise<C2CEnrichment|null>}
 */
export async function fetchC2CEnrichment(searchTerm) {
  if (!searchTerm) return null;
  const key = searchTerm.toLowerCase();
  if (c2cCache.has(key)) return c2cCache.get(key);
  const result = await withTimeout(_fetchC2C(searchTerm));
  c2cCache.set(key, result);
  return result;
}

// ── Refuges.info ──────────────────────────────────────────────────────────────

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<RefugeEnrichment|null>}
 */
async function _fetchRefuge(lat, lng) {
  const d    = 0.006;
  const bbox = `${(lng-d).toFixed(4)},${(lat-d).toFixed(4)},${(lng+d).toFixed(4)},${(lat+d).toFixed(4)}`;
  const res  = await fetch(`${REFUGES_URL}?bbox=${bbox}&type_points=refuge,cabane,bivouac&format=geojson`);
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
    altitude:    p.coord?.alt         ?? null,
    capacite:    p.carac?.cap_ete     ?? null,
    gardiennage: p.carac?.gardiennage ?? null,
    eau:         p.carac?.eau_potable ?? null,
    url:         p.lien               ?? null,
    acces:       p.acces?.from        ?? null,
  };
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<RefugeEnrichment|null>}
 */
export async function fetchRefugeEnrichment(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (refugeCache.has(key)) return refugeCache.get(key);
  const result = await withTimeout(_fetchRefuge(lat, lng));
  refugeCache.set(key, result);
  return result;
}
