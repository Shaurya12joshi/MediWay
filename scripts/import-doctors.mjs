#!/usr/bin/env node
// Doctors from the websites of a city's own hospitals and clinics, into the review queue (doctors_staging).
// Nothing goes live until auto-review or an admin approves it (Admin -> Imported doctors).
//
//   node scripts/import-doctors.mjs --city varanasi           reads the sites, writes supabase/imports/doctors-varanasi-<date>.sql
//   node scripts/import-doctors.mjs --city varanasi --push    stages them directly (needs SUPABASE_SERVICE_ROLE_KEY)
//   --limit <n>     only the first n sites (nearest to the city's tourist areas come first)
//   --place <ids>   only these places (hospitals.id, comma-separated), e.g. to re-read one site; prints what it found
//   --model <id>    Gemini model (default gemini-3.5-flash-lite: plenty for reading a list; needs GEMINI_API_KEY)
//   --yes           don't ask before using Gemini
//   --rpm <n>       requests per minute (default 10, safe on the free tier)
//
// For each live hospital and clinic with its own website: the home page, then up to two pages that look like a
// doctors list ("Our doctors", "Find a doctor", "Our team"). The lines that name doctors go to Gemini, which returns
// each doctor's name, degrees, specialty (mapped to MediWay's names), OPD hours and a word-for-word quote.
// Kept only when that quote is really on the page and names the doctor. Chain sites (one page for many branches)
// keep only doctors whose branch is in this city. Answers are cached, so a re-run only asks about pages that changed.
// Needs 20261006_doctor_import.sql. Polite: robots.txt respected, one request per second per site.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { parseRobots, robotsAllows, htmlToText } from './lib/page-hours.mjs'
import { asciiJson } from './lib/ascii-json.mjs'
import { ROOT, fetchCity, livePlaces, nearestArea, readEnv, sourceKeysOf, supabaseRest } from './lib/city.mjs'
import { withRetries, confirm, sleep } from './lib/gemini.mjs'
import { DOCTORS_MODEL, DOCTORS_PROMPT_VERSION, answerOf, doctorExcerpts, doctorsRequest, interpretDoctors, interpretFacilityHours } from './lib/ai-doctors.mjs'
import { toOsmString } from './lib/opening-hours.mjs'

const IMPORTS = join(ROOT, 'supabase', 'imports')
const USER_AGENT = 'MediWay-doctors/1.0 (+https://github.com/Shaurya12joshi/MEDROUTE)'
const NOT_OWN_SITE = /facebook|instagram|justdial|practo|lybrate|wa\.me|whatsapp|google\.|youtube|twitter|x\.com|linktr|linkedin|sulekha|indiamart/i
const DOCTORS_LINK = /our[- _]?doctors?|find[- _]?a[- _]?doctor|\/doctors?\b|doctors?\.php|consultants?|specialists|our[- _]?team|medical[- _]?team|faculty|our[- _]?experts/i
const PER_SITE_DELAY_MS = 1000
const MAX_PAGE_BYTES = 3_000_000

const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const slug = option('city')?.toLowerCase()
const limit = option('limit') ? +option('limit') : Infinity
const onlyPlaces = option('place')?.split(',').map(x => x.trim())
const model = option('model') ?? DOCTORS_MODEL
const rpm = option('rpm') ? +option('rpm') : 10
const push = args.includes('--push'), assumeYes = args.includes('--yes')
if (!slug) fail('Usage: node scripts/import-doctors.mjs --city <slug> [--push] [--limit <n>] [--model <id>] [--yes] [--rpm <n>]')

const env = readEnv()
const anon = supabaseRest(env)
if (!anon) fail('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env')
if (!env.GEMINI_API_KEY) fail('GEMINI_API_KEY missing from .env (create one at https://aistudio.google.com/apikey)')
const service = supabaseRest(env, { service: true })
if (push && !service) fail('--push needs SUPABASE_SERVICE_ROLE_KEY in .env')
function fail(msg) { console.error(`✗ ${msg}`); process.exit(1) }

// ---------- Main ----------

