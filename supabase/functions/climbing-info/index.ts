/**
 * Edge Function — climbing-info
 *
 * Proxy vers www.ffme.fr (pas de CORS côté site).
 * Stratégie :
 *   1. Check cache Supabase (TTL 30 j)
 *   2. Fetch page listing FFME (tous les sites en un tableau)
 *   3. Filtre par département (lat/lng → numéro dépt)
 *   4. Matching par nom (mots-clés)
 *   5. Fetch page détail, parse champs .label + <p>
 *   6. Cache et retourne JSON
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get(key: string): string | undefined } };

const FFME_LIST =
  "https://www.ffme.fr/escalade/site-naturel/les-falaises-et-sites-naturels/sites-naturels-descalade-liste/";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Fetch UTF-8 ───────────────────────────────────────────────────────────────
async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RoadTripApp/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── Slug de cache ─────────────────────────────────────────────────────────────
function toSlug(name: string): string {
  return name.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Nettoyage du nom pour la recherche ───────────────────────────────────────
function cleanName(raw: string): string {
  return raw.trim()
    .replace(/^(falaise|site\s+d[''']escalade|rocher[s]?)\s+(de\s+|du\s+|de\s+la\s+|des\s+)?/i, "")
    .replace(/^escalade\s+(de\s+|du\s+|de\s+la\s+|des\s+)?/i, "")
    .trim() || raw.trim();
}

// ── Départements (bounding boxes) ────────────────────────────────────────────
const DEPTS: [number, number, number, number, number][] = [
  [ 1,  45.8, 46.5,  4.8,  5.9],
  [ 4,  43.7, 44.9,  5.7,  6.9],
  [ 5,  44.3, 45.3,  5.8,  7.0],
  [ 6,  43.5, 44.4,  6.6,  7.7],
  [ 7,  44.3, 45.5,  3.8,  4.9],
  [ 9,  42.5, 43.3,  0.9,  2.3],
  [11,  42.6, 43.6,  1.7,  3.3],
  [12,  43.8, 44.9,  1.8,  3.2],
  [13,  43.1, 43.9,  4.8,  6.0],
  [14,  48.8, 49.5, -0.8,  0.4],
  [25,  46.6, 47.8,  5.8,  7.1],
  [26,  44.1, 45.5,  4.6,  5.9],
  [30,  43.6, 44.7,  3.3,  4.9],
  [34,  43.2, 44.0,  2.9,  4.3],
  [38,  44.7, 46.1,  4.8,  6.5],
  [39,  45.8, 47.2,  5.3,  6.5],
  [42,  45.1, 46.3,  3.7,  4.9],
  [43,  44.7, 45.7,  3.1,  4.5],
  [46,  44.3, 45.2,  1.2,  2.4],
  [48,  44.2, 45.1,  2.9,  4.0],
  [50,  48.5, 49.7, -1.9,  1.5],
  [54,  48.3, 49.5,  5.7,  7.7],
  [55,  48.2, 49.9,  4.8,  6.0],
  [57,  48.4, 49.7,  5.9,  7.8],
  [61,  48.1, 49.0, -0.1,  1.0],
  [63,  45.1, 46.1,  2.4,  4.0],
  [64,  42.8, 43.6, -1.8,  0.9],
  [65,  42.6, 43.5, -0.2,  0.8],
  [66,  42.3, 42.9,  1.8,  3.2],
  [69,  45.5, 46.3,  4.2,  5.2],
  [73,  45.0, 46.0,  5.8,  7.5],
  [74,  45.7, 46.5,  5.8,  7.5],
  [77,  48.3, 49.0,  2.6,  3.6],
  [83,  43.0, 43.9,  5.7,  7.1],
  [84,  43.6, 44.5,  4.7,  5.9],
  [85,  46.3, 47.1, -2.4, -0.5],
];

function coordsToDept(lat: number, lng: number): number | null {
  for (const [d, la, lb, ga, gb] of DEPTS) {
    if (lat >= la && lat <= lb && lng >= ga && lng <= gb) return d;
  }
  return null;
}

// ── Extraction champs label/valeur sur la page détail ─────────────────────────
function normalizeKey(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "").trim()
    .replace(/\s+/g, "_");
}

function parseDetailRows(html: string): Record<string, string> {
  const rows: Record<string, string> = {};
  // Tolère les tags internes dans label et valeur
  const re = /<div\s+class="label"[^>]*>([\s\S]*?)<\/div>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  for (const m of html.matchAll(re)) {
    const rawLabel = m[1].replace(/<[^>]+>/g, "").trim();
    const rawValue = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!rawLabel || !rawValue) continue;

    // Gère "Nombre de voies : 19" → key = "nombre_de_voies", count stocké séparément
    const countMatch = rawLabel.match(/^(.+?)\s*:\s*(\d+)\s*$/);
    const cleanLabel = countMatch ? countMatch[1] : rawLabel;
    const key = normalizeKey(cleanLabel);

    rows[key] = rawValue;
    if (countMatch) rows[`${key}_count`] = countMatch[2];
  }
  console.log("[climbing] parsed keys:", Object.keys(rows).join(", "));
  return rows;
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
    .from("climbing_cache").select("*").eq("cache_key", cacheKey).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
    return new Response(JSON.stringify(cached), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const searchTerm = cleanName(name);
  const termSlug   = toSlug(searchTerm);
  const termWords  = termSlug.split("-").filter((w) => w.length >= 3);
  const dept       = (lat != null && lng != null) ? coordsToDept(lat, lng) : null;
  console.log("[climbing] name:", name, "→ term:", searchTerm, "dept:", dept);

  // ── Fetch listing FFME ───────────────────────────────────────────────────
  let listHtml: string;
  try { listHtml = await fetchPage(FFME_LIST); }
  catch (e) {
    console.error("[climbing] listing fetch failed:", e);
    return new Response(JSON.stringify({ error: "fetch_failed" }), {
      status: 503, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Extraction des lignes du tableau ─────────────────────────────────────
  // Format : data-href='https://www.ffme.fr/sne-fiche/ID/'
  //   <td><a ...>Site Name</a></td>
  //   <td>City (Region - DEPT_NUM)</td>
  type SiteRow = { url: string; siteName: string; location: string };
  const rows: SiteRow[] = [];

  const rowRe =
    /data-href='(https:\/\/www\.ffme\.fr\/sne-fiche\/\d+\/)'[^>]*>[\s\S]*?<td><a[^>]*>([^<]+)<\/a><\/td>[\s\S]*?<td>(?:<a[^>]*>)?([^<]+)(?:<\/a>)?<\/td>/gi;
  for (const m of listHtml.matchAll(rowRe)) {
    rows.push({ url: m[1], siteName: m[2].trim(), location: m[3].trim() });
  }
  console.log("[climbing] listing rows:", rows.length);

  if (!rows.length) {
    return new Response(JSON.stringify({ error: "listing_parse_failed" }), {
      status: 503, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Filtrage par département ──────────────────────────────────────────────
  const candidates = dept
    ? rows.filter((r) => r.location.includes(`- ${dept})`))
    : rows;
  console.log("[climbing] candidates after dept filter:", candidates.length);

  // ── Matching par mots-clés ────────────────────────────────────────────────
  function bestMatch(pool: SiteRow[]): { url: string; score: number } | null {
    let bestUrl: string | null = null;
    let bestScore = 0;
    for (const row of pool) {
      const nameSlug = toSlug(row.siteName);
      const score = termWords.filter((w) => nameSlug.includes(w)).length;
      if (score > bestScore) { bestScore = score; bestUrl = row.url; }
    }
    return bestUrl ? { url: bestUrl, score: bestScore } : null;
  }

  const threshold = Math.max(1, Math.floor(termWords.length / 2));

  // 1. Cherche dans le département détecté
  let match = candidates.length ? bestMatch(candidates) : null;

  // 2. Si pas de bon match dans le département, cherche dans toute la France
  if (!match || match.score < threshold) {
    match = bestMatch(rows);
  }

  if (!match || match.score < threshold) {
    console.warn("[climbing] no match for:", searchTerm, "score:", match?.score ?? 0);
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const bestUrl = match.url;
  console.log("[climbing] match:", bestUrl, "score:", match.score);

  // ── Page détail ──────────────────────────────────────────────────────────
  let detailHtml: string;
  try { detailHtml = await fetchPage(bestUrl!); }
  catch {
    return new Response(JSON.stringify({ error: "detail_fetch_failed" }), {
      status: 503, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const fields = parseDetailRows(detailHtml);
  console.log("[climbing] fields keys:", Object.keys(fields).join(", "));

  const result = {
    cache_key:   cacheKey,
    osm_name:    name,
    url:         bestUrl!,
    site_type:   fields["type"]                           ?? null,
    difficulty:  fields["nombre_de_voies"]               ?? null,
    num_routes:  fields["nombre_de_voies_count"]
                   ?? fields["nombre_de_voies"]?.match(/\d+/)?.[0]
                   ?? null,
    height_min:  fields["hauteur_minimale"]               ?? null,
    height_max:  fields["hauteur_maximale"]               ?? null,
    rock_type:   fields["rocher"]                         ?? null,
    season:      fields["periode_favorable"]              ?? null,
    access_text: fields["acces_routier"]                  ?? null,
    regulations: fields["reglementation_particuliere"]    ?? null,
    description: fields["presentation"]                   ?? null,
    fetched_at:  new Date().toISOString(),
  };

  await supabase.from("climbing_cache").upsert(result, { onConflict: "cache_key" });

  return new Response(JSON.stringify(result), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
