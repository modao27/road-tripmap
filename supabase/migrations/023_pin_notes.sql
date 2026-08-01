-- Migration 023 — Ajoute le champ notes personnelles aux pins
-- Permet à l'utilisateur d'ajouter ses propres notes en plus de la description

ALTER TABLE public.pins
ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.pins.notes IS
  'Notes personnelles de l''utilisateur sur ce lieu (distinctes de la description)';

-- Met à jour la fonction create_pin pour inclure le champ notes
CREATE OR REPLACE FUNCTION public.create_pin(
  p_id           uuid,
  p_roadtrip_id  uuid,
  p_title        text,
  p_lat          double precision,
  p_lng          double precision,
  p_category     text    DEFAULT 'nature',
  p_description  text    DEFAULT '',
  p_notes        text    DEFAULT '',
  p_type         text    DEFAULT 'stop',
  p_status       text    DEFAULT 'active',
  p_order_index  integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pins (
    id, roadtrip_id, created_by,
    title, category, lat, lng,
    description, notes, type, status, order_index
  ) VALUES (
    p_id, p_roadtrip_id, auth.uid(),
    p_title, p_category, p_lat, p_lng,
    p_description, p_notes, p_type, p_status, p_order_index
  );
END;
$$;

