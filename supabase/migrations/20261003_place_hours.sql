-- MediWay: opening hours — where they came from, and two ways to fill them
-- Run after 20260930_places_import.sql, in Supabase → SQL Editor. Safe to re-run.
--
--   scripts/enrich-hours.mjs → set_place_hours()     hours read from each place's own web page
--   admin.html → Hours tab   → update_place_hours()  hours confirmed by phone (always win)

-- 1. Provenance ---------------------------------------------------------------
-- hours_source: 'osm' | 'website' | 'phone' | 'unreachable' (called, no answer) | null (entered by hand earlier)

alter table public.hospitals
  add column if not exists hours_source     text,
  add column if not exists hours_checked_at timestamptz;

alter table public.places_staging
  add column if not exists hours_source     text,
  add column if not exists hours_checked_at timestamptz;

update public.places_staging set hours_source = 'osm'
where schedule is not null and hours_source is null;

-- Hours a machine found may be refreshed by a later run; hours a person confirmed may not
create or replace function public.hours_replaceable(current_schedule jsonb, current_source text)
returns boolean
language sql
immutable
as $$
  select current_schedule is null
      or current_schedule = '[]'::jsonb
      or coalesce(current_source in ('osm', 'website', 'unreachable'), false)
$$;


-- 2. set_place_hours: bulk hours from the enrichment script --------------------
-- Takes [{ source_key, schedule, opening_hours, hours_source }]. Updates the staged row and,
-- if it's already live, the published row too.

