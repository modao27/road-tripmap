-- Migration 019 — Temps réel sur les pins (E3)
--
-- Publie la table pins sur le canal Realtime (postgres_changes) : les
-- éditeurs d'un même roadtrip voient les ajouts/modifications/suppressions
-- des co-équipiers sans recharger. Realtime respecte les policies RLS
-- (un client ne reçoit que les lignes qu'il a le droit de lire).
--
-- Idempotente : no-op si la table est déjà publiée.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'pins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pins;
  END IF;
END $$;
