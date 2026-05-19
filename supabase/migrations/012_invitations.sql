-- Migration 012 — Invitations de collaboration par email (sans compte préalable)
--
-- Flow :
--   1. Owner insère une invitation → Supabase envoie un magic link
--   2. L'invité clique le lien → crée son compte → SIGNED_IN
--   3. accept_pending_invitations() est appelée → insère dans roadtrip_members

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roadtrip_invitations (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  roadtrip_id  uuid        NOT NULL REFERENCES public.roadtrips(id) ON DELETE CASCADE,
  invited_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text        NOT NULL,
  role         text        NOT NULL DEFAULT 'editor'
                           CHECK (role IN ('editor', 'viewer')),
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

CREATE INDEX IF NOT EXISTS invitations_email_idx
  ON public.roadtrip_invitations(lower(email))
  WHERE accepted_at IS NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.roadtrip_invitations ENABLE ROW LEVEL SECURITY;

-- Owner : gère ses propres invitations
CREATE POLICY "invitations_owner" ON public.roadtrip_invitations
  FOR ALL
  USING (invited_by = auth.uid());

-- Invité authentifié : lit ses propres invitations (par email)
CREATE POLICY "invitations_self_read" ON public.roadtrip_invitations
  FOR SELECT
  USING (
    lower(email) = lower((
      SELECT email FROM auth.users WHERE id = auth.uid()
    ))
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.roadtrip_invitations TO authenticated;

-- ── Fonction accept_pending_invitations ───────────────────────────────────────
-- Accepte toutes les invitations en attente pour l'utilisateur courant.
-- SECURITY DEFINER car elle doit lire auth.users.email.
-- Retourne le nombre d'invitations acceptées.

CREATE OR REPLACE FUNCTION public.accept_pending_invitations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_inv   record;
  v_count integer := 0;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN 0; END IF;

  FOR v_inv IN
    SELECT * FROM public.roadtrip_invitations
    WHERE lower(email)  = lower(v_email)
      AND accepted_at  IS NULL
      AND expires_at    > now()
  LOOP
    INSERT INTO public.roadtrip_members (roadtrip_id, user_id, role)
    VALUES (v_inv.roadtrip_id, auth.uid(), v_inv.role)
    ON CONFLICT (roadtrip_id, user_id) DO NOTHING;

    UPDATE public.roadtrip_invitations
    SET accepted_at = now()
    WHERE id = v_inv.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_pending_invitations TO authenticated;
