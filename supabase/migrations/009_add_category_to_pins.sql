-- Migration 009 — Ajoute la colonne category à la table pins
-- La colonne était présente dans migration 001 mais n'a pas été créée
-- (migration appliquée partiellement ou ancienne version du schéma).

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'base';

-- Corrige les pins déjà insérés avec la valeur 'nature' (invalide en UI)
UPDATE public.pins SET category = 'base' WHERE category = 'nature';