create or replace function public.set_place_hours(updates jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  staged_count integer;
  live_count integer;
begin
  with incoming as (
    select * from jsonb_to_recordset(updates)
      as x(source_key text, schedule jsonb, opening_hours text, hours_source text)
    where jsonb_typeof(x.schedule) = 'array' and jsonb_array_length(x.schedule) > 0
  ),
  staged as (
    update public.places_staging s set
      schedule = i.schedule, opening_hours = i.opening_hours,
      hours_source = coalesce(i.hours_source, 'website'), hours_checked_at = now()
    from incoming i
    where s.source_key = i.source_key
      and public.hours_replaceable(s.schedule, s.hours_source)
    returning s.published_id, i.schedule, i.opening_hours, coalesce(i.hours_source, 'website') as hours_source
  ),
  live as (
    update public.hospitals h set
      schedule = st.schedule, opening_hours = st.opening_hours,
      hours_source = st.hours_source, hours_checked_at = now()
    from staged st
    where h.id = st.published_id
      and public.hours_replaceable(h.schedule, h.hours_source)
    returning 1
  )
  select (select count(*) from staged), (select count(*) from live) into staged_count, live_count;

  return jsonb_build_object('received', jsonb_array_length(updates), 'staged_rows_updated', staged_count, 'live_rows_updated', live_count);
end $$;

revoke execute on function public.set_place_hours(jsonb) from public, anon, authenticated;
grant  execute on function public.set_place_hours(jsonb) to service_role;


-- 3. update_place_hours: an admin confirmed hours by phone ----------------------
--   outcome 'verified'    → save new_schedule (and ER status for hospitals)
--   outcome 'unreachable' → only note the attempt, so the queue shows it later

create or replace function public.update_place_hours(
  place_id     text,
  outcome      text,
  new_schedule jsonb   default null,
  has_er24     boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  slot jsonb;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Only admins can edit hours' using errcode = '42501';
  end if;

  if outcome = 'unreachable' then
    update public.hospitals set
      hours_checked_at = now(),
      hours_source = case when schedule is null or schedule = '[]'::jsonb then 'unreachable' else hours_source end
    where id = place_id;
    return found;
  end if;

  if outcome <> 'verified' then
    raise exception 'Unknown outcome: %', outcome;
  end if;

  -- Same shape the site reads: [{ "days": [0–6], "open": "HH:MM", "close": "HH:MM" }], close after open
  if new_schedule is not null then
    if jsonb_typeof(new_schedule) <> 'array' or jsonb_array_length(new_schedule) = 0 then
      raise exception 'Hours must be a non-empty list of time slots';
    end if;
    for slot in select * from jsonb_array_elements(new_schedule) loop
      if jsonb_typeof(slot -> 'days') <> 'array' or jsonb_array_length(slot -> 'days') = 0
         or exists (select 1 from jsonb_array_elements_text(slot -> 'days') d where d !~ '^[0-6]$')
         or coalesce(slot ->> 'open', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or coalesce(slot ->> 'close', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or slot ->> 'close' <= slot ->> 'open' then
        raise exception 'Invalid time slot: %', slot;
      end if;
    end loop;
  end if;

  update public.hospitals set
    schedule         = coalesce(new_schedule, schedule),
    opening_hours    = case when new_schedule is not null then null else opening_hours end,
    er24             = case when kind = 'hospital' then coalesce(has_er24, er24) else er24 end,  -- "not sure" keeps what we knew
    hours_source     = 'phone',
    hours_checked_at = now()
  where id = place_id;
  return found;
end $$;

revoke execute on function public.update_place_hours(text, text, jsonb, boolean) from public, anon;
grant  execute on function public.update_place_hours(text, text, jsonb, boolean) to authenticated;


-- 4. Keep hours through re-imports and approvals ---------------------------------
-- stage_places: a re-import without hours must not wipe hours found since
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
       opening_hours, schedule, hours_source, sources, confidence, match_id)
    select i.source_key, i.city, i.kind, i.name, i.address, i.lat, i.lng, i.phone, i.website,
           i.opening_hours, i.schedule, case when i.schedule is not null then 'osm' end,
           coalesce(i.sources, '[]'), coalesce(i.confidence, 0.5),
           (select h.id from public.hospitals h
             where st_dwithin(h.location, i.g, 150)
               and similarity(lower(h.name), lower(i.name)) > 0.3
             order by similarity(lower(h.name), lower(i.name)) desc
             limit 1)
    from incoming i
    on conflict (source_key) do update set
      kind = excluded.kind, name = excluded.name, address = excluded.address,
      lat = excluded.lat, lng = excluded.lng, phone = excluded.phone, website = excluded.website,
      opening_hours = coalesce(excluded.opening_hours, s.opening_hours),
      schedule      = coalesce(excluded.schedule, s.schedule),
      hours_source  = case when excluded.schedule is not null then 'osm' else s.hours_source end,
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

-- review_places: carry hours and their source into the live row
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
        address       = coalesce(h.address, p.address),
        sources       = coalesce(h.sources, '[]') || p.sources,
        -- hours only fill a gap; the live listing's own hours always stay
        schedule         = case when p.schedule is not null and (h.schedule is null or h.schedule = '[]'::jsonb) then p.schedule         else h.schedule end,
        opening_hours    = case when p.schedule is not null and (h.schedule is null or h.schedule = '[]'::jsonb) then p.opening_hours    else h.opening_hours end,
        hours_source     = case when p.schedule is not null and (h.schedule is null or h.schedule = '[]'::jsonb) then p.hours_source     else h.hours_source end,
        hours_checked_at = case when p.schedule is not null and (h.schedule is null or h.schedule = '[]'::jsonb) then p.hours_checked_at else h.hours_checked_at end
      where h.id = p.match_id;
      update public.places_staging
         set status = 'merged', published_id = p.match_id, reviewed_by = auth.uid(), reviewed_at = now()
       where id = p.id;

    else
      -- er24 stays null (unknown) rather than taking a column default of false
      insert into public.hospitals
        (id, name, kind, address, lat, lng, phone, website, opening_hours, schedule, hours_source, hours_checked_at,
         er24, specialty, city, sources)
      values
        ('p' || p.id, p.name, p.kind, p.address, p.lat, p.lng, p.phone, p.website, p.opening_hours,
         p.schedule, p.hours_source, p.hours_checked_at, null, '{}',
         (select name from public.cities where slug = p.city), p.sources)
      on conflict (id) do nothing;
      update public.places_staging
         set status = 'approved', published_id = 'p' || p.id, reviewed_by = auth.uid(), reviewed_at = now()
       where id = p.id;
    end if;
    n := n + 1;
  end loop;

  return n;
end $$;

-- 5. refresh_place_matches: after moving a live listing's pin, re-check which pending imports
--    duplicate it (duplicates are flagged when staged, against the positions at that time)

create or replace function public.refresh_place_matches()
returns integer
language plpgsql
set search_path = public, extensions
as $$
declare
  flagged integer;
begin
  update public.places_staging s set match_id = (
    select h.id from public.hospitals h
    where st_dwithin(h.location, st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography, 150)
      and similarity(lower(h.name), lower(s.name)) > 0.3
    order by similarity(lower(h.name), lower(s.name)) desc
    limit 1)
  where s.status = 'pending';
  select count(*) into flagged from public.places_staging where status = 'pending' and match_id is not null;
  return flagged;
end $$;

revoke execute on function public.refresh_place_matches() from public, anon, authenticated;
grant  execute on function public.refresh_place_matches() to service_role;

notify pgrst, 'reload schema';
