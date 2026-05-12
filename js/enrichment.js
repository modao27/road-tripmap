/**
 * enrichment.js
 * Enrichissement contextuel des popups Overpass par catégorie :
 *   via_ferrata  → CamptoCamp API (cotation, dénivelé, équipement)
 *   shelter/bivouac → Refuges.info (altitude, capacité, accès)
 *   autres       → tags OSM valorisés, pas d'appel externe
 */

const REFUGES_API    = 'https://www.refuges.info/api/bbox';
const CAMPTOCAMP_API = 'https://api.camptocamp.org/waypoints';
const TIMEOUT_MS     = 6000;

const refugeCache = new Map();
const c2cCache    = new Map();

// ── Timeout ───────────────────────────────────────────────────────────────────
function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDocCoords(doc) {
  try {
    const geom = JSON.parse(doc.geometry?.geom ?? 'null');
    if (!geom) return null;
    return { lat: geom.coordinates[1], lng: geom.coordinates[0] };
  } catch { return null; }
}

function stripMarkup(text = '') {
  return text.replace(/\[.*?\]/g, '').replace(/<[^>]+>/g, '').trim();
}

// ── CamptoCamp (via ferratas) ─────────────────────────────────────────────────
async function _fetchCamptocamp(lat, lng) {
  const d    = 0.02; // ~2 km
  const bbox = `${(lng-d).toFixed(4)},${(lat-d).toFixed(4)},${(lng+d).toFixed(4)},${(lat+d).toFixed(4)}`;
  const res  = await fetch(`${CAMPTOCAMP_API}?wtyp=via_ferrata&bbox=${bbox}&limit=10`);
  if (!res.ok) return null;

  const data = await res.json();
  const docs = data.documents ?? [];
  if (!docs.length) return null;

  // Point le plus proche
  const closest = docs.reduce((best, doc) => {
    const coords = getDocCoords(doc);
    if (!coords) return best;
    const dist = Math.hypot(coords.lat - lat, coords.lng - lng);
    return dist < best.dist ? { doc, dist } : best;
  }, { doc: docs[0], dist: Infinity }).doc;

  const locale = closest.locales?.find(l => l.lang === 'fr') ?? closest.locales?.[0] ?? {};
  const raw    = stripMarkup(locale.summary ?? locale.description ?? '');
  const desc   = raw.length > 280 ? raw.slice(0, raw.lastIndexOf(' ', 280)) + '…' : raw;

  return {
    title:      locale.title ?? null,
    rating:     closest.via_ferrata_rating ?? null,
    elevation:  closest.elevation ?? null,
    heightDiff: closest.height_diff_up ?? null,
    equipment:  closest.equipment_rating ?? null,
    description: desc || null,
    url: closest.document_id
      ? `https://www.camptocamp.org/waypoints/${closest.document_id}`
      : null,
  };
}

export async function fetchCamptocamp(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (c2cCache.has(key)) return c2cCache.get(key);
  const result = await withTimeout(_fetchCamptocamp(lat, lng));
  c2cCache.set(key, result);
  return result;
}

// ── Refuges.info (refuges et bivouacs) ───────────────────────────────────────
async function _fetchRefuge(lat, lng) {
  const d    = 0.006;
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

// ── Skeleton générique (affiché pendant les appels async) ─────────────────────
export function buildSkeletonHtml() {
  return `
    <div class="pe-section">
      <div class="pe-sk pe-sk--line" style="width:65%"></div>
      <div class="pe-sk pe-sk--tags"></div>
      <div class="pe-sk pe-sk--line" style="width:92%"></div>
      <div class="pe-sk pe-sk--line" style="width:78%"></div>
      <div class="pe-sk pe-sk--line pe-sk--short"></div>
    </div>`;
}

// ── Build HTML CamptoCamp ─────────────────────────────────────────────────────
export function buildCamptocampHtml(data) {
  if (!data) return null;

  const parts = [];

  if (data.title) {
    parts.push(`<strong class="pe-wiki-title">${data.title}</strong>`);
  }

  const tags = [
    data.rating     ? `🎯 ${data.rating}`                      : null,
    data.elevation  ? `⛰ ${data.elevation} m`                  : null,
    data.heightDiff ? `↑ ${data.heightDiff} m`                  : null,
    data.equipment  ? `🔧 Équipement ${data.equipment}`         : null,
  ].filter(Boolean);

  if (tags.length) {
    parts.push(`<div class="pe-tags">${tags.map(t => `<span class="pe-tag">${t}</span>`).join('')}</div>`);
  }

  if (data.description) {
    parts.push(`<p class="pe-extract">${data.description}</p>`);
  }

  if (data.url) {
    parts.push(`<div class="pe-links">
      <a class="pe-link" href="${data.url}" target="_blank" rel="noopener">🧗 CamptoCamp</a>
    </div>`);
  }

  if (!parts.length) return null;
  return `<span class="pe-badge">🧗 CamptoCamp</span>${parts.join('')}`;
}

// ── Build HTML Refuges.info ───────────────────────────────────────────────────
export function buildRefugeHtml(data) {
  if (!data) return null;

  const tags = [
    data.altitude                  ? `⛰ ${data.altitude} m`      : null,
    data.capacite                  ? `👤 ${data.capacite} places`  : null,
    data.gardiennage === 'oui'     ? '✅ Gardienné'                : null,
    data.gardiennage === 'partiel' ? '🔶 Gardiennage partiel'     : null,
    data.eau === 'oui'             ? '💧 Eau potable'              : null,
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

// ── Build HTML tags OSM valorisés (catégories sans API externe) ───────────────
export function buildOsmTagsHtml(tags, catKey) {
  const items = [];

  if (catKey === 'waterfall') {
    if (tags.height)            items.push(`📏 Hauteur : ${tags.height} m`);
    if (tags.seasonal === 'yes') items.push('📅 Saisonnier');
    if (tags.access)            items.push(`🚗 ${tags.access}`);
    if (tags.ele)               items.push(`⛰ ${tags.ele} m`);
  }

  if (catKey === 'viewpoint') {
    if (tags.ele)               items.push(`⛰ ${tags.ele} m`);
    if (tags.direction)         items.push(`🧭 Vue ${tags.direction}`);
    if (tags.access)            items.push(`🚗 ${tags.access}`);
    if (tags['panorama:view'])  items.push(`👁 ${tags['panorama:view']}`);
  }

  if (catKey === 'water') {
    if (tags.seasonal === 'yes') items.push('📅 Saisonnière');
    if (tags.flow_rate)          items.push(`🌊 Débit : ${tags.flow_rate}`);
    if (tags.access)             items.push(`🚗 ${tags.access}`);
    if (tags.ele)                items.push(`⛰ ${tags.ele} m`);
  }

  if (catKey === 'trailhead') {
    if (tags.parking === 'yes')  items.push('🅿️ Parking');
    if (tags.access)             items.push(`🚗 ${tags.access}`);
    if (tags.surface)            items.push(`🛤 ${tags.surface}`);
    if (tags.trail_visibility)   items.push(`👁 Balisage : ${tags.trail_visibility}`);
  }

  if (!items.length) return null;

  const tagsHtml = `<div class="pe-tags">${items.map(t => `<span class="pe-tag">${t}</span>`).join('')}</div>`;
  const website  = tags.website
    ? `<div class="pe-links"><a class="pe-link" href="${tags.website}" target="_blank" rel="noopener">🔗 Site officiel</a></div>`
    : '';

  return tagsHtml + website;
}
