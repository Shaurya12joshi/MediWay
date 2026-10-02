-- MediWay: multi-city groundwork
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- Adds a `cities` table and two RPCs (nearby_doctors / nearby_hospitals) that compute
-- distance from wherever the user actually is, instead of the stored distance_km column.

create extension if not exists postgis with schema extensions;


-- 1. Cities -----------------------------------------------------------------
-- A city is "live" when launched = true. Adding a city is one insert, no code change.

create table if not exists public.cities (
  slug        text primary key,                    -- used in links: searchResult.html?city=varanasi
  name        text not null,
  state       text,
  center_lat  double precision not null,
  center_lng  double precision not null,
  radius_km   real not null default 30,            -- how far from the centre still counts as this city
  launched    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.cities enable row level security;
drop policy if exists "Cities are public" on public.cities;
create policy "Cities are public" on public.cities for select using (true);

insert into public.cities (slug, name, state, center_lat, center_lng, radius_km, launched)
values ('varanasi', 'Varanasi', 'Uttar Pradesh', 25.3176, 82.9739, 30, true)
on conflict (slug) do nothing;


-- 2. Location column, kept in sync with lat/lng -----------------------------
-- Imports only need to write lat/lng; the trigger fills `location`.

create or replace function public.sync_location_from_latlng()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.location := case
    when new.lat is null or new.lng is null then null
    else st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography
  end;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['doctors', 'hospitals'] loop
    execute format('alter table public.%I add column if not exists location geography(Point, 4326)', t);

    -- Distances need geography (metres on the globe), not planar geometry
    if (select udt_name from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name = 'location') = 'geometry' then
      execute format('alter table public.%I alter column location type geography(Point, 4326) using location::geography', t);
    end if;

    execute format('update public.%I set location = st_setsrid(st_makepoint(lng, lat), 4326)::geography
                    where lat is not null and lng is not null', t);

    execute format('drop trigger if exists %I on public.%I', t || '_sync_location', t);
    execute format('create trigger %I before insert or update of lat, lng on public.%I
                    for each row execute function public.sync_location_from_latlng()', t || '_sync_location', t);

    execute format('create index if not exists %I on public.%I using gist (location)', t || '_location_gix', t);
    execute format('create index if not exists %I on public.%I using gin (specialty)',  t || '_specialty_gin', t);
  end loop;
end $$;

create index if not exists doctors_languages_gin on public.doctors using gin (languages);


-- 3. Nearby search ----------------------------------------------------------
-- Returns a JSON array of rows (same fields as the table, minus the binary `location`),
-- nearest first, with distance_km computed from the given point (on a sphere, like js/origin.js).
-- security invoker (the default): the tables' own RLS policies still apply.

create or replace function public.nearby_doctors(
  origin_lat      double precision,
  origin_lng      double precision,
  radius_km       double precision default 20,
  specialty_filter text    default null,
  walk_in_only    boolean  default false,
  min_rating      numeric  default 0,
  language_filter text     default null,
  max_results     integer  default 200
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
    select d, st_distance(d.location, o.g, false) as metres
    from public.doctors d, origin o
    where st_dwithin(d.location, o.g, radius_km * 1000)
      and (specialty_filter is null or d.specialty @> array[specialty_filter])
      and (not walk_in_only or d.walk_in)
      and (min_rating <= 0 or d.rating >= min_rating)
      and (language_filter is null or d.languages @> array[language_filter])
    order by d.location <-> o.g
    limit least(max_results, 500)
  )
  select coalesce(
    jsonb_agg(
      (to_jsonb(d) - 'location') || jsonb_build_object('distance_km', round((metres / 1000)::numeric, 1))
      order by metres
    ),
    '[]'::jsonb
  )
  from hits;
$$;

create or replace function public.nearby_hospitals(
  origin_lat       double precision,
  origin_lng       double precision,
  radius_km        double precision default 20,
  specialty_filter text    default null,
  max_results      integer default 100
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
    order by h.location <-> o.g
    limit least(max_results, 500)
  )
  select coalesce(
    jsonb_agg(
      (to_jsonb(h) - 'location') || jsonb_build_object('distance_km', round((metres / 1000)::numeric, 1))
      order by metres
    ),
    '[]'::jsonb
  )
  from hits;
$$;

grant execute on function public.nearby_doctors(double precision, double precision, double precision, text, boolean, numeric, text, integer) to anon, authenticated;
grant execute on function public.nearby_hospitals(double precision, double precision, double precision, text, integer) to anon, authenticated;

-- PostgREST caches the schema; tell it about the new table and functions
notify pgrst, 'reload schema';
