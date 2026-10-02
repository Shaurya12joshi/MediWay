-- Fix doctors whose latitude was 10–25 km north of their real address.
-- Run in Supabase → SQL Editor. Each update only fires while the row still has the bad
-- coordinates (lat > 25.40), so re-running never overwrites a later manual fix.
-- `location` is updated by the sync trigger from the multi-city migration.

-- Exact: the clinic itself is on OpenStreetMap
update public.doctors set lat = 25.27706, lng = 83.00018 where id = 11 and lat > 25.40;          -- Sir Sunderlal Hospital, BHU
update public.doctors set lat = 25.27889, lng = 83.00287 where id in (13, 28) and lat > 25.40;   -- Heritage Hospitals Ltd, Lanka

-- Approximate (within ~1 km): the clinic isn't mapped, so this is the neighbourhood centre.
-- Replace with the exact pin when you have it (Google Maps → right-click the clinic → copy coordinates).
update public.doctors set lat = 25.29523, lng = 82.99784 where id = 9  and lat > 25.40;          -- Bhelupur
update public.doctors set lat = 25.30011, lng = 82.96488 where id = 10 and lat > 25.40;          -- Manduadih
update public.doctors set lat = 25.30596, lng = 82.98375 where id in (12, 26) and lat > 25.40;   -- Mahmoorganj
update public.doctors set lat = 25.34636, lng = 82.99121 where id = 15 and lat > 25.40;          -- Khajuri
update public.doctors set lat = 25.27015, lng = 83.02993 where id = 27 and lat > 25.40;          -- Ramnagar

-- Still needs a manual pin — couldn't locate these reliably:
--   id 8  Swastik Gastro & Liver Clinic, Saket Nagar Colony
--   id 14 Shri Hari Chest Clinic, Bagatpur
--   id 16 Dr Chandra Shekhar Chest Specialist, Orderly Bazar
-- update public.doctors set lat = <lat>, lng = <lng> where id = 8;

-- Hospital h3 "Heritage Hospitals" sat ~1.6 km away inside the BHU campus; OSM has it at Madhav Market
update public.hospitals set lat = 25.27889, lng = 83.00287 where id = 'h3' and lat < 25.270;

-- Check: every Varanasi doctor should now be within ~8 km of the centre, except 8, 14 and 16
select id, name, round((st_distance(location, st_point(82.9739, 25.3176)::geography) / 1000)::numeric, 1) as km_from_centre
from public.doctors order by km_from_centre desc;
