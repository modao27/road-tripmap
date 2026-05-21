/**
 * Edge Function — datatourisme-nearby
 *
 * Retourne les hébergements, restaurants, événements et patrimoine proches
 * d'une coordonnée GPS via l'API DATAtourisme.
 *
 * Body JSON : { lat, lng, radius?, categories? }
 *   radius     : rayon en km (défaut 15). Cache désactivé si != 15.
 *   categories : filtre CSV "hebergement,restaurant,evenement,patrimoine"
 *
 * Secret requis : DATATOURISME_API_KEY
 * (Supabase Dashboard → Project Settings → Edge Functions → Secrets)
 *
 * Cache par cellule géographique 0.1° × 0.1° (≈ 8 km), TTL 7 j.
 * Le cache n'est utilisé que pour le rayon par défaut (15 km).
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get(key: string): string | undefined } };

const DT_BASE       = "https://api.datatourisme.fr/v1";
const DEFAULT_RADIUS = 15;   // km — rayon par défaut (popup ville)
const MAX_RADIUS     = 50;   // km — rayon max accepté
const TTL_MS         = 7 * 24 * 60 * 60 * 1000;  // 7 jours
const MAX_PER_CAT    = 5;

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
type Category = "hebergement" | "restaurant" | "evenement" | "patrimoine";
const ALL_CATS: Category[] = ["hebergement", "restaurant", "evenement", "patrimoine"];

function classify(types: string[]): Category | null {
  const t = types.join(" ").toLowerCase();
  // Hébergement — types DATAtourisme réels
  if (t.match(/accommodation|hotel|camping|hostel|gite|yurt|treehouse|bedand|vacation|chalet|selfcatering|touristresidence|holidayvillage/))
    return "hebergement";
  // Restauration
  if (t.match(/foodestablishment|restaurant|cafe|bar|bakery|bistro|snack|winery|wineries|tasting/))
    return "restaurant";
  // Événements & activités (Event seul, EntertainmentAndEvent, activités loisirs)
  if (t.match(/entertainmentandevent|festival|concert|exhibition|market|sportingevent|\bevent\b|practice|traineeship|activityprovider|leisuresport|sportsandleisure/))
    return "evenement";
  // Patrimoine
  if (t.match(/culturalsite|museum|castle|monument|religioussite|abbey|church|heritage|archeolog|memorial|remarkablegarden|technicalheritage|naturalheritage/))
    return "patrimoine";
  return null;
}

function iconFor(cat: Category, types: string[]): string {
  const t = types.join(" ").toLowerCase();
  if (cat === "hebergement") {
    if (t.includes("camping") || t.includes("caravan")) return "🏕";
    if (t.includes("hotel"))                             return "🏨";
    if (t.includes("bedand") || t.includes("breakfast")) return "🛏";
    if (t.includes("hostel") || t.includes("youth"))     return "🏠";
    return "🏡";
  }
  if (cat === "restaurant") {
    if (t.includes("cafe") || t.includes("coffee")) return "☕";
    if (t.includes("bar"))                          return "🍺";
    if (t.includes("bakery") || t.includes("boulang")) return "🥐";
    return "🍽";
  }
  if (cat === "evenement") return "📅";
  // patrimoine
  if (t.includes("museum"))                                    return "🏛";
  if (t.includes("castle") || t.includes("chateau"))          return "🏰";
  if (t.includes("church") || t.includes("abbey") || t.includes("religious")) return "⛪";
  if (t.includes("archeolog") || t.includes("memorial"))      return "🗿";
  return "🏛";
}

function langStr(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const v = o["@fr"] ?? o["fr"] ?? o["@en"] ?? o["en"] ?? "";
    return Array.isArray(v) ? (v[0] ?? "") as string : v as string;
  }
  return "";
}

// ── Extraction des champs d'un POI DATAtourisme ───────────────────────────────
function extractPoi(poi: Record<string, unknown>, centerLat: number, centerLng: number) {
  // Nom
  const label = langStr(poi["label"] ?? poi["rdfs:label"] ?? poi["schema:name"]) || "Sans nom";

  // Géolocalisation
  let poiLat = 0, poiLng = 0;
  const loc = (poi["isLocatedAt"] as Record<string, unknown>[] | undefined)?.[0];
  if (loc) {
    const geo = (loc["schema:geo"] ?? loc["geo"]) as Record<string, unknown> | undefined;
    if (geo) {
      poiLat = +((geo["schema:latitude"] ?? geo["latitude"]  ?? 0) as number);
      poiLng = +((geo["schema:longitude"] ?? geo["longitude"] ?? 0) as number);
    }
  }

  // Adresse (ville + code postal)
  let address = "";
  const addr = (loc?.["address"] as Record<string, unknown>[] | undefined)?.[0];
  if (addr) {
    const city = langStr(
      (addr["hasAddressCity"] as Record<string, unknown> | undefined)?.["label"]
    ) || (addr["addressLocality"] as string | undefined) || "";
    const zip  = (addr["postalCode"] as string | undefined) ?? "";
    address = [zip, city].filter(Boolean).join(" ");
  }

  // Contact : URL + téléphone + email — cherche dans tous les objets hasContact
  let url = "", phone = "", email = "";
  const contacts = poi["hasContact"] as Record<string, unknown>[] | undefined;
  for (const c of contacts ?? []) {
    if (!url) {
      const raw = c["homepage"] ?? c["foaf:homepage"] ?? c["schema:url"] ?? c["website"] ?? c["url"] ?? "";
      const v   = Array.isArray(raw) ? raw[0] ?? "" : raw as string;
      if (v) url = v;
    }
    if (!phone) {
      const raw = c["schema:telephone"] ?? c["telephone"] ?? c["phone"] ?? "";
      const v   = Array.isArray(raw) ? raw[0] ?? "" : raw as string;
      if (v) phone = v;
    }
    if (!email) {
      const raw = c["schema:email"] ?? c["email"] ?? "";
      const v   = Array.isArray(raw) ? raw[0] ?? "" : raw as string;
      if (v) email = v;
    }
  }

  // Description courte (max 200 chars)
  let description = "";
  const descs = poi["hasDescription"] as Record<string, unknown>[] | undefined;
  if (descs?.length) {
    const raw = langStr((descs[0]["description"] ?? descs[0]["shortDescription"]) as unknown);
    if (raw) description = raw.length > 200 ? raw.slice(0, raw.lastIndexOf(" ", 200)) + "…" : raw;
  }

  const dist = (poiLat && poiLng)
    ? Math.round(distKm(centerLat, centerLng, poiLat, poiLng) * 10) / 10
    : null;

  const dtPage = (poi["uri"] as string | undefined) ?? "";

  return {
    label: label.trim(), url: url.trim(), phone: phone.trim(), email: email.trim(),
    address: address.trim(), description: description.trim(), dtPage,
    dist, lat: poiLat || null, lng: poiLng || null,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: { lat?: number; lng?: number; radius?: number; categories?: string };
  try { body = await req.json(); } catch { body = {}; }

  const { lat, lng, radius: radiusParam, categories: catsParam } = body;
  if (lat == null || lng == null) {
    return new Response(JSON.stringify({ error: "lat/lng required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const radius    = (typeof radiusParam === "number" && radiusParam > 0)
    ? Math.min(radiusParam, MAX_RADIUS)
    : DEFAULT_RADIUS;
  const useCache  = radius === DEFAULT_RADIUS;
  const filterCats: Set<Category> | null = catsParam
    ? new Set(catsParam.split(",").map(s => s.trim()) as Category[])
    : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // ── Cache (rayon par défaut uniquement) ──────────────────────────────────
  const cellKey = `${Math.round(lat * 10) / 10}_${Math.round(lng * 10) / 10}`;
  if (useCache) {
    const { data: cached } = await supabase
      .from("datatourisme_cache").select("*").eq("cell_key", cellKey).maybeSingle();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
      const data = filterCats
        ? Object.fromEntries(Object.entries(cached.data).filter(([k]) => filterCats.has(k as Category)))
        : cached.data;
      return new Response(JSON.stringify(data), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  const apiKey = Deno.env.get("DATATOURISME_API_KEY") ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 503, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Requête DATAtourisme ─────────────────────────────────────────────────
  const dtUrl = `${DT_BASE}/catalog`
    + `?geo_distance=${lat},${lng},${radius}km`
    + `&page_size=100`
    + `&api_key=${apiKey}`;

  let pois: Record<string, unknown>[];
  try {
    const res = await fetch(dtUrl, {
      // application/ld+json retourne le JSON-LD complet avec @type et rdfs:label
      headers: { "User-Agent": "RoadTripApp/1.0", "Accept": "application/ld+json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`DT API ${res.status}`);
    const json = await res.json();
    pois = (json["@graph"] ?? json["objects"] ?? json) as Record<string, unknown>[];
  } catch (e) {
    console.error("[dt] fetch failed:", e);
    return new Response(JSON.stringify({ error: "fetch_failed" }), {
      status: 503, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Classification et groupement ─────────────────────────────────────────
  type PoiEntry = {
    icon: string; label: string; url: string; phone: string; email: string;
    address: string; description: string; dtPage: string;
    dist: number | null; lat: number | null; lng: number | null;
  };
  const result = Object.fromEntries(ALL_CATS.map(c => [c, [] as PoiEntry[]])) as Record<Category, PoiEntry[]>;

  for (const poi of pois) {
    const rawType = poi["type"] ?? poi["@type"];
    const types   = Array.isArray(rawType) ? rawType as string[]
                  : typeof rawType === "string" ? [rawType]
                  : [];
    const cat = classify(types);
    if (!cat) continue;
    if (result[cat].length >= MAX_PER_CAT + 1) continue;

    const { label, url, phone, email, address, description, dtPage, dist, lat: poiLat, lng: poiLng } = extractPoi(poi, lat, lng);
    if (!label || label === "Sans nom") continue;

    result[cat].push({ icon: iconFor(cat, types), label, url, phone, email, address, description, dtPage, dist, lat: poiLat, lng: poiLng });
  }

  for (const cat of ALL_CATS) {
    result[cat].sort((a, b) => (a.dist ?? 99) - (b.dist ?? 99));
    result[cat] = result[cat].slice(0, MAX_PER_CAT);
  }

  // ── Mise en cache (rayon par défaut uniquement) ──────────────────────────
  if (useCache) {
    await supabase
      .from("datatourisme_cache")
      .upsert({ cell_key: cellKey, data: result }, { onConflict: "cell_key" });
  }

  const response = filterCats
    ? Object.fromEntries(Object.entries(result).filter(([k]) => filterCats.has(k as Category)))
    : result;

  return new Response(JSON.stringify(response), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
