-- Two of the original hospitals sat kilometres from their own address; OpenStreetMap has them
-- at the address on record. Run after 20261003_place_hours.sql. Each update only fires while the
-- row still has the old position, so re-running never undoes a later manual fix.

-- Galaxy Hospital: "Dayal Enclave, Mahmoorganj" — pin was 4.6 km north (OSM node 7028725742)
update public.hospitals set lat = 25.305093, lng = 82.975006 where id = 'h6' and lat > 25.34;

-- Shubham Hospital: "S-8/108-F-5A, Maqbool Alam Road, Khajuri" — pin was 2.4 km north (OSM node 7027726621)
update public.hospitals set lat = 25.34408, lng = 82.98821 where id = 'h7' and lat > 25.36;

-- Not changed — needs your call: h4 "Apex Hospital" says DLW Hydel Road, but its pin is in Railwayganj
-- (where OSM has "Apex Hospital, Varanasi"); OSM's "Apex Hospital" on DLW Hydel Road is ~5 km away at
-- 25.283131, 82.968436. If h4 is the DLW one:
-- update public.hospitals set lat = 25.283131, lng = 82.968436 where id = 'h4';

-- Re-flag pending imports that duplicate the moved hospitals (so they show "Possible duplicate")
select public.refresh_place_matches() as pending_places_flagged_as_duplicates;
