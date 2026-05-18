-- ============================================================
-- Migration 003 — Améliorations schéma + nouvelles tables
-- Tables : pin_sources, pin_media
-- Colonnes ajoutées : roadtrips.slug, pins.order_index / tags
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Améliorations table roadtrips ─────────────────────────────────────────────

-- slug : identifiant lisible pour le partage public (ex: jura-2025-paul)
alter table public.roadtrips
  add column if not exists slug         text unique,
  add column if not exists cover_color  text not null default '#1f5f43';

comment on column public.roadtrips.slug is
  'Identifiant URL-safe pour le partage. NULL = non partagé.';
comment on column public.roadtrips.cover_color is
  'Couleur de couverture (hex) pour l''affichage dashboard.';

-- ── Améliorations table pins ──────────────────────────────────────────────────

-- order_index : position dans l'itinéraire (0 = premier)
-- tags : labels libres pour les filtres futurs (ex: ["eau","camping"])
alter table public.pins
  add column if not exists order_index integer not null default 0,
  add column if not exists tags        text[]  not null default '{}';

comment on column public.pins.order_index is
  'Position dans l''itinéraire. Géré par le planificateur de route.';
comment on column public.pins.tags is
  'Labels libres pour filtrage. Ex: [''eau'', ''camping'', ''urgence''].';

-- ── Table pin_sources ────────────────────────────────────────────────────────
-- Traçabilité de l'origine d'un pin (OSM, CamptoCamp, saisie manuelle…)
-- Prépare : suggestions automatiques, fiabilité des données, attribution.

create table if not exists public.pin_sources (
  id          uuid        default gen_random_uuid() primary key,
  pin_id      uuid        references public.pins(id) on delete cascade not null,
  source_type text        not null
                          check (source_type in (
                            'osm',          -- OpenStreetMap
                            'camptocamp',   -- CamptoCamp API
                            'refuges_info', -- Refuges.info API
                            'manual',       -- Saisie utilisateur
                            'ai',           -- Suggestion IA future
                            'import'        -- Import batch/GPX
                          )),
  source_id   text,       -- ID dans le système source (ex: OSM node 12345)
  source_url  text,       -- URL canonique dans la source
  raw_data    jsonb,      -- Payload brut pour reconstruction / audit
  fetched_at  timestamptz not null default now(),

  -- Un seul enregistrement par couple (pin, source_type)
  unique (pin_id, source_type)
);

comment on table public.pin_sources is
  'Traçabilité de l''origine des pins. Prépare suggestions IA et attribution.';

-- ── Table pin_media ──────────────────────────────────────────────────────────
-- Photos et vidéos associées aux pins.
-- Prépare : upload Supabase Storage, galerie, modération.

create table if not exists public.pin_media (
  id            uuid        default gen_random_uuid() primary key,
  pin_id        uuid        references public.pins(id) on delete cascade not null,
  created_by    uuid        references auth.users(id) on delete set null,
  media_type    text        not null default 'photo'
                            check (media_type in ('photo', 'video')),
  url           text        not null,       -- URL Supabase Storage ou externe
  thumbnail_url text,                       -- Miniature optionnelle
  caption       text        not null default '',
  order_index   integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.pin_media is
  'Médias (photos/vidéos) associés aux pins. URL = Supabase Storage ou externe.';

-- ── Triggers updated_at ───────────────────────────────────────────────────────
drop trigger if exists trg_pin_media_updated_at on public.pin_media;
create trigger trg_pin_media_updated_at
  before update on public.pin_media
  for each row execute function public.update_updated_at();

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Roadtrips : accès rapide par slug (partage) et par visibilité
create index if not exists roadtrips_slug_idx
  on public.roadtrips(slug) where slug is not null;

create index if not exists roadtrips_visibility_idx
  on public.roadtrips(visibility) where visibility <> 'private';

-- Pins : tri par ordre dans l'itinéraire
create index if not exists pins_roadtrip_order_idx
  on public.pins(roadtrip_id, order_index);

-- Pins : index géographique btree pour les requêtes bbox simples.
-- Note : pour des requêtes de rayon ou des géo-opérations avancées,
--        activer l'extension PostGIS et ajouter une colonne geography.
--        Ex : alter table pins add column geog geography(point, 4326)
--             generated always as (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) stored;
create index if not exists pins_lat_lng_idx
  on public.pins(lat, lng);

-- pin_sources : recherche par pin et par type
create index if not exists pin_sources_pin_id_idx
  on public.pin_sources(pin_id);
create index if not exists pin_sources_type_idx
  on public.pin_sources(source_type);

-- pin_media : accès par pin trié par ordre
create index if not exists pin_media_pin_order_idx
  on public.pin_media(pin_id, order_index);
create index if not exists pin_media_created_by_idx
  on public.pin_media(created_by) where created_by is not null;
