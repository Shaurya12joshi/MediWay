#!/usr/bin/env node
// Launch a city when it's good enough for travellers, not before.
//
//   node scripts/launch-city.mjs --city goa            where the city stands: a checklist with coverage numbers and the next step
//   node scripts/launch-city.mjs --city goa --run      runs the steps that can be scripted, then reports:
//                                                        1. import-places.mjs --push      (OpenStreetMap + Overture into the review queue)
//                                                        2. auto_review_places()          (publishes clear cases, holds the rest)
//                                                        3. enrich-hours.mjs --ai --push  (hours and ER status from websites, via Gemini)
//                                                      also passes on: --search --model <id> --yes --rpm <n> --no-overture
//   node scripts/launch-city.mjs --city goa --launch   sets launched = true once every check passes (--force to launch anyway)
//
// The report works with the anon key; it shows the import queue too when SUPABASE_SERVICE_ROLE_KEY is in .env.
// --run and --launch need the service key. What can't be scripted stays with people: the held imports in
// Admin -> Imported places, and Admin -> Hours (Suggestions, then calls to hospitals near tourists).

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { ER_REACH_KM, NEAR_TOURISTS_KM, ROOT, addCitySql, distanceKm, fetchCity, livePlaces, nearestArea, readEnv, supabaseRest } from './lib/city.mjs'

// What "good enough" means. The must: a traveller at any of the sights can reach a known 24/7 emergency
// room within ER_REACH_KM. The rest are warnings: worth improving, but they don't hold a launch back.
const MIN_LIVE_PLACES = 50
const MIN_ER_KNOWN_NEAR_TOURISTS = 0.7 // of hospitals within NEAR_TOURISTS_KM of a tourist area
const MIN_HOURS_NEAR_TOURISTS = 0.4   // of all places there

const args = process.argv.slice(2)
const flag = name => args.includes(`--${name}`)
const option = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const slug = option('city')?.toLowerCase()
if (!slug) fail('Usage: node scripts/launch-city.mjs --city <slug> [--run [--search] [--model <id>] [--yes] [--rpm <n>] [--no-overture]] [--launch [--force]]')

const env = readEnv()
const anon = supabaseRest(env)
const service = supabaseRest(env, { service: true })
if (!anon) fail('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env')
if ((flag('run') || flag('launch')) && !service) fail('--run and --launch need SUPABASE_SERVICE_ROLE_KEY in .env (Supabase -> Project Settings -> API)')

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1) }
const pct = (n, of) => (of ? `${Math.round((100 * n) / of)}%` : '—')

// ---------- Main ----------

async function main() {
  let city = await fetchCity(service ?? anon, slug)
  if (!city) {
    fail(`No city "${slug}" in the cities table. Add it in Supabase -> SQL Editor (launched stays false until this script says it's ready):\n\n${addCitySql(slug)}\n`)
  }
  if (city.launched) console.log(`(${city.name} is already live; this is how it stands.)`)

  if (flag('run')) {
    await runSteps(city)
    city = await fetchCity(service, slug)
  }

  const report = await measure(city)
  const checks = checklist(city, report)
  print(city, report, checks)

  const blockers = checks.filter(c => c.ok === false && !c.warning)
  if (flag('launch')) await launch(city, blockers)
  else if (!blockers.length && !city.launched) console.log(`\nReady. Launch it with: node scripts/launch-city.mjs --city ${slug} --launch`)
}

// ---------- 1. The scripted steps ----------

async function runSteps(city) {
  const pass = names => names.flatMap(n => (n === 'model' || n === 'rpm') ? (option(n) ? [`--${n}`, option(n)] : []) : flag(n) ? [`--${n}`] : [])
  const node = (script, extra) => {
    console.log(`\n$ node scripts/${script} --city ${slug} ${extra.join(' ')}`)
    const { status } = spawnSync(process.execPath, [join(ROOT, 'scripts', script), '--city', slug, ...extra], { stdio: 'inherit' })
    if (status !== 0) fail(`scripts/${script} stopped (exit ${status}). Fix that and run again: finished steps are safe to repeat.`)
  }

  console.log(`\n━━ 1/3 Import ${city.name}`)
  node('import-places.mjs', ['--push', ...pass(['no-overture'])])

  console.log(`\n━━ 2/3 Auto-review`)
  try {
    const result = await service.rpc('auto_review_places', { city_slug: slug, dry_run: false })
    console.log(`✓ Published ${result.publish}, merged ${result.merge} duplicates, held for a person: ${JSON.stringify(result.held)}`)
  } catch (err) {
    fail(`auto_review_places failed: ${err.message.slice(0, 300)}\n  Has 20261003_auto_review.sql been run?`)
  }

  console.log(`\n━━ 3/3 Hours and emergency rooms`)
  node('enrich-hours.mjs', ['--ai', '--push', ...pass(['search', 'model', 'yes', 'rpm'])])
}

