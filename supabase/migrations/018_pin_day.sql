-- Migration 018 — Planning par jour (E1)
--
-- Chaque étape d'un roadtrip appartient à une journée (Jour 1, Jour 2…).
-- L'ordre global reste order_index ; day partitionne la séquence :
-- l'itinéraire est ordonné par (day, order_index).
--
-- Idempotente. Les pins existants tombent dans le Jour 1.

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS day integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.pins.day IS
  'Journée du roadtrip (1 = premier jour). L''itinéraire est ordonné par (day, order_index).';
