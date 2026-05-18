-- ============================================================
-- Migration 005 — Fix RLS infinite recursion + rt_editor_update bug
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Problème : boucle infinie dans les policies RLS
--   roadtrips.rt_member_read
--     → SELECT roadtrip_members (RLS activé)
--     → roadtrip_members.members_owner_crud
--     → SELECT roadtrips (RLS activé)
--     → roadtrips.rt_member_read  ← boucle !
--   → PostgreSQL lève "infinite recursion detected" → 500 sur /roadtrips
--
-- Fix : wraper les subqueries cross-table dans des fonctions security definer
-- (qui bypassent le RLS), exactement comme can_read_roadtrip / can_write_roadtrip.
--
-- Bug bonus : rt_editor_update avait un WITH CHECK avec "WHERE id = id"
-- (toujours vrai → multiple rows → erreur) — corrigé ici.
-- ============================================================


-- ╔══════════════════════════════════════════════════════════╗
-- ║  1. NOUVEAUX HELPERS (security definer)                  ║
-- ╚══════════════════════════════════════════════════════════╝

create or replace function public.is_roadtrip_owner(rt_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.roadtrips
    where id = rt_id and owner_id = auth.uid()
  );
$$;

comment on function public.is_roadtrip_owner(uuid) is
  'Renvoie true si l''utilisateur courant est owner de ce roadtrip. Security definer = bypass RLS.';

create or replace function public.is_roadtrip_member(rt_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.roadtrip_members
    where roadtrip_id = rt_id and user_id = auth.uid()
  );
$$;

comment on function public.is_roadtrip_member(uuid) is
  'Renvoie true si l''utilisateur courant est membre (tout rôle) de ce roadtrip. Security definer = bypass RLS.';

grant execute on function public.is_roadtrip_owner(uuid)  to authenticated, anon;
grant execute on function public.is_roadtrip_member(uuid) to authenticated, anon;


-- ╔══════════════════════════════════════════════════════════╗
-- ║  2. FIX — roadtrips.rt_member_read                       ║
-- ╚══════════════════════════════════════════════════════════╝
-- Ancienne version : subquery directe sur roadtrip_members (RLS activé)
-- → déclenchait members_owner_crud → recursion sur roadtrips
-- Nouvelle version : via is_roadtrip_member() qui bypass le RLS

drop policy if exists "rt_member_read" on public.roadtrips;

create policy "rt_member_read" on public.roadtrips
  for select
  using (is_roadtrip_member(id));


-- ╔══════════════════════════════════════════════════════════╗
-- ║  3. FIX — roadtrip_members.members_owner_crud            ║
-- ╚══════════════════════════════════════════════════════════╝
-- Ancienne version : subquery directe sur roadtrips (RLS activé)
-- → déclenchait rt_member_read → recursion sur roadtrip_members
-- Nouvelle version : via is_roadtrip_owner() qui bypass le RLS

drop policy if exists "members_owner_crud" on public.roadtrip_members;

create policy "members_owner_crud" on public.roadtrip_members
  for all
  using    (is_roadtrip_owner(roadtrip_id))
  with check (is_roadtrip_owner(roadtrip_id));


-- ╔══════════════════════════════════════════════════════════╗
-- ║  4. FIX — roadtrips.rt_editor_update (bug WITH CHECK)    ║
-- ╚══════════════════════════════════════════════════════════╝
-- Ancienne WITH CHECK : "WHERE id = id" → toujours vrai
-- → retournait plusieurs lignes → erreur "more than one row"
-- Nouvelle version : simplifiée, can_write_roadtrip() suffit

drop policy if exists "rt_editor_update" on public.roadtrips;

create policy "rt_editor_update" on public.roadtrips
  for update
  using    (can_write_roadtrip(id) and owner_id <> auth.uid())
  with check (can_write_roadtrip(id));
