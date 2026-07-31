-- Migration 022 — Horaire manuel du tronçon train (Phase I3b)
--
-- Renseigné sur le pin d'arrivée d'un tronçon marqué transport = 'train'
-- (migration 021). Type `time` (pas de texte libre) : trie/valide le
-- format nativement, correspond à un <input type="time"> côté UI. Aucun
-- calcul ne s'appuie dessus — affichage seulement (pas de source
-- d'horaires réels fiable et gratuite, cf. PLAN.md Phase I / Option B).
-- train_number reste text (alphanumérique, ex. "TGV 6612").
--
-- Idempotente.

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS train_departure time,
  ADD COLUMN IF NOT EXISTS train_arrival   time,
  ADD COLUMN IF NOT EXISTS train_number    text;

COMMENT ON COLUMN public.pins.train_departure IS 'Heure de départ du train (type time, ex. 08:42).';
COMMENT ON COLUMN public.pins.train_arrival   IS 'Heure d''arrivée du train (type time, ex. 11:15).';
COMMENT ON COLUMN public.pins.train_number    IS 'Numéro de train (facultatif, texte libre).';
