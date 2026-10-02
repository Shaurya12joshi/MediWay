#!/usr/bin/env node
// Import hospitals, clinics, pharmacies and labs for one city into `places_staging`.
// Nothing goes live until an admin approves it in admin.html → Imported places.
//
//   node scripts/import-places.mjs --city varanasi          writes supabase/imports/varanasi-<date>.sql
//                                                           (paste it into Supabase → SQL Editor)
//   node scripts/import-places.mjs --city varanasi --push   stages directly; needs SUPABASE_SERVICE_ROLE_KEY in .env
//   --no-overture                 OSM only (fast)
//   --overture-file <path>        reuse an earlier Overture download (.geojsonseq) instead of fetching again
//
// The city must already exist in the `cities` table (add it with launched = false while you import).
// Sources: OpenStreetMap (always) and Overture Maps (when the `overturemaps` CLI is installed:
// `pip install overturemaps`). OSM data is © OpenStreetMap contributors (ODbL); Overture places are CDLA-2.0.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const USER_AGENT = 'MediWay-importer/1.0 (+https://github.com/Shaurya12joshi/MEDROUTE)'
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

// ---------- CLI & env ----------

const args = process.argv.slice(2)
const flag = name => args.includes(`--${name}`)
const option = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }

const slug = option('city')?.toLowerCase()
if (!slug) {
  console.error('Usage: node scripts/import-places.mjs --city <slug> [--push] [--no-overture] [--overture-file <path>]')
  process.exit(1)
}

const env = { ...readEnvFile(join(ROOT, '.env')), ...process.env }
const SUPABASE_URL = env.VITE_SUPABASE_URL
if (!SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) fail('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env')
if (flag('push') && !env.SUPABASE_SERVICE_ROLE_KEY) {
  fail('--push needs SUPABASE_SERVICE_ROLE_KEY in .env (Supabase → Project Settings → API). Keep it out of any VITE_ variable.')
}

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(readFileSync(path, 'utf8').split('\n')
    .map(line => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^(['"])(.*)\1$/, '$2')]))
}

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1) }

// ---------- Main ----------

async function main() {
  const city = await fetchCity(slug)
  const radiusM = Math.round(city.radius_km * 1000)
  console.log(`→ ${city.name}: ${city.radius_km} km around ${city.center_lat}, ${city.center_lng}`)

  const osm = await fetchOsm(city.center_lat, city.center_lng, radiusM)
  console.log(`  OpenStreetMap: ${osm.length} named places`)

  let overture = []
  if (flag('no-overture')) console.log('  Overture: skipped (--no-overture)')
  else if (option('overture-file')) {
    overture = readOverture(option('overture-file'), city, radiusM)
    console.log(`  Overture: ${overture.length} places (from ${option('overture-file')})`)
  }
  else if (!hasOvertureCli()) console.log('  Overture: skipped — `pip install overturemaps` to add it (much better pharmacy coverage)')
  else {
    overture = fetchOverture(city, radiusM)
    console.log(`  Overture: ${overture.length} places`)
  }

  // OSM first: when a place is in both, the OSM record's name, position and key win
  const places = mergeDuplicates([...osm, ...overture])
    .map(({ overtureConfidence, ...p }) => ({ ...p, city: slug, confidence: confidenceOf(p, overtureConfidence) }))
    .sort((a, b) => b.confidence - a.confidence)

  printSummary(places)

  if (flag('push')) {
    const result = await pushToSupabase(places)
    console.log(`✓ Staged: ${JSON.stringify(result)}`)
  } else {
    const files = writeSqlFile(places, city)
    console.log(`✓ Wrote ${files.join('\n        ')}\n  Run ${files.length > 1 ? 'each file' : 'it'} in Supabase → SQL Editor, then review in admin.html → Imported places.`)
  }
}

// ---------- Supabase ----------

async function fetchCity(slug) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cities?slug=eq.${encodeURIComponent(slug)}&select=*`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) fail(`Couldn't read the cities table (${res.status}). Has 20260930_multi_city.sql been run?`)
  const [row] = await res.json()
  if (!row) {
    fail(`No city "${slug}" in the cities table. Add it first, e.g.:\n` +
      `  insert into cities (slug, name, state, center_lat, center_lng, radius_km, launched)\n` +
      `  values ('${slug}', '<Name>', '<State>', <lat>, <lng>, 25, false);`)
  }
  return row
}

