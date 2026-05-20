-- Migration 014 — Cache escalade (données FFME)
--
-- Stocke les fiches récupérées par l'Edge Function climbing-info.
-- TTL 30 jours géré par la fonction.
-- Accessible uniquement via la service role key (Edge Function).

CREATE TABLE IF NOT EXISTS public.climbing_cache (
  cache_key   text        PRIMARY KEY,   -- slug normalisé du nom OSM
  osm_name    text        NOT NULL,
  url         text,
  site_type   text,
  difficulty  text,
  num_routes  text,
  height_min  text,
  height_max  text,
  rock_type   text,
  season      text,
  access_text text,
  regulations text,
  description text,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.climbing_cache ENABLE ROW LEVEL SECURITY;
