-- Migration 013 — Cache via ferrata (données viaferrata-fr.net)
--
-- Stocke les fiches récupérées par l'Edge Function via-ferrata-info.
-- TTL 30 jours : l'Edge Function recharge si fetched_at > 30 j.
-- Accessible uniquement par la service role key (Edge Function).

CREATE TABLE IF NOT EXISTS public.via_ferrata_cache (
  cache_key      text        PRIMARY KEY,   -- slug normalisé du nom OSM
  osm_name       text        NOT NULL,
  url            text,
  difficulty     text,
  duration       text,
  length_m       text,
  elevation_gain text,
  start_altitude text,
  end_altitude   text,
  price          text,
  description    text,
  fetched_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS : aucun accès client direct — uniquement via Edge Function (service role)
ALTER TABLE public.via_ferrata_cache ENABLE ROW LEVEL SECURITY;