async function pushToSupabase(places) {
  const totals = { received: 0, staged: 0, skipped_already_reviewed: 0 }
  for (let i = 0; i < places.length; i += 500) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/stage_places`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ places: places.slice(i, i + 500) }),
    })
    if (!res.ok) fail(`stage_places failed (${res.status}): ${await res.text()}\n  Has 20260930_places_import.sql been run?`)
    const r = await res.json()
    for (const k in totals) totals[k] += r[k]
  }
  return totals
}

// One file per 400 places keeps each paste into the SQL Editor small
function writeSqlFile(places, city) {
  const dir = join(ROOT, 'supabase', 'imports')
  mkdirSync(dir, { recursive: true })
  const base = `${slug}-${new Date().toISOString().slice(0, 10)}`
  const parts = Math.ceil(places.length / 400) || 1
  const files = []
  for (let i = 0; i < parts; i++) {
    const json = JSON.stringify(places.slice(i * 400, (i + 1) * 400))
    if (json.includes('$mediway_import$')) fail('Place data contains the SQL quote tag; aborting.')
    const file = join(dir, parts > 1 ? `${base}.part${i + 1}-of-${parts}.sql` : `${base}.sql`)
    writeFileSync(file,
      `-- ${city.name}: places ${i * 400 + 1}–${Math.min((i + 1) * 400, places.length)} of ${places.length}, ` +
      `generated by scripts/import-places.mjs on ${new Date().toISOString()}\n` +
      `-- Stages them for review; nothing is published until approved in admin.html.\n` +
      `select public.stage_places($mediway_import$${json}$mediway_import$::jsonb);\n`)
    files.push(file.replace(ROOT + '/', ''))
  }
  return files
}

// ---------- OpenStreetMap ----------

async function fetchOsm(lat, lng, radiusM) {
  const around = `(around:${radiusM},${lat},${lng})`
  const query = `[out:json][timeout:180];
    (
      nwr["amenity"~"^(hospital|clinic|doctors|dentist|pharmacy)$"]["name"]${around};
      nwr["healthcare"~"^(hospital|clinic|doctor|dentist|pharmacy|laboratory|centre)$"]["name"]${around};
      nwr["shop"="chemist"]["name"]${around};
    );
    out center tags;`
  const json = await overpass(query)
  return json.elements.map(osmToPlace).filter(Boolean)
}

// Public Overpass servers are often busy: try each mirror, twice, before giving up
async function overpass(query) {
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of OVERPASS_MIRRORS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(200_000),
        })
        if (res.ok) return await res.json()
        console.log(`  (${new URL(url).host} answered ${res.status}, trying the next mirror)`)
      } catch (err) {
        console.log(`  (${new URL(url).host} failed: ${err.message}, trying the next mirror)`)
      }
    }
    await new Promise(r => setTimeout(r, 10_000))
  }
  fail('Every Overpass mirror failed. Try again in a few minutes.')
}

function osmKind(t) {
  if (t.amenity === 'hospital' || t.healthcare === 'hospital') return 'hospital'
  if (t.amenity === 'pharmacy' || t.healthcare === 'pharmacy' || t.shop === 'chemist') return 'pharmacy'
  if (t.healthcare === 'laboratory') return 'lab'
  return 'clinic'
}

function osmToPlace(el) {
  const t = el.tags ?? {}
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  const name = cleanName(t.name)
  if (!name || lat == null || lng == null) return null
  if (/veterinar|animal|pet /i.test(`${name} ${t.healthcare_speciality ?? ''}`)) return null
  const address = t['addr:full'] || [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] ?? t['addr:neighbourhood'], t['addr:city']]
    .filter(Boolean).join(', ') || null
  return {
    source_key: `osm:${el.type}/${el.id}`,
    kind: kindFromName(name, osmKind(t)),
    name,
    address,
    lat: round6(lat),
    lng: round6(lng),
    phone: cleanPhone(t.phone ?? t['contact:phone'] ?? t['contact:mobile']),
    website: cleanWebsite(t.website ?? t['contact:website'] ?? t.url),
    opening_hours: t.opening_hours ?? null,
    schedule: parseOpeningHours(t.opening_hours),
    sources: [{ source: 'osm', id: `${el.type}/${el.id}` }],
  }
}

// Names beat tags: a "Medical Store" mapped as a hospital is still a pharmacy
const PHARMACY_BY_NAME = /\b(medical (stores?|hall|agency)|chemists?|pharmacy|medicos|drug (house|stores?))\b/i
const LAB_NAME = /path\s?labs?|patholog|diagnos|\blabs?\b|\bscans?\b|x-?ray|imaging/i
function kindFromName(name, kind) {
  if (!kind || /hospital/i.test(name)) return kind
  if (PHARMACY_BY_NAME.test(name)) return 'pharmacy'
  if (LAB_NAME.test(name) && !/clinic/i.test(name)) return 'lab'
  return kind
}

// ---------- Overture Maps ----------

function hasOvertureCli() {
  try { execFileSync('overturemaps', ['--help'], { stdio: 'ignore' }); return true } catch { return false }
}

function fetchOverture(city, radiusM) {
  // bbox around the circle; points outside the radius are dropped below
  const dLat = radiusM / 111_320
  const dLng = radiusM / (111_320 * Math.cos(city.center_lat * Math.PI / 180))
  const bbox = [city.center_lng - dLng, city.center_lat - dLat, city.center_lng + dLng, city.center_lat + dLat]
    .map(n => n.toFixed(5)).join(',')
  const out = join(tmpdir(), `mediway-overture-${slug}-${Date.now()}.geojsonseq`)
  console.log('  Overture: downloading (can take a few minutes)…')
  try {
    execFileSync('overturemaps', ['download', `--bbox=${bbox}`, '-f', 'geojsonseq', '--type=place', '-o', out], { stdio: ['ignore', 'ignore', 'inherit'] })
  } catch (err) {
    console.log(`  Overture: download failed, continuing with OSM only.\n` +
      `  (CERTIFICATE_VERIFY_FAILED above? Run "Install Certificates.command" in your /Applications/Python 3.x folder once.)`)
    return []
  }
  const places = readOverture(out, city, radiusM)
  rmSync(out, { force: true })
  rmSync(`${out}.state`, { force: true })
  return places
}

function readOverture(file, city, radiusM) {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map(line => overtureToPlace(JSON.parse(line)))
    .filter(p => p && distanceM(p.lat, p.lng, city.center_lat, city.center_lng) <= radiusM)
}

// Overture files each place under a `basic_category` (plus a finer `taxonomy.primary`).
// Anything not listed here — vets, opticians' shops, pharma companies, schools — is skipped.
const OVERTURE_KIND = {
  hospital: 'hospital',
  pharmacy_and_drug_store: 'pharmacy',
  diagnostics_imaging_or_lab_service: 'lab',
  dental_clinic: 'clinic',
  health_care: 'clinic',
  specialized_health_care: 'clinic',
  primary_care_or_general_clinic: 'clinic',
  pediatric_clinic: 'clinic',
  reproductive_perinatal_and_womens_care: 'clinic',
  vision_or_eye_care_clinic: 'clinic',
  physical_medicine_and_rehabilitation: 'clinic',
  behavioral_or_mental_health_clinic: 'clinic',
  surgery: 'clinic',
  specialized_medical_facility: 'clinic',
}
const PHARMACY_NAME = /medical|medico|pharma|chemist|drug|medicine/i

function overtureKind(p, name) {
  const primary = p.taxonomy?.primary
  // In India a "medical store" is a pharmacy, but Overture files many as medical_supply_store
  if (primary === 'medical_supply_store') return PHARMACY_NAME.test(name) ? 'pharmacy' : null
  if (['laboratory', 'b2b_clinical_lab', 'laboratory_testing'].includes(primary)) return LAB_NAME.test(name) || primary !== 'laboratory' ? 'lab' : null
  const kind = OVERTURE_KIND[p.basic_category]
  return kind ?? null
}

function overtureToPlace(feature) {
  const p = feature.properties ?? {}
  const name = cleanName(p.names?.primary)
  const [lng, lat] = feature.geometry?.coordinates ?? []
  if (!name || lat == null || (p.confidence ?? 0) < 0.4) return null
  if (p.operating_status && p.operating_status !== 'open') return null
  const kind = kindFromName(name, overtureKind(p, name))
  if (!kind) return null
  const a = p.addresses?.[0]
  return {
    source_key: `overture:${p.id ?? feature.id}`,
    kind,
    name,
    address: [a?.freeform, a?.locality].filter(Boolean).join(', ') || null,
    lat: round6(lat),
    lng: round6(lng),
    phone: cleanPhone(p.phones?.[0]),
    website: cleanWebsite(p.websites?.[0]),
    opening_hours: null,
    schedule: null,
    overtureConfidence: p.confidence,
    sources: [{ source: 'overture', id: p.id ?? feature.id }],
  }
}

// ---------- Merging duplicates across sources ----------

// Same place listed twice (OSM + Overture, or two OSM objects): close together with similar names.
function mergeDuplicates(places) {
  const cell = 0.003 // ~330 m grid: anything within 300 m is in this or an adjacent cell
  const grid = new Map()
  const key = (x, y) => `${x},${y}`
  const merged = []

  for (const p of places) {
    const cx = Math.floor(p.lng / cell), cy = Math.floor(p.lat / cell)
    let match = null, best = 0
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const q of grid.get(key(cx + dx, cy + dy)) ?? []) {
        if (!compatibleKinds(p.kind, q.kind)) continue
        const sim = nameSimilarity(p.name, q.name)
        if (isSamePlace(sim, distanceM(p.lat, p.lng, q.lat, q.lng)) && sim > best) { match = q; best = sim }
      }
    }
    if (match) { absorb(match, p); continue }
    const copy = { ...p, sources: [...p.sources] }
    merged.push(copy)
    const k = key(cx, cy)
    grid.set(k, [...(grid.get(k) ?? []), copy])
  }
  return merged
}

// Sources disagree on position by up to a few hundred metres, so the closer the names, the further apart
// two records may be. Tuned on Varanasi: OSM vs Overture put the same hospital 150–250 m apart.
function isSamePlace(nameSim, metres) {
  return (nameSim >= 0.9 && metres <= 300) ||
         (nameSim >= 0.5 && metres <= 150) ||
         (nameSim >= 0.4 && metres <= 60) ||
         (nameSim >= 0.3 && metres <= 30)
}

function compatibleKinds(a, b) {
  return a === b || (['hospital', 'clinic'].includes(a) && ['hospital', 'clinic'].includes(b))
}

// Keep the first record's identity (OSM comes first), fill its gaps from the duplicate
function absorb(into, from) {
  for (const f of ['address', 'phone', 'website', 'opening_hours', 'schedule']) into[f] ??= from[f]
  if (into.kind === 'clinic' && from.kind === 'hospital') into.kind = 'hospital'
  into.overtureConfidence ??= from.overtureConfidence
  for (const s of from.sources) if (!into.sources.some(x => x.source === s.source && x.id === s.id)) into.sources.push(s)
}

// 0–1. Two independent sources agreeing is the strongest signal.
function confidenceOf(p, overtureConfidence = 0.5) {
  const fromOsm = p.sources.some(s => s.source === 'osm')
  const fromOverture = p.sources.some(s => s.source === 'overture')
  let c = fromOsm && fromOverture ? 0.9 : fromOsm ? 0.75 : Math.min(0.8, overtureConfidence * 0.85)
  if (p.phone) c += 0.03
  if (p.address) c += 0.02
  return Math.round(Math.min(c, 0.97) * 100) / 100
}

// Trigram overlap (like Postgres pg_trgm), ignoring words every facility shares
const GENERIC = /\b(the|and|pvt|private|ltd|limited|hospitals?|clinics?|medicals?|centre|center|pharmacy|chemists?|stores?|dr)\b/g
function trigrams(s) {
  const t = ` ${s.toLowerCase().replace(GENERIC, ' ').replace(/[^a-z0-9]+/g, ' ').trim()} `
  const out = new Set()
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3))
  return out
}
function nameSimilarity(a, b) {
  const A = trigrams(a), B = trigrams(b)
  if (A.size < 2 || B.size < 2) return a.toLowerCase() === b.toLowerCase() ? 1 : 0
  let shared = 0
  for (const g of A) if (B.has(g)) shared++
  return shared / (A.size + B.size - shared)
}

// ---------- Opening hours ----------

// Parses the common OSM forms ("24/7", "Mo-Sa 09:00-21:00; Su 10:00-14:00") into the
// { days, open, close } slots the site already uses. Anything fancier returns null.
const DAY = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 }
function parseOpeningHours(raw) {
  if (!raw) return null
  const s = raw.trim()
  if (s === '24/7') return [{ days: [0, 1, 2, 3, 4, 5, 6], open: '00:00', close: '23:59' }]
  const slots = []
  for (const rule of s.split(';').map(r => r.trim()).filter(Boolean)) {
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)?\s*(.*)$/)
    if (!m) return null
    const days = m[1] ? expandDays(m[1]) : [0, 1, 2, 3, 4, 5, 6]
    const times = m[2].trim()
    if (!days) return null
    if (times === 'off' || times === 'closed') continue
    for (const range of times.split(',').map(t => t.trim())) {
      const t = range.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/)
      if (!t) return null
      const open = `${t[1].padStart(2, '0')}:${t[2]}`
      let close = `${t[3].padStart(2, '0')}:${t[4]}`
      if (close === '24:00') close = '23:59'
      if (close <= open) return null // overnight hours aren't representable yet
      slots.push({ days, open, close })
    }
  }
  return slots.length ? slots : null
}
function expandDays(spec) {
  const days = new Set()
  for (const part of spec.split(',').filter(Boolean)) {
    const [a, b] = part.split('-')
    if (!(a in DAY) || (b && !(b in DAY))) return null
    if (!b) { days.add(DAY[a]); continue }
    for (let d = DAY[a]; ; d = (d + 1) % 7) { days.add(d); if (d === DAY[b]) break }
  }
  return [...days].sort()
}

// ---------- Small helpers ----------

function cleanName(s) {
  const name = s?.replace(/\s+/g, ' ').trim()
  return name && name.length >= 3 ? name : null
}
function cleanPhone(s) {
  const first = s?.split(/[;,/]/)[0]?.trim()
  const digits = first?.replace(/[^\d+]/g, '')
  return digits && digits.replace(/\D/g, '').length >= 8 ? first : null
}
function cleanWebsite(s) {
  if (!s) return null
  const url = s.trim().split(/[;\s]/)[0]
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
function round6(n) { return Math.round(n * 1e6) / 1e6 }
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371008.8, rad = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function printSummary(places) {
  const count = f => places.filter(f).length
  const byKind = ['hospital', 'clinic', 'pharmacy', 'lab'].map(k => `${k} ${count(p => p.kind === k)}`).join(' · ')
  const both = count(p => p.sources.some(s => s.source === 'osm') && p.sources.some(s => s.source === 'overture'))
  console.log(`  After merging duplicates: ${places.length} places (${byKind})`)
  console.log(`  In both sources: ${both} · with phone: ${count(p => p.phone)} · with hours: ${count(p => p.schedule)}`)
}

await main()