// ---------- 2. Where the city stands ----------

async function measure(city) {
  const report = { staging: null }

  // The import queue is admin-only: readable with the service key
  if (service) {
    const rows = await service.all(`places_staging?select=status,review_note&city=eq.${encodeURIComponent(slug)}`)
    report.staging = {
      total: rows.length,
      unreviewed: rows.filter(r => r.status === 'pending' && !r.review_note).length,
      held: rows.filter(r => r.status === 'pending' && r.review_note?.startsWith('held')).length,
    }
  }

  let places
  try {
    places = await livePlaces(anon, city.name, 'id,kind,lat,lng,schedule,er24,phone,website,suggested_schedule,suggested_er24')
  } catch {
    places = await livePlaces(anon, city.name, 'id,kind,lat,lng,schedule,er24,phone,website') // before 20261003_auto_hours.sql
  }
  for (const p of places) p.km = nearestArea(city.areas, p.lat, p.lng).km
  const hasHours = p => Array.isArray(p.schedule) && p.schedule.length > 0
  const near = places.filter(p => p.km <= NEAR_TOURISTS_KM)
  const hospitals = places.filter(p => p.kind === 'hospital')
  const nearHospitals = near.filter(p => p.kind === 'hospital')

  return {
    ...report,
    live: places.length,
    byKind: Object.fromEntries(['hospital', 'clinic', 'pharmacy', 'lab'].map(k => [k, places.filter(p => p.kind === k).length])),
    withHours: places.filter(hasHours).length,
    withPhone: places.filter(p => p.phone).length,
    hospitals: hospitals.length,
    erKnown: hospitals.filter(p => p.er24 != null).length,
    near: near.length,
    nearWithHours: near.filter(hasHours).length,
    nearHospitals: nearHospitals.length,
    nearErKnown: nearHospitals.filter(p => p.er24 != null).length,
    nearEr24: nearHospitals.filter(p => p.er24 === true).length,
    nearUnknownWithPhone: nearHospitals.filter(p => p.er24 == null && p.phone).length,
    // Tourist areas with no known 24/7 ER within reach, and how far the nearest one is
    areasWithoutEr: city.areas.map(a => {
      const km = Math.min(...hospitals.filter(h => h.er24 === true).map(h => distanceKm(a.lat, a.lng, h.lat, h.lng)))
      return { name: a.name, km }
    }).filter(a => !(a.km <= ER_REACH_KM)),
    suggestions: places.filter(p => p.suggested_schedule || p.suggested_er24 != null).length,
  }
}

