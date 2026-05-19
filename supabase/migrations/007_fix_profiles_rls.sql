-- Migration 007 — Recrée les policies RLS de la table profiles
-- Migration 004 les avait supprimées (lignes 195-196) sans les recréer.
-- Résultat : upsert bloqué avec "new row violates row-level security policy".

DO $$
BEGIN
  -- Lecture : tout utilisateur authentifié peut lire les profils
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_select'
  ) THEN
    CREATE POLICY "profiles_select" ON public.profiles
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  -- Écriture : chaque utilisateur gère uniquement son propre profil
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_own_write'
  ) THEN
    CREATE POLICY "profiles_own_write" ON public.profiles
      FOR ALL
      USING    (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;
END $$;
