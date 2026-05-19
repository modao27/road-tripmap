-- Migration 008 — Fonction RPC pour créer un pin
-- Contourne le bug de schema cache PostgREST (PGRST204 sur la colonne 'category').
-- PostgREST passe les arguments par nom de paramètre de fonction,
-- indépendamment du cache de schéma de la table.
--
-- Sécurité : SECURITY INVOKER → s'exécute avec les droits de l'appelant.
-- auth.uid() retourne l'utilisateur courant → la RLS pins_insert s'applique.

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

GRANT EXECUTE ON FUNCTION public.create_pin TO authenticated;
