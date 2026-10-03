-- MediWay: automatic review of imported places
-- Run after 20261003_place_hours.sql, in Supabase → SQL Editor. Safe to re-run.
--
-- auto_review_places(city) publishes what clearly passes, merges obvious duplicates, and holds back the
-- rest with a reason. Held places stay hidden until someone looks; nothing low-confidence goes live.
--   select public.auto_review_places('varanasi');          -- preview: counts only, changes nothing
--   select public.auto_review_places('varanasi', false);   -- do it
-- admin.html → Imported places has the same as a button, plus "Auto-published" to undo any mistake.

alter table public.places_staging add column if not exists review_note text;


-- 1. Who may review: admins in the app, or the SQL Editor / service role -------------------

create or replace function public.can_review_places()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
      or session_user in ('postgres', 'supabase_admin')                                   -- SQL Editor
      or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
$$;


-- 2. One place that applies a decision (used by the review button and by auto-review) -------

create or replace function public.apply_place_review(place_ids bigint[], decision text, note text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  p public.places_staging;
  n integer := 0;
begin
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
         set status = 'rejected', review_note = note, reviewed_by = auth.uid(), reviewed_at = now()
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
         set status = 'merged', published_id = p.match_id, review_note = note, reviewed_by = auth.uid(), reviewed_at = now()
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
         set status = 'approved', published_id = 'p' || p.id, review_note = note, reviewed_by = auth.uid(), reviewed_at = now()
       where id = p.id;
    end if;
    n := n + 1;
  end loop;

  return n;
end $$;

revoke execute on function public.apply_place_review(bigint[], text, text) from public, anon, authenticated;

-- The admin buttons
create or replace function public.review_places(place_ids bigint[], decision text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_review_places() then
    raise exception 'Only admins can review places' using errcode = '42501';
  end if;
  return public.apply_place_review(place_ids, decision, 'manual');
end $$;


-- 3. The rules ---------------------------------------------------------------------------
-- Published automatically:
--   • anything also in OpenStreetMap (people mapped it), or
--   • Overture places with confidence ≥ 0.65 and an address or phone
-- Merged automatically: a likely duplicate whose name closely matches the live listing
-- Held for a person: names that are only a category ("Dental hospital"), places that may not be care
--   providers (colleges, vets, salons, suppliers), and unclear duplicates
-- Left hidden: low-confidence Overture places — nothing to do; they never show on the site

create or replace function public.place_review_verdict(p public.places_staging, match_similarity real)
returns text
language sql
immutable
as $$
  select case
    when p.name ~* '(college|school|academy|coaching|training|university|pharmaceuticals?\M|distributors?|wholesale|surgicals\M|surgical (store|agency|house)|equipment|suppl(y|ier)|insurance|ambulance|veterinar|\mpet\M(?!\s*-?\s*ct)|\mspa\M|\mgym\M|yoga|salon|grooming)'
      then 'held: may not be a care provider'
    when length(regexp_replace(
           regexp_replace(lower(p.name), '\m(the|and|of|hospitals?|clinics?|poly ?clinic|medicals?|stores?|hall|pharmacy|chemists?|labs?|laboratory|diagnostics?|pathology|centre|center|dental|nursing|home|phc|chc|primary|health|sub|new|govt|government)\M', ' ', 'g'),
           '[^a-zऀ-ॿ]', '', 'g')) < 2
      then 'held: name is only a category'
    when p.match_id is not null and coalesce(match_similarity, 0) >= 0.5 then 'merge'
    when p.match_id is not null then 'held: unclear duplicate'
    when p.sources @> '[{"source": "osm"}]' then 'approve'
    when p.confidence >= 0.65 and (p.phone is not null or p.address is not null) then 'approve'
    else 'hidden: low confidence'
  end
$$;

create or replace function public.auto_review_places(city_slug text, dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  approve_ids bigint[];
  merge_ids   bigint[];
  held        jsonb;
begin
  if not public.can_review_places() then
    raise exception 'Only admins can review places' using errcode = '42501';
  end if;

  create temp table if not exists _verdicts (id bigint primary key, verdict text) on commit drop;
  truncate _verdicts;
  insert into _verdicts
  select s.id, public.place_review_verdict(s, similarity(lower(h.name), lower(s.name)))
  from public.places_staging s
  left join public.hospitals h on h.id = s.match_id
  where s.city = city_slug and s.status = 'pending';

  select array_agg(id) filter (where verdict = 'approve'),
         array_agg(id) filter (where verdict = 'merge')
    into approve_ids, merge_ids
  from _verdicts;

  select coalesce(jsonb_object_agg(verdict, n), '{}') into held
  from (select verdict, count(*) n from _verdicts where verdict not in ('approve', 'merge') group by verdict) t;

  if not dry_run then
    perform public.apply_place_review(coalesce(merge_ids, '{}'), 'merge', 'auto: duplicate of a live listing');
    perform public.apply_place_review(coalesce(approve_ids, '{}'), 'approve', 'auto: passed the import rules');
    -- Say why the rest is still waiting, for the admin queue
    update public.places_staging s set review_note = v.verdict
    from _verdicts v
    where s.id = v.id and s.status = 'pending' and s.review_note is distinct from v.verdict;
  end if;

  return jsonb_build_object(
    'dry_run', dry_run,
    'publish', coalesce(cardinality(approve_ids), 0),
    'merge', coalesce(cardinality(merge_ids), 0),
    'held', held);
end $$;

revoke execute on function public.auto_review_places(text, boolean) from public, anon;
grant  execute on function public.auto_review_places(text, boolean) to authenticated, service_role;


-- 4. Undo: take an imported place off the site ------------------------------------------

create or replace function public.unpublish_place(place_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_review_places() then
    raise exception 'Only admins can remove places' using errcode = '42501';
  end if;
  -- Only rows that came from an import; the original hand-made listings are never deleted here
  if not exists (select 1 from public.places_staging where published_id = place_id and status = 'approved') then
    raise exception 'Not an imported place: %', place_id;
  end if;
  delete from public.hospitals where id = place_id;
  update public.places_staging
     set status = 'rejected', review_note = 'removed after publishing', reviewed_by = auth.uid(), reviewed_at = now()
   where published_id = place_id;
  return true;
end $$;

revoke execute on function public.unpublish_place(text) from public, anon;
grant  execute on function public.unpublish_place(text) to authenticated;

notify pgrst, 'reload schema';
