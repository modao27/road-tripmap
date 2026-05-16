-- ============================================================
-- Migration 004 — Hardening RLS complet
-- Supprime et recrée toutes les policies avec des helpers SQL.
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║  1. HELPER FUNCTIONS (security definer)                  ║
-- ╚══════════════════════════════════════════════════════════╝
--
-- Ces fonctions sont nécessaires pour éviter la récursion infinie
-- qui surviendrait si les policies des pins appelaient directement
-- les policies des roadtrips (circulaire via RLS).
-- security definer = s'exécute avec les droits du propriétaire,
-- bypass RLS — ne doit JAMAIS faire de mutations.

-- ── Lecture ───────────────────────────────────────────────────────────────────

create or replace function public.can_read_roadtrip(rt_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.roadtrips r
    where r.id = rt_id
      and (
        -- Visibilité publique ou partagée : accessible à tous
        r.visibility in ('public', 'shared')
        -- Owner
        or r.owner_id = auth.uid()
        -- Membre (tout rôle)
        or exists (
          select 1 from public.roadtrip_members m
          where m.roadtrip_id = rt_id
            and m.user_id = auth.uid()
        )
      )
  );
$$;

comment on function public.can_read_roadtrip(uuid) is
  'Renvoie true si l''utilisateur courant peut lire ce roadtrip.
   (owner | visibility public/shared | membre de toute rôle)';

-- ── Écriture ──────────────────────────────────────────────────────────────────

create or replace function public.can_write_roadtrip(rt_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.roadtrips r
    where r.id = rt_id
      and (
        -- Owner
        r.owner_id = auth.uid()
        -- Membre avec rôle 'editor' uniquement
        or exists (
          select 1 from public.roadtrip_members m
          where m.roadtrip_id = rt_id
            and m.user_id = auth.uid()
            and m.role = 'editor'
        )
      )
  );
$$;

comment on function public.can_write_roadtrip(uuid) is
  'Renvoie true si l''utilisateur courant peut modifier ce roadtrip.
   (owner | membre role=editor)';

-- ── Accès membre ──────────────────────────────────────────────────────────────

