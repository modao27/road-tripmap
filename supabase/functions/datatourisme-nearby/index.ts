/**
 * Edge Function — datatourisme-nearby
 *
 * Retourne les hébergements, restaurants et événements proches
 * d'une coordonnée GPS via l'API DATAtourisme.
 *
 * Secret requis : DATATOURISME_API_KEY
 * (Supabase Dashboard → Project Settings → Edge Functions → Secrets)
 *
 * Cache par cellule géographique 0.1° × 0.1° (≈ 8 km), TTL 7 j.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get(key: string): string | undefined } };

const DT_BASE  = "https://api.datatourisme.fr/v1";
const TTL_MS   = 7 * 24 * 60 * 60 * 1000;  // 7 jours
const RADIUS   = 15;                         // km

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Distance Haversine (km) ───────────────────────────────────────────────────
function distKm(a: number, b: number, c: number, d: number): number {
  const R = 6371, r = Math.PI / 180;
  const dLat = (c - a) * r, dLng = (d - b) * r;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ── Classification d'un POI DATAtourisme ──────────────────────────────────────
type Category = "hebergement" | "restaurant" | "evenement";

function classify(types: string[]): Category | null {
  const t = types.join(" ").toLowerCase();
  if (t.match(/accommodation|hotel|camping|hostel|gite|yurt|treehouse|bedand|vacation|chalet/))
    return "hebergement";
  if (t.match(/foodestablishment|restaurant|cafe|bar|bakery|bistro|snack/))
    return "restaurant";
  if (t.match(/entertainmentandevent|festival|concert|exhibition|market|sportingevent/))
    return "evenement";
  return null;
}

function iconFor(cat: Category, types: string[]): string {
  if (cat === "hebergement") {
    const t = types.join(" ").toLowerCase();
    if (t.includes("camping") || t.includes("caravan")) return "🏕";
    if (t.includes("hotel"))                             return "🏨";
    if (t.includes("bedand") || t.includes("breakfast")) return "🛏";
    if (t.includes("hostel") || t.includes("youth"))     return "🏠";
    return "🏡";
  }
  if (cat === "restaurant") {
    const t = types.join(" ").toLowerCase();
    if (t.includes("cafe") || t.includes("coffee")) return "☕";
    if (t.includes("bar"))                          return "🍺";
    if (t.includes("bakery") || t.includes("boulang")) return "🥐";
    return "🍽";
  }
  return "📅";
}

// ── Extraction des champs d'un POI DATAtourisme ───────────────────────────────
function extractPoi(poi: Record<string, unknown>, centerLat: number, centerLng: number) {
  // Nom
  const label = (
    (poi["rdfs:label"] as Record<string, string[]> | undefined)?.fr?.[0]
    ?? (poi["rdfs:label"] as Record<string, string>)?.fr
    ?? poi["label"]
    ?? poi["schema:name"]
    ?? "Sans nom"
  ) as string;

  // Coordonnées GPS
  let poiLat = 0, poiLng = 0;
  const loc = (poi["isLocatedAt"] as Record<string, unknown>[] | undefined)?.[0];
  if (loc) {
    const geo = (loc["schema:geo"] ?? loc["geo"]) as Record<string, unknown> | undefined;
    if (geo) {
      poiLat = +((geo["schema:latitude"] ?? geo["latitude"] ?? 0) as number);
      poiLng = +((geo["schema:longitude"] ?? geo["longitude"] ?? 0) as number);
    }
  }

  // Contact
  let url = "";
  const contacts = poi["hasContact"] as Record<string, unknown>[] | undefined;
  if (contacts?.length) {
    const c = contacts[0];
    url = (
      (c["foaf:homepage"] ?? c["schema:url"] ?? c["contact:hasTelephone"]?.[0]) as string
    ) ?? "";
    // Normalise les tableaux
    if (Array.isArray(url)) url = (url as string[])[0] ?? "";
  }

  const dist = (poiLat && poiLng)
    ? Math.round(distKm(centerLat, centerLng, poiLat, poiLng) * 10) / 10
    : null;

  return { label: label.trim(), url: url.trim(), dist };
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: { lat?: number; lng?: number };
  try { body = await req.json(); } catch { body = {}; }

  const { lat, lng } = body;
  if (lat == null || lng == null) {
    return new Response(JSON.stringify({ error: "lat/lng required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Clé de cache : cellule 0.1°
  const cellKey = `${Math.round(lat * 10) / 10}_${Math.round(lng * 10) / 10}`;

  // ── Cache ────────────────────────────────────────────────────────────────
  const { data: cached } = await supabase
    .from("datatourisme_cache").select("*").eq("cell_key", cellKey).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
    return new Response(JSON.stringify(cached.data), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("DATATOURISME_API_KEY") ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 503, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Requête DATAtourisme ─────────────────────────────────────────────────
  const url = `${DT_BASE}/catalog`
    + `?geo_distance=${lat},${lng},${RADIUS}km`
    + `&page_size=100`
    + `&fields=rdfs:label,@type,isLocatedAt,hasContact`
    + `&api_key=${apiKey}`;

  console.log("[dt] fetch:", url.replace(apiKey, "***"));

  let pois: Record<string, unknown>[];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RoadTripApp/1.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`DT API ${res.status}`);
    const json = await res.json();
    pois = (json["objects"] ?? json["@graph"] ?? json) as Record<string, unknown>[];
  } catch (e) {
    console.error("[dt] fetch failed:", e);
    return new Response(JSON.stringify({ error: "fetch_failed" }), {
      status: 503, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  console.log("[dt] raw POIs:", pois.length);

  // ── Classification et groupement ─────────────────────────────────────────
  const result: Record<Category, { icon: string; label: string; url: string; dist: number | null }[]> = {
    hebergement: [],
    restaurant:  [],
    evenement:   [],
  };

  for (const poi of pois) {
    const types = (poi["@type"] as string[] | undefined) ?? [];
    const cat   = classify(types);
    if (!cat) continue;
    if (result[cat].length >= 6) continue;

    const { label, url, dist } = extractPoi(poi, lat, lng);
    if (!label || label === "Sans nom") continue;

    result[cat].push({ icon: iconFor(cat, types), label, url, dist });
  }

  // Tri par distance croissante
  for (const cat of Object.keys(result) as Category[]) {
    result[cat].sort((a, b) => (a.dist ?? 99) - (b.dist ?? 99));
    result[cat] = result[cat].slice(0, 5);
  }

  console.log("[dt] grouped:", Object.entries(result).map(([k, v]) => `${k}:${v.length}`).join(" "));

  // ── Mise en cache ────────────────────────────────────────────────────────
  await supabase
    .from("datatourisme_cache")
    .upsert({ cell_key: cellKey, data: result }, { onConflict: "cell_key" });

  return new Response(JSON.stringify(result), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
