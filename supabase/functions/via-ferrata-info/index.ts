/**
 * Edge Function — via-ferrata-info
 *
 * Proxy vers viaferrata-fr.net (pas de CORS côté site).
 * Stratégie :
 *   1. Check cache (TTL 30 j)
 *   2. Page département (fiable — liens au bon format)
 *      → détermine le dept depuis lat/lng
 *   3. Fallback : page de recherche
 *   4. Fetch page détail, parse, cache, retourne JSON
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deno globals — disponibles au runtime, inconnus du LSP VS Code
declare const Deno: { env: { get(key: string): string | undefined } };

const SITE   = "https://www.viaferrata-fr.net";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Fetch ISO-8859-1 ──────────────────────────────────────────────────────────
async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RoadTripApp/1.0)" },
    signal: AbortSignal.timeout(8000),
  });
  const buf = await res.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buf);
}

// ── Extraction des champs clé-valeur (topoTitre) ─────────────────────────────
function parseRows(html: string): Record<string, string> {
  const rows: Record<string, string> = {};
  const re =
    /class="topoTitre">([^<]+?)\s*:(?:&nbsp;)?\s*<\/td>\s*<td[^>]*>(?:&nbsp;)?\s*([^<]*?)\s*(?:&nbsp;)?\s*<\/td>/gi;
  for (const m of html.matchAll(re)) {
    const key = m[1].trim().toLowerCase()
      .replace(/[éèêë]/g, "e").replace(/[àâ]/g, "a")
      .replace(/[ùûü]/g, "u").replace(/[îï]/g, "i").replace(/[ôö]/g, "o")
      .replace(/['’]/g, "'");
    rows[key] = m[2].trim().replace(/&nbsp;/g, " ").trim();
  }
  return rows;
}

// ── Extraction de la description ──────────────────────────────────────────────
function parseDescription(html: string): string {
  const lastTable = html.lastIndexOf("</table>");
  const zone = lastTable > 0 ? html.slice(lastTable) : html;
  const paras: string[] = [];
  for (const m of zone.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/\s+/g, " ").trim();
    if (text.length > 40) paras.push(text);
    if (paras.length >= 3) break;
  }
  return paras.join("\n\n");
}

// ── Slug de cache ─────────────────────────────────────────────────────────────
function toSlug(name: string): string {
  return name.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Nettoyage du terme de recherche ──────────────────────────────────────────
function cleanSearchName(raw: string): string {
  let s = raw.trim().split(":")[0].trim();
  s = s.replace(/^via[\s-]+ferrata[\s-]*/i, "").trim();
  return s || raw.trim();
}

// ── Départements français avec via ferratas (bounding boxes approximatifs) ────
const VF_DEPTS: [number, number, number, number, number][] = [
  [ 1,  45.8, 46.5,  4.8,  5.9],  // Ain
  [ 4,  43.7, 44.9,  5.7,  6.9],  // Alpes-de-Haute-Provence
  [ 5,  44.3, 45.3,  5.8,  7.0],  // Hautes-Alpes
  [ 6,  43.5, 44.4,  6.6,  7.7],  // Alpes-Maritimes
  [ 7,  44.3, 45.5,  3.8,  4.9],  // Ardèche
  [ 9,  42.5, 43.3,  0.9,  2.3],  // Ariège
  [11,  42.6, 43.6,  1.7,  3.3],  // Aude
  [25,  46.6, 47.8,  5.8,  7.1],  // Doubs
  [30,  43.6, 44.7,  3.3,  4.9],  // Gard
  [34,  43.2, 44.0,  2.9,  4.3],  // Hérault
  [38,  44.7, 46.1,  4.8,  6.5],  // Isère
  [39,  45.8, 47.2,  5.3,  6.5],  // Jura
  [42,  45.1, 46.3,  3.7,  4.9],  // Loire
  [43,  44.7, 45.7,  3.1,  4.5],  // Haute-Loire
  [48,  44.2, 45.1,  2.9,  4.0],  // Lozère
  [63,  45.1, 46.1,  2.4,  4.0],  // Puy-de-Dôme
  [64,  42.8, 43.6, -1.8,  0.9],  // Pyrénées-Atlantiques
  [65,  42.6, 43.5, -0.2,  0.8],  // Hautes-Pyrénées
  [66,  42.3, 42.9,  1.8,  3.2],  // Pyrénées-Orientales
  [73,  45.0, 46.0,  5.8,  7.5],  // Savoie
  [74,  45.7, 46.5,  5.8,  7.5],  // Haute-Savoie
  [83,  43.0, 43.9,  5.7,  7.1],  // Var
  [84,  43.6, 44.5,  4.7,  5.9],  // Vaucluse
];

