-- Migration 020 — Remontée des erreurs front (monitoring)
--
-- Le handler window.onerror affichait l'erreur à l'écran mais rien
-- n'était remonté : impossible de savoir ce qui casse chez les autres
-- utilisateurs. Table en écriture seule pour les clients (RLS) ; la
-- lecture se fait dans le SQL Editor (service role).
-- Champs bornés (CHECK) — le client tronque aussi de son côté.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.client_errors (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message    text        NOT NULL CHECK (char_length(message)    <= 500),
  source     text        DEFAULT '' CHECK (char_length(source)     <= 300),
  stack      text        DEFAULT '' CHECK (char_length(stack)      <= 2000),
  page       text        DEFAULT '' CHECK (char_length(page)       <= 200),
  user_agent text        DEFAULT '' CHECK (char_length(user_agent) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_errors'
      AND policyname = 'client_errors_insert'
  ) THEN
    CREATE POLICY "client_errors_insert" ON public.client_errors
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $$;

-- La purge hebdomadaire couvre aussi les erreurs (30 jours de rétention).
-- cron.schedule est un upsert par nom de job : ceci remplace la commande
-- du job 'purge-caches-weekly' de la migration 017.
SELECT cron.schedule(
  'purge-caches-weekly',
  '17 3 * * 1',
  $$
    DELETE FROM public.via_ferrata_cache  WHERE fetched_at < now() - interval '30 days';
    DELETE FROM public.climbing_cache     WHERE fetched_at < now() - interval '30 days';
    DELETE FROM public.datatourisme_cache WHERE fetched_at < now() - interval '7 days';
    DELETE FROM public.client_errors      WHERE created_at < now() - interval '30 days';
  $$
);