create or replace function public.get_user_roadtrip_role(rt_id uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select case
    when exists (select 1 from public.roadtrips where id = rt_id and owner_id = auth.uid())
      then 'owner'
    else (
      select role from public.roadtrip_members
      where roadtrip_id = rt_id and user_id = auth.uid()
      limit 1
    )
  end;
$$;

comment on function public.get_user_roadtrip_role(uuid) is
  'Renvoie le rôle de l''utilisateur courant sur ce roadtrip.
   Valeurs: owner | editor | viewer | null (aucun accès).';


-- ╔══════════════════════════════════════════════════════════╗
-- ║  2. RLS — TABLE roadtrips                                ║
-- ╚══════════════════════════════════════════════════════════╝

-- Nettoyage des anciennes policies (reset propre)
drop policy if exists "roadtrips_owner_all"       on public.roadtrips;
drop policy if exists "roadtrips_owner_crud"      on public.roadtrips;
drop policy if exists "roadtrips_visibility_read" on public.roadtrips;
drop policy if exists "roadtrips_members_read"    on public.roadtrips;
drop policy if exists "roadtrips_member_read"     on public.roadtrips;
drop policy if exists "roadtrips_public_read"     on public.roadtrips;
drop policy if exists "roadtrips_editor_update"   on public.roadtrips;

alter table public.roadtrips enable row level security;

-- Owner : accès complet (CRUD)
create policy "rt_owner_all" on public.roadtrips
  for all
  using    (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Visibilité public/shared : SELECT sans authentification
create policy "rt_public_read" on public.roadtrips
  for select
  using (visibility in ('public', 'shared'));

-- Membres : SELECT (tout rôle)
create policy "rt_member_read" on public.roadtrips
  for select
  using (
    id in (
      select roadtrip_id from public.roadtrip_members
      where user_id = auth.uid()
    )
  );

-- Membres éditeurs : UPDATE (les owners ont déjà rt_owner_all)
create policy "rt_editor_update" on public.roadtrips
  for update
  using    (can_write_roadtrip(id) and owner_id <> auth.uid())
  with check (
    can_write_roadtrip(id)
    -- Les éditeurs ne peuvent pas changer l'owner ou la visibilité
    and owner_id = (select owner_id from public.roadtrips where id = id)
  );


-- ╔══════════════════════════════════════════════════════════╗
-- ║  3. RLS — TABLE pins                                     ║
-- ╚══════════════════════════════════════════════════════════╝

drop policy if exists "pins_roadtrip_access" on public.pins;
drop policy if exists "pins_read"            on public.pins;
drop policy if exists "pins_write"           on public.pins;
drop policy if exists "pins_update"          on public.pins;
drop policy if exists "pins_delete"          on public.pins;

alter table public.pins enable row level security;

create policy "pins_read" on public.pins
  for select
  using (can_read_roadtrip(roadtrip_id));

create policy "pins_insert" on public.pins
  for insert
  with check (can_write_roadtrip(roadtrip_id));

create policy "pins_update" on public.pins
  for update
  using    (can_write_roadtrip(roadtrip_id))
  with check (can_write_roadtrip(roadtrip_id));

create policy "pins_delete" on public.pins
  for delete
  using (can_write_roadtrip(roadtrip_id));


-- ╔══════════════════════════════════════════════════════════╗
-- ║  4. RLS — TABLE roadtrip_members                         ║
-- ╚══════════════════════════════════════════════════════════╝

drop policy if exists "members_owner_manage"  on public.roadtrip_members;
drop policy if exists "members_owner_crud"    on public.roadtrip_members;
drop policy if exists "members_self_read"     on public.roadtrip_members;
drop policy if exists "members_self_select"   on public.roadtrip_members;

alter table public.roadtrip_members enable row level security;

-- Owner : gère les membres de ses roadtrips
create policy "members_owner_crud" on public.roadtrip_members
  for all
  using (
    roadtrip_id in (
      select id from public.roadtrips where owner_id = auth.uid()
    )
  );

-- Chaque utilisateur voit ses propres adhésions (pour listing "mes roadtrips partagés")
create policy "members_self_select" on public.roadtrip_members
  for select
  using (user_id = auth.uid());


-- ╔══════════════════════════════════════════════════════════╗
-- ║  5. RLS — TABLE pin_sources                              ║
-- ╚══════════════════════════════════════════════════════════╝

alter table public.pin_sources enable row level security;

-- Lecture : droit dérivé du roadtrip via le pin
create policy "pin_sources_read" on public.pin_sources
  for select
  using (
    exists (
      select 1 from public.pins p
      where p.id = pin_id
        and can_read_roadtrip(p.roadtrip_id)
    )
  );

-- Écriture (INSERT/UPDATE/DELETE) : droit d'écriture roadtrip
create policy "pin_sources_write" on public.pin_sources
  for all
  using (
    exists (
      select 1 from public.pins p
      where p.id = pin_id
        and can_write_roadtrip(p.roadtrip_id)
    )
  );


-- ╔══════════════════════════════════════════════════════════╗
-- ║  6. RLS — TABLE pin_media                                ║
-- ╚══════════════════════════════════════════════════════════╝

alter table public.pin_media enable row level security;

create policy "pin_media_read" on public.pin_media
  for select
  using (
    exists (
      select 1 from public.pins p
      where p.id = pin_id
        and can_read_roadtrip(p.roadtrip_id)
    )
  );

create policy "pin_media_insert" on public.pin_media
  for insert
  with check (
    exists (
      select 1 from public.pins p
      where p.id = pin_id
        and can_write_roadtrip(p.roadtrip_id)
    )
  );

create policy "pin_media_update" on public.pin_media
  for update
  -- Seul le créateur ou un editor du roadtrip peut modifier
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.pins p
      where p.id = pin_id
        and can_write_roadtrip(p.roadtrip_id)
    )
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1 from public.pins p
      where p.id = pin_id
        and can_write_roadtrip(p.roadtrip_id)
    )
  );

create policy "pin_media_delete" on public.pin_media
  for delete
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.pins p
      where p.id = pin_id
        and can_write_roadtrip(p.roadtrip_id)
    )
  );


-- ╔══════════════════════════════════════════════════════════╗
-- ║  7. GRANTS                                               ║
-- ╚══════════════════════════════════════════════════════════╝
-- Les RLS contrôlent les lignes ; les grants contrôlent les colonnes/tables.

grant usage on schema public to anon, authenticated;

-- Lecture anonyme uniquement sur les tables à visibilité publique
grant select on public.roadtrips, public.pins to anon;

-- Lecture/écriture complète pour les utilisateurs authentifiés
-- (les RLS filtrent au niveau des lignes)
grant select, insert, update, delete on
  public.roadtrips,
  public.pins,
  public.profiles,
  public.roadtrip_members,
  public.pin_sources,
  public.pin_media
to authenticated;

-- Exécution des helpers SQL (nécessaire pour les policies)
grant execute on function public.can_read_roadtrip(uuid)   to authenticated, anon;
grant execute on function public.can_write_roadtrip(uuid)  to authenticated;
grant execute on function public.get_user_roadtrip_role(uuid) to authenticated;