function coordsToDept(lat: number, lng: number): number | null {
  for (const [dept, latMin, latMax, lngMin, lngMax] of VF_DEPTS) {
    if (lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax) return dept;
  }
  return null;
}

// ── Cherche un lien via ferrata sur la page département ───────────────────────
async function findOnDeptPage(dept: number, searchTerm: string): Promise<string | null> {
  const url = `${SITE}/via-ferrata-departement-${dept}.html`;
  console.log("[vf] dept page:", url);
  let html: string;
  try { html = await fetchPage(url); } catch { return null; }

  // Mots significatifs du terme de recherche (≥ 3 chars)
  const termSlug  = toSlug(searchTerm);
  const termWords = termSlug.split("-").filter((w) => w.length >= 3);
  console.log("[vf] term words:", termWords);

  const links: { url: string; slug: string }[] = [];
  for (const m of html.matchAll(/via-ferrata-(\d+)-([^'" <>\r\n]+?)\.html/gi)) {
    links.push({ url: `${SITE}/via-ferrata-${m[1]}-${m[2]}.html`, slug: m[2].toLowerCase() });
  }
  console.log("[vf] dept links found:", links.length, links.map((l) => l.slug).slice(0, 5));

  // Trouve le lien dont le slug contient le plus de mots du terme
  let bestUrl: string | null = null;
  let bestScore = 0;
  for (const link of links) {
    const score = termWords.filter((w) => link.slug.includes(w)).length;
    if (score > bestScore) { bestScore = score; bestUrl = link.url; }
  }

  // Accepte si au moins la moitié des mots matchent (min 1)
  const threshold = Math.max(1, Math.floor(termWords.length / 2));
  return bestScore >= threshold ? bestUrl : null;
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: { name?: string; lat?: number; lng?: number };
  try { body = await req.json(); } catch { body = {}; }

  const { name, lat, lng } = body;
  if (!name?.trim()) {
    return new Response(JSON.stringify({ error: "name required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const cacheKey = toSlug(name);

  // ── Cache ────────────────────────────────────────────────────────────────
  const { data: cached } = await supabase
    .from("via_ferrata_cache").select("*").eq("cache_key", cacheKey).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
    return new Response(JSON.stringify(cached), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const searchTerm = cleanSearchName(name);
  console.log("[vf]", searchTerm, lat, lng);

  let pageUrl: string | null = null;

  // ── 1. Page département (fiable) ─────────────────────────────────────────
  if (lat != null && lng != null) {
    const dept = coordsToDept(lat, lng);
    console.log("[vf] dept:", dept);
    if (dept) pageUrl = await findOnDeptPage(dept, searchTerm);
  }

  // ── 2. Fallback : page de recherche ──────────────────────────────────────
  if (!pageUrl) {
    const searchUrl = `${SITE}/rechercher.php?action=chercher&search=${encodeURIComponent(searchTerm)}`;
    console.log("[vf] search fallback:", searchUrl);
    try {
      const searchHtml = await fetchPage(searchUrl);
      const m = searchHtml.match(/via-ferrata-(\d+)-([^'" <>\r\n]+?)\.html/i);
      if (m) pageUrl = `${SITE}/via-ferrata-${m[1]}-${m[2]}.html`;
    } catch { /* ignore */ }
  }

  if (!pageUrl) {
    console.warn("[vf] not found:", searchTerm);
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  console.log("[vf] page URL:", pageUrl);

  // ── Page détail ──────────────────────────────────────────────────────────
  let detailHtml: string;
  try { detailHtml = await fetchPage(pageUrl); }
  catch {
    return new Response(JSON.stringify({ error: "detail_fetch_failed" }), {
      status: 503, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const rows = parseRows(detailHtml);

  const result = {
    cache_key:      cacheKey,
    osm_name:       name,
    url:            pageUrl,
    difficulty:     rows["difficultes"]        ?? rows["difficulte"]         ?? null,
    duration:       rows["duree"]              ?? rows["temps"]              ?? null,
    length_m:       rows["longueur"]                                         ?? null,
    elevation_gain: rows["denivele"]                                         ?? null,
    start_altitude: rows["altitude de depart"]                               ?? null,
    end_altitude:   rows["altitude d'arrivee"] ?? rows["altitude d arrivee"] ?? null,
    price:          rows["prix"]               ?? rows["tarif"]              ?? null,
    description:    parseDescription(detailHtml),
    fetched_at:     new Date().toISOString(),
  };

  await supabase.from("via_ferrata_cache").upsert(result, { onConflict: "cache_key" });

  return new Response(JSON.stringify(result), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
