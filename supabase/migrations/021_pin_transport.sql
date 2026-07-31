-- Migration 021 — Transport par tronçon (Phase I2/I3, road trip en train)
--
-- Chaque pin peut porter le mode de transport du tronçon qui y MÈNE
-- ('train' aujourd'hui, NULL = suit le mode global driving/cycling/walking
-- du roadtrip). Miroir de la colonne day (migration 018) : même principe,
-- additif — NULL partout tant qu'aucune gare n'est marquée, comportement
-- inchangé pour tous les roadtrips existants.
--
-- Idempotente.

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS transport text;

ALTER TABLE public.pins
  DROP CONSTRAINT IF EXISTS pins_transport_check;
ALTER TABLE public.pins
  ADD CONSTRAINT pins_transport_check CHECK (transport IS NULL OR transport = 'train');

COMMENT ON COLUMN public.pins.transport IS
  'Transport du tronçon menant à ce pin (''train'' ou NULL = mode global driving/cycling/walking du roadtrip).';
