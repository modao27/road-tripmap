-- ============================================================
-- Migration 002 — Table profiles
-- Étend auth.users avec les données publiques utilisateur.
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Table profiles ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid        references auth.users(id) on delete cascade primary key,
  display_name  text,
  avatar_url    text,
  bio           text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Profil public des utilisateurs, créé automatiquement à l''inscription.';
comment on column public.profiles.display_name is
  'Nom affiché — extrait de l''email si non défini lors de l''inscription.';

-- ── Trigger updated_at ────────────────────────────────────────────────────────
-- Réutilise la fonction créée dans la migration 001
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- ── Index ─────────────────────────────────────────────────────────────────────
create index if not exists profiles_id_idx on public.profiles(id);

-- ── Auto-création du profil lors d'une inscription ───────────────────────────
-- Déclenché après INSERT dans auth.users (géré par Supabase Auth).
-- display_name = raw_user_meta_data.display_name ?? partie avant @ de l'email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;  -- idempotent
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Tout utilisateur authentifié peut lire les profils (nécessaire pour l'UI collaboration)
drop policy if exists "profiles_authenticated_read" on public.profiles;
create policy "profiles_authenticated_read" on public.profiles
  for select
  using (auth.role() = 'authenticated');

-- Chaque utilisateur peut écrire uniquement son propre profil
drop policy if exists "profiles_own_all" on public.profiles;
create policy "profiles_own_all" on public.profiles
  for all
  using    (id = auth.uid())
  with check (id = auth.uid());