async function main() {
  const city = await fetchCity(anon, slug)
  if (!city) fail(`No city "${slug}" in the cities table.`)

  // Live hospitals and clinics with their own website; a site shared by several places is a chain
  const places = (await livePlaces(anon, city.name, 'id,kind,name,address,lat,lng,website,sources,schedule'))
    .filter(p => ['hospital', 'clinic'].includes(p.kind) && p.website && !NOT_OWN_SITE.test(p.website) && originOf(p.website))
    .filter(p => !onlyPlaces || onlyPlaces.includes(p.id))
  const byOrigin = new Map()
  for (const p of places) byOrigin.set(originOf(p.website), [...(byOrigin.get(originOf(p.website)) ?? []), p])
  // One request per site; a chain site is read once, for its place nearest to tourists
  const sites = [...byOrigin.values()].map(list => {
    const ranked = list.map(p => ({ ...p, ...nearestArea(city.areas, p.lat, p.lng) })).sort((a, b) => (a.km - b.km) || 0)
    return { place: ranked[0], chain: list.length > 1 }
  }).sort((a, b) => (a.place.km - b.place.km) || (a.place.kind === 'hospital' ? -1 : 1)).slice(0, limit)
  console.log(`→ ${city.name}: ${places.length} hospitals and clinics with a website, ${byOrigin.size} different sites; reading ${sites.length}`)

  // 1. Fetch, politely
  const pages = []
  const stats = { read: 0, noDoctors: 0, blocked: 0, failed: 0 }
  const queue = [...sites]
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const site = queue.shift()
      const result = await doctorPages(site.place)
      stats[result.outcome] += 1
      if (result.excerpts) pages.push({ ...site, urls: result.urls, excerpts: result.excerpts })
      const done = stats.read + stats.noDoctors + stats.blocked + stats.failed
      if (done % 25 === 0) console.log(`  … ${done}/${sites.length} sites, ${pages.length} with doctors listed`)
    }
  }))
  console.log(`  Sites: ${sites.length} · listing doctors: ${pages.length} · no doctors found: ${stats.noDoctors} · ` +
              `blocked by robots.txt: ${stats.blocked} · couldn't load: ${stats.failed}`)
  if (!pages.length) return console.log('Nothing to read.')

  // 2. Gemini reads them
  const { rows, placeHours } = await readWithGemini(pages, city)
  const bySpecialty = {}
  for (const r of rows) for (const s of r.specialty) bySpecialty[s] = (bySpecialty[s] ?? 0) + 1
  console.log(`  Doctors found: ${rows.length} at ${new Set(rows.map(r => r.place_id)).size} places · ` +
              `${rows.filter(r => r.confidence >= 0.8).length} with the specialty in the page's own words · ` +
              `${rows.filter(r => r.schedule).length} with OPD hours`)
  console.log(`  By specialty: ${Object.entries(bySpecialty).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  if (onlyPlaces) for (const r of rows) console.log(`  · ${r.name} (${r.specialty}) ${r.schedule ? `hours: ${JSON.stringify(r.schedule)} ← "${r.hours_evidence}"` : `no hours${r.opd_text ? ` (page says: ${r.opd_text})` : ''}`}`)
  console.log(`  Hospital and clinic hours found on the way (for places without any): ${placeHours.length}`)
  if (!rows.length && !placeHours.length) return console.log('Nothing to stage.')

  // 3. Into the review queue
  if (push) {
    if (rows.length) console.log(`✓ Staged: ${JSON.stringify(await service.rpc('stage_doctors', { doctors: rows }))}`)
    if (placeHours.length) console.log(`✓ Place hours: ${JSON.stringify(await service.rpc('set_place_hours', { updates: placeHours }))}`)
    console.log(`  Next: Admin -> Imported doctors -> ⚡ Auto-review (or node scripts/launch-city.mjs --city ${slug})`)
  } else {
    console.log(`✓ Wrote ${writeSqlFile(rows, placeHours)}\n  Run it in Supabase -> SQL Editor (after 20261006_doctor_import.sql), then Admin -> Imported doctors -> ⚡ Auto-review.`)
  }
}

function originOf(url) { try { return new URL(url).origin } catch { return null } }

// ---------- Fetching ----------

// The home page; up to two pages that look like a doctors list and two that look like OPD timings; then each
// doctor's own page linked from those (where hospitals usually put a doctor's OPD days and times)
const OPD_LINK = /\bopd\b|timing|schedule|time-?table|roster|availability/i
const DOCTOR_PAGE = /\/(dr[-_.][a-z]|doctors?\/[^/?#]+|team\/[^/?#]+|consultants?\/[^/?#]+)/i
const MAX_DOCTOR_PAGES = 30

function sameSiteLinks(html, base) {
  const out = []
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url
    try { url = new URL(m[1], base) } catch { continue }
    if (url.origin === originOf(base) && /^https?:$/.test(url.protocol)) out.push({ url, label: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() })
  }
  return out
}

async function doctorPages(place) {
  const robots = await fetchRobots(originOf(place.website))
  const home = await fetchPage(place.website, robots)
  if (home.outcome) return home
  const homeLinks = sameSiteLinks(home.html, place.website)
  // A listing beats one doctor's page ("/doctors/" over "/doctors/dr-x")
  const rank = (re, l) => l.url.pathname.split('/').filter(Boolean).length + (re.test(l.label) ? 0 : 1)
  const pick = (re, n) => [...new Map(homeLinks.filter(l => re.test(`${l.url.pathname} ${l.label}`)).sort((a, b) => rank(re, a) - rank(re, b)).map(l => [l.url.href, l])).values()].slice(0, n)

  const sections = [{ url: place.website, text: htmlToText(home.html) }]
  const fetched = new Set([place.website])
  let docLinks = homeLinks.filter(l => DOCTOR_PAGE.test(l.url.pathname))
  for (const l of [...pick(DOCTORS_LINK, 2), ...pick(OPD_LINK, 2)]) {
    if (fetched.has(l.url.href)) continue
    fetched.add(l.url.href)
    await sleep(PER_SITE_DELAY_MS)
    const page = await fetchPage(l.url.href, robots)
    if (page.outcome) continue
    sections.unshift({ url: l.url.href, text: htmlToText(page.html) })
    docLinks = docLinks.concat(sameSiteLinks(page.html, l.url.href).filter(x => DOCTOR_PAGE.test(x.url.pathname)))
  }
  // Each doctor's own page: deeper than the listing, named like a person ("/doctors/dr-shweta-singh")
  const listingPaths = new Set(sections.map(x => new URL(x.url).pathname.replace(/\/$/, '')))
  const own = [...new Map(docLinks.filter(l => !listingPaths.has(l.url.pathname.replace(/\/$/, '')) && (/dr[-_.]?[a-z]/i.test(l.url.pathname) || /\bdr\b\.?\s*[a-z]/i.test(l.label)))
    .map(l => [l.url.href.replace(/\/$/, ''), l])).values()].slice(0, MAX_DOCTOR_PAGES)
  for (const l of own) {
    if (fetched.has(l.url.href)) continue
    fetched.add(l.url.href)
    await sleep(PER_SITE_DELAY_MS)
    const page = await fetchPage(l.url.href, robots)
    if (!page.outcome) sections.push({ url: l.url.href, text: htmlToText(page.html), doctorPage: true })
  }
  await sleep(PER_SITE_DELAY_MS)
  const excerpts = doctorExcerpts(sections)
  return excerpts ? { outcome: 'read', urls: sections.filter(x => !x.doctorPage).map(x => x.url), excerpts, doctorPages: own.length } : { outcome: 'noDoctors' }
}

// One retry: small clinic sites often time out once and then answer
async function fetchPage(url, robots, retry = true) {
  if (!robotsAllows(robots, url)) return { outcome: 'blocked' }
  const result = await fetchOnce(url)
  if (result.outcome === 'failed' && retry) { await sleep(2000); return fetchOnce(url) }
  return result
}

async function fetchOnce(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return { outcome: 'failed' }
    return { html: (await res.text()).slice(0, MAX_PAGE_BYTES) }
  } catch {
    return { outcome: 'failed' }
  }
}

async function fetchRobots(origin) {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) })
    return res.ok ? parseRobots(await res.text()) : []
  } catch {
    return []
  }
}

// ---------- Gemini ----------

async function readWithGemini(pages, city) {
  const cacheFile = join(IMPORTS, `doctors-ai-${slug}.json`)
  mkdirSync(IMPORTS, { recursive: true })
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : { answers: {} }
  const save = () => writeFileSync(cacheFile, JSON.stringify(cache))
  const keyOf = pg => createHash('sha256').update(`${model}\n${DOCTORS_PROMPT_VERSION}\n${pg.place.id}\n${pg.urls.join(' ')}\n${pg.excerpts}`).digest('hex').slice(0, 32)

  const todo = pages.filter(pg => !cache.answers[keyOf(pg)])
  if (todo.length) {
    const chars = todo.reduce((n, pg) => n + pg.excerpts.length, 0)
    console.log(`→ Asking ${model} about ${todo.length} sites (${pages.length - todo.length} answered before): ~${Math.round(chars / 3500)}k input tokens, ` +
                `about ${Math.ceil(todo.length / rpm)} minutes at ${rpm} a minute. Free within the free tier's daily limits.`)
    if (assumeYes || await confirm('  Go ahead?')) {
      const { GoogleGenAI } = await import('@google/genai')
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
      const gap = 60_000 / rpm
      let answered = 0
      for (const [i, pg] of todo.entries()) {
        const started = Date.now()
        const result = await withRetries(() => ai.models.generateContent({ model, ...doctorsRequest(pg.place, city, pg.urls, pg.excerpts) }), model)
        if (result.stop) { console.log(`  Stopped: ${result.stop}\n  ${answered} saved; run the same command again later to continue.`); break }
        if (result.response) { cache.answers[keyOf(pg)] = answerOf(result.response); save(); answered++ }
        if ((i + 1) % 10 === 0 || i === todo.length - 1) console.log(`  … ${i + 1}/${todo.length} asked · ${answered} answered`)
        await sleep(Math.max(0, gap - (Date.now() - started)))
      }
    } else {
      console.log('  Skipped Gemini.')
    }
  }

  // One row per doctor: the same name and specialty on two listings (a hospital listed twice, or two branches)
  // stays with the place nearest to tourists, which comes first
  const rows = new Map(), placeHours = []
  for (const pg of pages) {
    const saved = cache.answers[keyOf(pg)]
    if (!saved) continue
    // The place's own hours, only where it has none yet (set_place_hours never overwrites confirmed ones either)
    if (!pg.place.schedule?.length) {
      const h = interpretFacilityHours(saved, pg.place, pg.excerpts, sourceKeysOf(pg.place)[0])
      if (h) placeHours.push({ ...h, opening_hours: toOsmString(h.schedule) })
    }
    for (const r of interpretDoctors(saved, pg.place, city, pg.urls, pg.excerpts)) {
      // …unless only the later listing has their hours (a doctor's own clinic often does, the hospital not)
      const person = `${r.source_key.split(':').slice(1).join(':')}|${r.specialty[0]}`
      if (!rows.has(person) || (r.schedule && !rows.get(person).schedule)) rows.set(person, r)
    }
  }
  return { rows: [...rows.values()], placeHours }
}

