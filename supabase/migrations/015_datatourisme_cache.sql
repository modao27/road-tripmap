-- Migration 015 — Cache DATAtourisme (POIs proches d'une localisation)
--
-- Clé de cache = cellule géographique arrondie à 0.1° (env. 8 km)
-- → plusieurs pins proches partagent le même cache.
-- TTL 7 j pour POIs statiques, 24 h pour événements (géré par l'Edge Function).

CREATE TABLE IF NOT EXISTS public.datatourisme_cache (
  cell_key   text        PRIMARY KEY,  -- "{lat_0.1}_{lng_0.1}"
  data       jsonb       NOT NULL,     -- { hebergements:[], restaurants:[], evenements:[] }
  fetched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.datatourisme_cache ENABLE ROW LEVEL SECURITY;
