-- Migration 022 — Horaire manuel du tronçon train (Phase I3b)
--
-- Renseigné sur le pin d'arrivée d'un tronçon marqué transport = 'train'
-- (migration 021). Texte libre : aucun calcul ne s'appuie dessus, affichage
-- seulement (pas de source d'horaires réels fiable et gratuite, cf. PLAN.md
-- Phase I / Option B).
--
-- Idempotente.

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS train_departure text,
  ADD COLUMN IF NOT EXISTS train_arrival   text,
  ADD COLUMN IF NOT EXISTS train_number    text;

COMMENT ON COLUMN public.pins.train_departure IS 'Heure de départ du train (texte libre, ex. "08:42").';
COMMENT ON COLUMN public.pins.train_arrival   IS 'Heure d''arrivée du train (texte libre, ex. "11:15").';
COMMENT ON COLUMN public.pins.train_number    IS 'Numéro de train (facultatif, texte libre).';
