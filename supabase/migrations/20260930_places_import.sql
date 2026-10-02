-- MediWay: facility kinds + import staging + admin review
-- Run after 20260930_multi_city.sql, in Supabase → SQL Editor. Safe to re-run.
--
-- Flow: scripts/import-places.mjs → stage_places() → places_staging (pending)
--       → admin.html "Imported places" → review_places() → hospitals (live on the site)

create extension if not exists pg_trgm with schema extensions;


-- 1. `hospitals` holds every facility; `kind` says which ------------------
-- Imported places often lack an address, hours or ER info, so those become optional.

alter table public.hospitals
  add column if not exists kind          text  not null default 'hospital',
  add column if not exists phone         text,
  add column if not exists website       text,
  add column if not exists opening_hours text,                          -- raw OSM hours, kept for reference
  add column if not exists sources       jsonb not null default '[]';   -- where the row came from

alter table public.hospitals alter column address     drop not null;
alter table public.hospitals alter column er24        drop not null;
alter table public.hospitals alter column schedule    drop not null;
alter table public.hospitals alter column specialty   drop not null;
alter table public.hospitals alter column distance_km drop not null;

do $$ begin
  alter table public.hospitals add constraint hospitals_kind_check
    check (kind in ('hospital', 'clinic', 'pharmacy', 'lab'));
exception when duplicate_object then null; end $$;

create index if not exists hospitals_kind_idx on public.hospitals (kind);


-- 2. Staging: imported places wait here until an admin reviews them --------

create table if not exists public.places_staging (
  id            bigint generated always as identity primary key,
  source_key    text not null unique,                 -- e.g. 'osm:node/123'; re-imports update the same row
  city          text not null references public.cities(slug),
  kind          text not null check (kind in ('hospital', 'clinic', 'pharmacy', 'lab')),
  name          text not null,
  address       text,
  lat           double precision not null,
  lng           double precision not null,
  phone         text,
  website       text,
  opening_hours text,
  schedule      jsonb,                                -- parsed hours, same shape as hospitals.schedule
  sources       jsonb not null default '[]',          -- [{ "source": "osm", "id": "node/123" }, ...]
  confidence    real  not null default 0.5,           -- 0–1; high when independent sources agree
  match_id      text,                                 -- hospitals.id this is probably a duplicate of
  status        text  not null default 'pending'
                check (status in ('pending', 'approved', 'merged', 'rejected')),
  published_id  text,                                 -- hospitals.id once approved or merged
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  imported_at   timestamptz not null default now()
);

create index if not exists places_staging_queue_idx on public.places_staging (city, status, confidence desc);

alter table public.places_staging enable row level security;
drop policy if exists "Admins read staging" on public.places_staging;
create policy "Admins read staging" on public.places_staging for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
-- No insert/update policies: writes go through stage_places() and review_places() only.


-- 3. stage_places: bulk upsert from the importer ---------------------------
-- Takes a JSON array of places. Rows an admin already reviewed are left alone.
-- Flags likely duplicates of live rows: within 150 m and a similar name.

create or replace function public.stage_places(places jsonb)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  staged integer;
begin
  with incoming as (
    select x.*, st_setsrid(st_makepoint(x.lng, x.lat), 4326)::geography as g
    from jsonb_to_recordset(places) as x(
      source_key text, city text, kind text, name text, address text,
      lat double precision, lng double precision, phone text, website text,
      opening_hours text, schedule jsonb, sources jsonb, confidence real)
  ),
  upserted as (
    insert into public.places_staging as s
      (source_key, city, kind, name, address, lat, lng, phone, website,
       opening_hours, schedule, sources, confidence, match_id)
    select i.source_key, i.city, i.kind, i.name, i.address, i.lat, i.lng, i.phone, i.website,
           i.opening_hours, i.schedule, coalesce(i.sources, '[]'), coalesce(i.confidence, 0.5),
           (select h.id from public.hospitals h
             where st_dwithin(h.location, i.g, 150)
               and similarity(lower(h.name), lower(i.name)) > 0.3
             order by similarity(lower(h.name), lower(i.name)) desc
             limit 1)
    from incoming i
    on conflict (source_key) do update set
      kind = excluded.kind, name = excluded.name, address = excluded.address,
      lat = excluded.lat, lng = excluded.lng, phone = excluded.phone, website = excluded.website,
      opening_hours = excluded.opening_hours, schedule = excluded.schedule,
      sources = excluded.sources, confidence = excluded.confidence,
      match_id = excluded.match_id, imported_at = now()
    where s.status = 'pending'
    returning 1
  )
  select count(*) into staged from upserted;

  return jsonb_build_object(
    'received', jsonb_array_length(places),
    'staged', staged,
    'skipped_already_reviewed', jsonb_array_length(places) - staged);
