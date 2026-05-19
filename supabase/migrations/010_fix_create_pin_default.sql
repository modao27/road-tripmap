-- Migration 010 — Corrige le DEFAULT de create_pin : 'nature' → 'base'
-- 'nature' n'est pas une catégorie valide dans l'UI (categories.js).
-- 'base' = "Point d'ancrage" ★

CREATE OR REPLACE FUNCTION public.create_pin(
  p_id           uuid,
  p_roadtrip_id  uuid,
  p_title        text,
  p_lat          double precision,
  p_lng          double precision,
  p_category     text    DEFAULT 'base',
  p_description  text    DEFAULT '',
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
    description, type, status, order_index
  ) VALUES (
    p_id, p_roadtrip_id, auth.uid(),
    p_title, p_category, p_lat, p_lng,
    p_description, p_type, p_status, p_order_index
  );
END;
$$;
