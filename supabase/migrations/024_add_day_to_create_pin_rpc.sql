-- Migration 024 — Ajoute le paramètre day à la RPC create_pin
--
-- Permet de spécifier le jour lors de la création d'un pin (utile pour la duplication).

-- Supprime l'ancienne version pour éviter les conflits
DROP FUNCTION IF EXISTS public.create_pin(uuid, uuid, text, double precision, double precision, text, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.create_pin(
  p_id           uuid,
  p_roadtrip_id  uuid,
  p_title        text,
  p_lat          double precision,
  p_lng          double precision,
  p_category     text    DEFAULT 'nature',
  p_description  text    DEFAULT '',
  p_type         text    DEFAULT 'stop',
  p_status       text    DEFAULT 'active',
  p_order_index  integer DEFAULT 0,
  p_day          integer DEFAULT 1,
  p_notes        text    DEFAULT ''
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
    description, type, status, order_index, day, notes
  ) VALUES (
    p_id, p_roadtrip_id, auth.uid(),
    p_title, p_category, p_lat, p_lng,
    p_description, p_type, p_status, p_order_index, p_day, p_notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_pin TO authenticated;