end $$;

revoke execute on function public.stage_places(jsonb) from public, anon, authenticated;
grant  execute on function public.stage_places(jsonb) to service_role;


-- 4. review_places: admin decisions ----------------------------------------
--   approve → publish as a new row in hospitals
--   merge   → it duplicates match_id: fill that row's missing phone/website/hours, publish nothing new
--   reject  → never publish

create or replace function public.review_places(place_ids bigint[], decision text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  p public.places_staging;
  n integer := 0;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Only admins can review places' using errcode = '42501';
  end if;
  if decision not in ('approve', 'merge', 'reject') then
    raise exception 'Unknown decision: %', decision;
  end if;

  for p in
    select * from public.places_staging
    where id = any(place_ids) and status = 'pending'
    for update
  loop
    if decision = 'reject' then
      update public.places_staging
         set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
       where id = p.id;

    elsif decision = 'merge' and p.match_id is not null then
      update public.hospitals h set
        phone         = coalesce(h.phone, p.phone),
        website       = coalesce(h.website, p.website),
        opening_hours = coalesce(h.opening_hours, p.opening_hours),
        schedule      = coalesce(h.schedule, p.schedule),
        address       = coalesce(h.address, p.address),
        sources       = coalesce(h.sources, '[]') || p.sources
      where h.id = p.match_id;
      update public.places_staging
         set status = 'merged', published_id = p.match_id, reviewed_by = auth.uid(), reviewed_at = now()
       where id = p.id;

    else
      -- er24 stays null (unknown) rather than taking a column default of false
      insert into public.hospitals
        (id, name, kind, address, lat, lng, phone, website, opening_hours, schedule, er24, specialty, city, sources)
      values
        ('p' || p.id, p.name, p.kind, p.address, p.lat, p.lng, p.phone, p.website, p.opening_hours,
         p.schedule, null, '{}', (select name from public.cities where slug = p.city), p.sources)
      on conflict (id) do nothing;
      update public.places_staging
         set status = 'approved', published_id = 'p' || p.id, reviewed_by = auth.uid(), reviewed_at = now()
       where id = p.id;
    end if;
    n := n + 1;
  end loop;

  return n;
end $$;

revoke execute on function public.review_places(bigint[], text) from public, anon;
grant  execute on function public.review_places(bigint[], text) to authenticated;


-- 5. nearby_hospitals: optional kind filter, room for pharmacies ----------

drop function if exists public.nearby_hospitals(double precision, double precision, double precision, text, integer);

create or replace function public.nearby_hospitals(
  origin_lat       double precision,
  origin_lng       double precision,
  radius_km        double precision default 20,
  specialty_filter text    default null,
  kind_filter      text    default null,
  max_results      integer default 300
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(st_makepoint(origin_lng, origin_lat), 4326)::geography as g
  ),
  hits as (
    select h, st_distance(h.location, o.g, false) as metres
    from public.hospitals h, origin o
    where st_dwithin(h.location, o.g, radius_km * 1000)
      and (specialty_filter is null or h.specialty @> array[specialty_filter])
      and (kind_filter is null or h.kind = kind_filter)
    order by h.location <-> o.g
    limit least(max_results, 1000)
  )
  select coalesce(
    jsonb_agg(
      (to_jsonb(h) - 'location' - 'sources') || jsonb_build_object('distance_km', round((metres / 1000)::numeric, 1))
      order by metres
    ),
    '[]'::jsonb
  )
  from hits;
$$;

grant execute on function public.nearby_hospitals(double precision, double precision, double precision, text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
