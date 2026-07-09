-- Migration 016 — Versionne les tables legacy créées via le Dashboard
--
-- user_pins, place_overrides et shared_maps existaient en production
-- (créées à la main dans le SQL Editor) mais n'étaient dans aucune
-- migration : un nouvel environnement ne pouvait pas être reconstruit.
-- Tout est en IF NOT EXISTS / idempotent → no-op sur la production.
--
-- Modèle de sécurité : pas de compte requis, le map_id (UUID généré
-- côté client, stocké en localStorage) fait office de capacité — comme
-- un lien de partage. Les policies sont donc ouvertes à anon +
-- authenticated ; c'est le design historique de la carte libre.

-- ── user_pins — pins personnels de la carte libre ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_pins (
  id           uuid        PRIMARY KEY,
  map_id       uuid        NOT NULL,
  name         text        NOT NULL,
  category     text        NOT NULL DEFAULT 'water',
  lat          double precision NOT NULL,
  lng          double precision NOT NULL,
  description  text        DEFAULT '',
  interest     text        DEFAULT '',
  tip          text        DEFAULT '',
  mood         text        DEFAULT '',
  user_created boolean     DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_pins_map_id_idx ON public.user_pins (map_id);

ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_pins' AND policyname = 'user_pins_all'
  ) THEN
    CREATE POLICY "user_pins_all" ON public.user_pins
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── place_overrides — éditions des lieux statiques ────────────────────────────

CREATE TABLE IF NOT EXISTS public.place_overrides (
  place_id    text        NOT NULL,
  map_id      uuid        NOT NULL,
  name        text,
  category    text,
  description text,
  lat         double precision,
  lng         double precision,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id, map_id)
);

CREATE INDEX IF NOT EXISTS place_overrides_map_id_idx ON public.place_overrides (map_id);

ALTER TABLE public.place_overrides ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'place_overrides' AND policyname = 'place_overrides_all'
  ) THEN
    CREATE POLICY "place_overrides_all" ON public.place_overrides
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── shared_maps — snapshots publics (partage par slug) ────────────────────────

CREATE TABLE IF NOT EXISTS public.shared_maps (
  slug        text        PRIMARY KEY,
  title       text        NOT NULL,
  description text        DEFAULT '',
  pins        jsonb       NOT NULL DEFAULT '[]',
  overrides   jsonb       NOT NULL DEFAULT '{}',
  center_lat  double precision,
  center_lng  double precision,
  zoom        integer,
  base_layer  text        DEFAULT 'osm',
  filters     jsonb       DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_maps ENABLE ROW LEVEL SECURITY;

-- Lecture publique par slug ; création publique (le slug est unique et
-- non devinable via la page de partage) ; ni update ni delete côté client.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shared_maps' AND policyname = 'shared_maps_read'
  ) THEN
    CREATE POLICY "shared_maps_read" ON public.shared_maps
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shared_maps' AND policyname = 'shared_maps_insert'
  ) THEN
    CREATE POLICY "shared_maps_insert" ON public.shared_maps
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $$;