// ---------- Output ----------

// Plain ASCII (see lib/ascii-json.mjs), so pasting it into the SQL Editor can't garble names
function writeSqlFile(rows, placeHours) {
  const file = join(IMPORTS, `doctors-${slug}-${new Date().toISOString().slice(0, 10)}.sql`)
  const quote = (data, tag) => {
    const json = asciiJson(data)
    if (json.includes(`$${tag}$`)) fail('Data contains the SQL quote tag; aborting.')
    return `$${tag}$${json}$${tag}$::jsonb`
  }
  writeFileSync(file,
    `-- Doctors read from ${slug}'s hospital and clinic websites by scripts/import-doctors.mjs on ${new Date().toISOString()}\n` +
    `-- ${rows.length} doctors into the review queue (nothing is published until auto-review or an admin approves them),\n` +
    `-- and the hours of ${placeHours.length} hospitals and clinics that had none (never over confirmed hours).\n` +
    `select\n  ${rows.length ? `public.stage_doctors(${quote(rows, 'mediway_doctors')})` : 'null'} as doctors,\n` +
    `  ${placeHours.length ? `public.set_place_hours(${quote(placeHours, 'mediway_hours')})` : 'null'} as place_hours;\n`)
  return file.replace(ROOT + '/', '')
}

await main()
