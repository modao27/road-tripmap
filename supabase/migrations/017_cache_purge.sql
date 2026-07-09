-- Migration 017 — Purge hebdomadaire des tables de cache (pg_cron)
--
-- Les Edge Functions ignorent les entrées expirées (TTL vérifié à la
-- lecture) mais ne les suppriment jamais : les tables grossissent
-- indéfiniment. Un job pg_cron purge chaque lundi à 03h17 UTC les
-- entrées au-delà de leur TTL :
--   via_ferrata_cache  : 30 jours (TTL_MS de via-ferrata-info)
--   climbing_cache     : 30 jours (TTL_MS de climbing-info)
--   datatourisme_cache :  7 jours (TTL_MS de datatourisme-nearby)
--
-- cron.schedule est idempotent par nom de job (upsert).

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'purge-caches-weekly',
  '17 3 * * 1',
  $$
    DELETE FROM public.via_ferrata_cache  WHERE fetched_at < now() - interval '30 days';
    DELETE FROM public.climbing_cache     WHERE fetched_at < now() - interval '30 days';
    DELETE FROM public.datatourisme_cache WHERE fetched_at < now() - interval '7 days';
  $$
);