// Each check: ok true/false (null when it can't be measured), and what to do about it
function checklist(city, r) {
  const n = city.areas.length
  const erShare = r.nearHospitals ? r.nearErKnown / r.nearHospitals : 0
  const hoursShare = r.near ? r.nearWithHours / r.near : 0
  return [
    {
      label: `Tourist areas: ${n ? `${n} (${city.areas.map(a => a.name).join(', ')})` : 'none'}`,
      ok: n > 0,
      fix: `Add where tourists stay and go in Supabase -> SQL Editor (the coverage checks below measure around them):\n` +
           `  update cities set areas = '[{"name": "<ghat / beach / old town>", "lat": <lat>, "lng": <lng>}]' where slug = '${slug}';`,
    },
    {
      label: r.staging ? `Imported: ${r.staging.total} places in the review queue` : 'Imported: unknown (needs SUPABASE_SERVICE_ROLE_KEY to see the queue)',
      ok: r.staging ? r.staging.total > 0 : null,
      fix: `node scripts/import-places.mjs --city ${slug} --push   (or run this script with --run)`,
    },
    {
      label: r.staging ? `Reviewed: ${r.staging.unreviewed} never auto-reviewed` : 'Reviewed: unknown',
      ok: r.staging ? r.staging.unreviewed === 0 : null,
      fix: `Admin -> Imported places -> ⚡ Auto-review (or run this script with --run)`,
    },
    {
      label: `Held imports waiting for a person: ${r.staging?.held ?? '?'}`,
      ok: r.staging ? r.staging.held === 0 : null,
      warning: true,
      fix: 'Admin -> Imported places: they stay hidden until someone decides',
    },
    {
      label: `Live places: ${r.live} (${Object.entries(r.byKind).map(([k, v]) => `${k} ${v}`).join(' · ')})`,
      ok: r.live >= MIN_LIVE_PLACES,
      fix: `At least ${MIN_LIVE_PLACES} needed. Import, then auto-review.`,
    },
    {
      label: n
        ? `A known 24/7 ER within ${ER_REACH_KM} km of every tourist area: ${n - r.areasWithoutEr.length} of ${n} areas` +
          (r.areasWithoutEr.length ? ` (missing: ${r.areasWithoutEr.map(a => `${a.name}, nearest ${Number.isFinite(a.km) ? `${a.km.toFixed(1)} km` : 'none'}`).join('; ')})` : '')
        : `A known 24/7 ER within ${ER_REACH_KM} km of every tourist area: needs the tourist areas first`,
      ok: n > 0 && r.areasWithoutEr.length === 0,
      fix: `A traveller at the sights must have somewhere to go at 2 AM. For the hospitals around those areas:\n` +
           `  node scripts/enrich-hours.mjs --city ${slug} --ai --search --push   (their websites, then Google)\n` +
           `  Admin -> Hours -> Suggestions: accept or reject what was found${r.suggestions ? ` (${r.suggestions} waiting)` : ''}\n` +
           `  Admin -> Hours -> To call: hospitals near tourists, nearest first`,
    },
    {
      label: `ER status known for hospitals within ${NEAR_TOURISTS_KM} km of tourist areas: ${r.nearErKnown} of ${r.nearHospitals} (${pct(r.nearErKnown, r.nearHospitals)}, aim for ${Math.round(MIN_ER_KNOWN_NEAR_TOURISTS * 100)}%)`,
      ok: n > 0 && r.nearHospitals > 0 && erShare >= MIN_ER_KNOWN_NEAR_TOURISTS,
      warning: true,
      fix: `--search covers those without a usable website; ${r.nearUnknownWithPhone} of the unknown ones have a phone number (Admin -> Hours -> To call)`,
    },
    {
      label: `Hours known near tourist areas: ${r.nearWithHours} of ${r.near} places (${pct(r.nearWithHours, r.near)})`,
      ok: r.near > 0 && hoursShare >= MIN_HOURS_NEAR_TOURISTS,
      warning: true,
      fix: `node scripts/enrich-hours.mjs --city ${slug} --ai --push, then Admin -> Hours`,
    },
    {
      label: `Suggestions waiting in Admin -> Hours: ${r.suggestions}`,
      ok: r.suggestions === 0,
      warning: true,
      fix: 'Accept or reject them: each is one tap',
    },
  ]
}

function print(city, r, checks) {
  console.log(`\n${city.name}${city.state ? `, ${city.state}` : ''}: ${city.launched ? 'LIVE' : 'not launched'}`)
  console.log(`  Whole city: ${r.live} places · hours ${pct(r.withHours, r.live)} · phone ${pct(r.withPhone, r.live)} · ` +
              `ER known for ${r.erKnown} of ${r.hospitals} hospitals (${pct(r.erKnown, r.hospitals)})\n`)
  for (const c of checks) {
    const mark = c.ok === true ? '✓' : c.ok === null ? '?' : c.warning ? '!' : '✗'
    console.log(`${mark} ${c.label}`)
    if (c.ok === false) console.log(`    → ${c.fix.replace(/\n/g, '\n    ')}`)
  }
  const blockers = checks.filter(c => c.ok === false && !c.warning)
  if (blockers.length) console.log(`\nNot ready: ${blockers.length} check${blockers.length > 1 ? 's' : ''} to pass (✗). Start with the first one.`)
}

// ---------- 3. Going live ----------

async function launch(city, blockers) {
  if (city.launched) return console.log(`\n${city.name} is already live.`)
  if (blockers.length && !flag('force')) {
    return console.log(`\nNot launching: fix the ✗ checks first, or add --force to launch anyway.`)
  }
  await service.patch(`cities?slug=eq.${encodeURIComponent(slug)}`, { launched: true })
  console.log(`\n✓ ${city.name} is live.${blockers.length ? ' (Launched with --force.)' : ''}\n` +
              `  Redeploy the site now: the build writes /${slug}/hospitals, /${slug}/emergency … and adds them to the sitemap.`)
}

await main()
