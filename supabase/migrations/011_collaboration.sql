-- Migration 011 — Collaboration : email dans profiles + lookup par email
--
-- 1. Ajoute la colonne email à profiles
-- 2. Met à jour handle_new_user pour sauvegarder l'email
-- 3. Remplit email pour les profils existants
-- 4. Fonction RPC sécurisée pour chercher un profil par email

-- ── 1. Colonne email ──────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

-- ── 2. Trigger handle_new_user mis à jour ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'display_name',
             split_part(new.email, '@', 1)),
    new.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN new;
END;
$$;

-- ── 3. Remplit l'email des profils existants ──────────────────────────────────

UPDATE public.profiles p
SET    email = u.email
FROM   auth.users u
WHERE  u.id = p.id
  AND  p.email IS NULL;

-- ── 4. Recherche de profil par email (security definer — accès auth.users) ────

CREATE OR REPLACE FUNCTION public.get_profile_by_email(p_email text)
RETURNS TABLE(id uuid, display_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT p.id, p.display_name
  FROM   public.profiles p
  JOIN   auth.users u ON u.id = p.id
  WHERE  lower(u.email) = lower(p_email)
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_by_email TO authenticated;
