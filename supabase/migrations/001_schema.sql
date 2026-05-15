-- ============================================================
-- Migration 001 — Schéma principal Road Trip Map
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Table roadtrips ────────────────────────────────────────────────────────────
create table if not exists public.roadtrips (
  id            uuid        default gen_random_uuid() primary key,
  owner_id      uuid        references auth.users(id) on delete cascade not null,
  title         text        not null,
  description   text        not null default '',
  start_label   text        not null default '',
  start_lat     double precision,
  start_lng     double precision,
  center_lat    double precision,
  center_lng    double precision,
  default_zoom  integer     not null default 10,
  visibility    text        not null default 'private'
                            check (visibility in ('private','shared','public')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Table pins ────────────────────────────────────────────────────────────────
create table if not exists public.pins (
  id            uuid        default gen_random_uuid() primary key,
  roadtrip_id   uuid        references public.roadtrips(id) on delete cascade not null,
  created_by    uuid        references auth.users(id) on delete set null,
  type          text        not null default 'custom'
                            check (type in ('start','stop','custom','poi')),
  status        text        not null default 'active'
                            check (status in ('active','archived')),
  title         text        not null,
  description   text        not null default '',
  lat           double precision not null,
  lng           double precision not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Table roadtrip_members (collaboration future) ────────────────────────────
create table if not exists public.roadtrip_members (
  id            uuid        default gen_random_uuid() primary key,
  roadtrip_id   uuid        references public.roadtrips(id) on delete cascade not null,
  user_id       uuid        references auth.users(id) on delete cascade not null,
  role          text        not null default 'viewer'
                            check (role in ('owner','editor','viewer')),
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  unique (roadtrip_id, user_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists roadtrips_owner_id_idx       on public.roadtrips(owner_id);
create index if not exists pins_roadtrip_id_idx         on public.pins(roadtrip_id);
create index if not exists members_roadtrip_id_idx      on public.roadtrip_members(roadtrip_id);
create index if not exists members_user_id_idx          on public.roadtrip_members(user_id);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_roadtrips_updated_at on public.roadtrips;
create trigger trg_roadtrips_updated_at
  before update on public.roadtrips
  for each row execute function public.update_updated_at();

drop trigger if exists trg_pins_updated_at on public.pins;
create trigger trg_pins_updated_at
  before update on public.pins
  for each row execute function public.update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table public.roadtrips       enable row level security;
alter table public.pins            enable row level security;
alter table public.roadtrip_members enable row level security;

-- roadtrips : owner accès complet
drop policy if exists "roadtrips_owner_all"    on public.roadtrips;
create policy "roadtrips_owner_all" on public.roadtrips
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- roadtrips : membres en lecture
drop policy if exists "roadtrips_members_read" on public.roadtrips;
create policy "roadtrips_members_read" on public.roadtrips
  for select using (
    id in (
      select roadtrip_id from public.roadtrip_members
      where user_id = auth.uid()
    )
  );

-- pins : accès via roadtrip (owner ou membre)
drop policy if exists "pins_roadtrip_access"   on public.pins;
create policy "pins_roadtrip_access" on public.pins
  for all using (
    roadtrip_id in (
      select id from public.roadtrips where owner_id = auth.uid()
      union
      select roadtrip_id from public.roadtrip_members where user_id = auth.uid()
    )
  );

-- members : owner gère les invitations
drop policy if exists "members_owner_manage"   on public.roadtrip_members;
create policy "members_owner_manage" on public.roadtrip_members
  for all using (
    roadtrip_id in (
      select id from public.roadtrips where owner_id = auth.uid()
    )
  );

-- members : chaque utilisateur voit ses propres adhésions
drop policy if exists "members_self_read"      on public.roadtrip_members;
create policy "members_self_read" on public.roadtrip_members
  for select using (user_id = auth.uid());
