/**
 * Edge Function — via-ferrata-info
 *
 * Proxy vers viaferrata-fr.net (pas de CORS côté site).
 * Flow :
 *   1. Reçoit { name } (nom OSM de la via ferrata)
 *   2. Vérifie le cache Supabase (TTL 30 jours)
 *   3. Si absent / expiré : scrape recherche + page détail
 *   4. Stocke en cache, retourne les données JSON
 *
 * Déploiement : supabase functions deploy via-ferrata-info
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://www.viaferrata-fr.net";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

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
      .replace(/[éèê]/g, "e").replace(/[àâ]/g, "a")
      .replace(/'/g, "'").replace(/’/g, "'");
    rows[key] = m[2].trim().replace(/&nbsp;/g, " ").trim();
  }
  return rows;
}

// ── Extraction de la description ──────────────────────────────────────────────
function parseDescription(html: string): string {
  // Cherche les paragraphes après le dernier </table>
  const lastTable = html.lastIndexOf("</table>");
  const zone = lastTable > 0 ? html.slice(lastTable) : html;
  const paras: string[] = [];
  for (const m of zone.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 40) paras.push(text);
    if (paras.length >= 3) break;
  }
  return paras.join("\n\n");
}

// ── Slug de cache ─────────────────────────────────────────────────────────────
function toSlug(name: string): string {
  return name.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: { name?: string };
  try { body = await req.json(); } catch { body = {}; }

  const { name } = body;
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

  // ── Vérification cache ───────────────────────────────────────────────────
  const { data: cached } = await supabase
    .from("via_ferrata_cache")
    .select("*")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < TTL_MS) {
      return new Response(JSON.stringify(cached), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  // ── Recherche sur le site ────────────────────────────────────────────────
  const searchUrl =
    `${SITE}/rechercher.php?action=chercher&search=${encodeURIComponent(name)}`;

  console.log('[vf] search:', searchUrl);

  let searchHtml: string;
  try { searchHtml = await fetchPage(searchUrl); }
  catch (e) {
    console.error('[vf] fetch search failed:', e);
    return new Response(JSON.stringify({ error: "fetch_failed" }), {
      status: 503, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  console.log('[vf] search HTML length:', searchHtml.length);

  // Regex large : capture href relatif ou absolu contenant via-ferrata-[ID]
  const linkMatch = searchHtml.match(/href="([^"]*via-ferrata-\d+[^"]+\.html)"/i);

  if (!linkMatch) {
    // Logue un extrait pour diagnostiquer le format réel des liens
    const snippet = searchHtml.slice(0, 3000).replace(/\s+/g, ' ');
    console.warn('[vf] no link found. HTML snippet:', snippet);
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  console.log('[vf] link found:', linkMatch[1]);

  // Construit l'URL absolue quelle que soit la forme du href
  const href    = linkMatch[1];
  const pageUrl = href.startsWith('http')
    ? href
    : href.startsWith('/')
      ? `${SITE}${href}`
      : `${SITE}/${href}`;

  // ── Page détail ──────────────────────────────────────────────────────────
  let detailHtml: string;
  try { detailHtml = await fetchPage(pageUrl); }
  catch {
    return new Response(JSON.stringify({ error: "detail_fetch_failed" }), {
      status: 503, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const rows = parseRows(detailHtml);

  // Correspondances clés (les labels du site, normalisés sans accents)
  const result = {
    cache_key:      cacheKey,
    osm_name:       name,
    url:            pageUrl,
    difficulty:     rows["difficultes"]       ?? rows["difficulte"]        ?? null,
    duration:       rows["duree"]             ?? rows["temps"]             ?? null,
    length_m:       rows["longueur"]                                       ?? null,
    elevation_gain: rows["denivele"]                                       ?? null,
    start_altitude: rows["altitude de depart"]                             ?? null,
    end_altitude:   rows["altitude d'arrivee"] ?? rows["altitude d arrivee"] ?? null,
    price:          rows["prix"]              ?? rows["tarif"]             ?? null,
    description:    parseDescription(detailHtml),
    fetched_at:     new Date().toISOString(),
  };

  // ── Mise en cache ────────────────────────────────────────────────────────
  await supabase
    .from("via_ferrata_cache")
    .upsert(result, { onConflict: "cache_key" });

  return new Response(JSON.stringify(result), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
