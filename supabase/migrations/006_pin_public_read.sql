-- Migration 006 : lecture des pins pour les roadtrips publics/partagés
-- Permet aux utilisateurs non connectés (anon) de lire les pins d'un roadtrip
-- dont la visibilité est 'shared' ou 'public'.
-- Nécessaire pour que les liens de partage fonctionnent sans authentification.

CREATE POLICY "pin_public_read" ON public.pins
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roadtrips
      WHERE id = roadtrip_id
        AND visibility IN ('shared', 'public')
    )
  );
