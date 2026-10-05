#!/usr/bin/env node
// Fill in opening hours automatically, so the admin phone queue only holds what really needs a call.
//
//   node scripts/enrich-hours.mjs --city varanasi                writes supabase/imports/hours-varanasi-<date>.sql
//   node scripts/enrich-hours.mjs --city varanasi --ai           ...and has Gemini read hours written as plain text
//   node scripts/enrich-hours.mjs --city varanasi --ai --push    sends them straight to Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
//   node scripts/enrich-hours.mjs --city varanasi --ai --search  ...and looks up, on Google, hospitals near tourists whose
//                                                                  website doesn't settle the emergency question (suggestions only)
//   --limit <n>       only try the first n web pages (and n searches) — the most important ones come first
//   --near <km>       how close to a tourist area a hospital must be for --search (default 2)
//   --model <id>      Gemini model for --ai (default gemini-3.8-flash; needs GEMINI_API_KEY in .env).
//                     gemini-3.5-flash-lite is cheaper and has a bigger free-tier daily allowance
//   --yes             don't ask before spending money on --ai
//   --no-batch        ask one page at a time even if batch mode is available
//   --rpm <n>         requests per minute when asking one at a time (default 10, safe on the free tier)
//
// Batch mode (half price) needs billing enabled on the Google Cloud project; on the free tier the script
// asks one page at a time instead. Every answer is saved as it arrives, so an interrupted run, or one that
// hits the free tier's daily limit, continues where it stopped the next time.
//
// The most important answer for a traveller is whether a hospital has a 24/7 emergency room, so hospitals
// with an unknown ER status are read first (even ones that already have hours), nearest to the city's
// tourist areas (cities.areas) first. A run cut short by --limit or the free tier's daily cap has done those.
//
// Where hours come from, most trusted first:
//   1. machine-readable hours on the place's own page or its contact page (schema.org, Google-style periods)
//   2. the name: "24x7", "24 hours" (pharmacies and clinics often say so)
//   3. --ai: Gemini reads the lines of the page that mention times. Confident answers whose quoted evidence
//      really is on the page go live; the rest become suggestions in Admin -> Hours -> Suggestions.
// Every automatic answer carries its evidence, can be removed in Admin -> Hours -> Auto-filled, and never
// overwrites hours an admin confirmed (see hours_replaceable() in the SQL migrations).
// Polite by design: one request per second per site, robots.txt respected, at most two pages per place.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { toOsmString } from './lib/opening-hours.mjs'
import { extractHours, parseRobots, robotsAllows, htmlToText, pageExcerpts, infoPageUrl } from './lib/page-hours.mjs'
import { asciiJson } from './lib/ascii-json.mjs'
import {
  DEFAULT_MODEL, PROMPT_VERSION, SEARCH_PROMPT_VERSION, batchRequest, answerOf, estimateCost, interpretAnswer,
  searchRequest, searchAnswerOf, interpretSearchAnswer, withoutSchema,
} from './lib/ai-hours.mjs'
import { withRetries as retry, confirm, sleep } from './lib/gemini.mjs'
import { NEAR_TOURISTS_KM, fetchCity, livePlaces, nearestArea, sourceKeysOf, supabaseRest } from './lib/city.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMPORTS = join(ROOT, 'supabase', 'imports')
const USER_AGENT = 'MediWay-hours/1.0 (+https://github.com/Shaurya12joshi/MEDROUTE)'
const PER_SITE_DELAY_MS = 1000
const SITES_IN_PARALLEL = 6
const MAX_PAGE_BYTES = 3_000_000
const BATCH_POLL_MS = 30_000
// Profiles on these sites aren't the clinic's own page and don't carry usable hours markup
const NOT_OWN_SITE = /facebook|instagram|justdial|practo|wa\.me|whatsapp|google\.|youtube|twitter|x\.com|linktr|linkedin/i
// A name that promises round-the-clock service
const OPEN_ALL_DAY_NAME = /\b24\s*[x×*\/]\s*7\b|\b24\s*(hours?|hrs?)\b|round[- ]the[- ]clock|24 घंटे/i
const OPEN_ALL_DAY = [{ days: [0, 1, 2, 3, 4, 5, 6], open: '00:00', close: '23:59' }]

// ---------- CLI & env ----------

const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const slug = option('city')?.toLowerCase()
const limit = option('limit') ? +option('limit') : Infinity
const push = args.includes('--push')
const useAi = args.includes('--ai')
const model = option('model') ?? DEFAULT_MODEL
const assumeYes = args.includes('--yes')
const useBatch = !args.includes('--no-batch')
const rpm = option('rpm') ? +option('rpm') : 10
const useSearch = args.includes('--search')
const nearKm = option('near') ? +option('near') : NEAR_TOURISTS_KM
if (!slug) fail('Usage: node scripts/enrich-hours.mjs --city <slug> [--ai] [--search] [--push] [--limit <n>] [--near <km>] [--model <id>] [--yes] [--no-batch] [--rpm <n>]')

const env = { ...readEnvFile(join(ROOT, '.env')), ...process.env }
if (push && (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
  fail('--push needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
}
if ((useAi || useSearch) && !env.GEMINI_API_KEY) fail('--ai needs GEMINI_API_KEY in .env (create one at https://aistudio.google.com/apikey)')

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(readFileSync(path, 'utf8').split('\n')
    .map(line => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^(['"])(.*)\1$/, '$2')]))
}
function fail(msg) { console.error(`✗ ${msg}`); process.exit(1) }

// ---------- Main ----------

async function main() {
  const places = loadImportedPlaces(slug)
  const city = await markWhatsMissing(places)
  const publish = [] // rows for set_place_hours
  const suggest = [] // rows for suggest_place_hours

  // Hospitals with an unknown ER first, then the rest; nearest to tourists first within each
  const targets = places.filter(p => p.needsHours || p.needsEr)
    .sort((a, b) => (a.needsEr ? 0 : 1) - (b.needsEr ? 0 : 1) || (a.km - b.km || 0))

  // 1. The name says it's always open
  const byName = targets.filter(p => p.needsHours && OPEN_ALL_DAY_NAME.test(p.name))
  for (const p of byName) {
    publish.push({ source_key: p.source_key, schedule: OPEN_ALL_DAY, opening_hours: '24/7', hours_source: 'name', evidence: `Name: "${p.name}"` })
  }

  // 2. Their own web page (and its contact page): for hours, and for a hospital's emergency answer
  const todo = targets
    .filter(p => p.website && !NOT_OWN_SITE.test(p.website) && !(byName.includes(p) && !p.needsEr))
    .slice(0, limit)
  const needHours = places.filter(p => p.needsHours).length, needEr = places.filter(p => p.needsEr).length
  console.log(`→ ${places.length} imported places for ${slug}: ${needHours} without hours, ${needEr} hospitals with an unknown ER, ` +
              `${byName.length} open 24x7 by name, ${todo.length} web pages to read`)

  const stats = { found: 0, blocked: 0, failed: 0, ambiguous: 0, none: 0 }
  const forAi = [] // { place, url, excerpts }
  const bySite = groupBy(todo, p => new URL(p.website).origin)
  const sites = [...bySite.entries()]
  let done = 0

  async function worker() {
    while (sites.length) {
      const [origin, list] = sites.shift()
      const robots = await fetchRobots(origin)
      for (const p of list) {
        const result = await hoursFor(p, robots)
        stats[result.outcome] += 1
        if (result.schedule && p.needsHours) {
          publish.push({ source_key: p.source_key, schedule: result.schedule, opening_hours: toOsmString(result.schedule),
                         hours_source: 'website', evidence: `${result.method} markup on ${result.url}` })
        }
        // Gemini reads what's left: hours written as text, and the emergency question machine-readable hours don't answer
        const hoursLeft = p.needsHours && !result.schedule && result.outcome !== 'ambiguous'
        if (result.excerpts && (hoursLeft || p.needsEr)) {
          forAi.push({ place: p, url: result.url, excerpts: result.excerpts, erOnly: !hoursLeft })
        }
        if (++done % 50 === 0) console.log(`  … ${done}/${todo.length} pages, ${stats.found} with machine-readable hours`)
      }
    }
  }
  await Promise.all(Array.from({ length: SITES_IN_PARALLEL }, worker))
  console.log(`  Pages: ${todo.length} · machine-readable hours: ${stats.found} · for Gemini to read: ${forAi.length} ` +
              `(${forAi.filter(it => it.erOnly).length} only for the emergency question) · ` +
              `nothing relevant: ${todo.length - stats.blocked - stats.failed - forAi.filter(it => !it.erOnly).length - stats.found} · ` +
              `conflicting hours (skipped): ${stats.ambiguous} · blocked by robots.txt: ${stats.blocked} · couldn't load: ${stats.failed}`)

  // 3. Gemini reads the plain-text ones
  if (forAi.length && !useAi) console.log(`  Add --ai to have Gemini read the ${forAi.length} pages about hours or emergencies written as plain text.`)
  const emergency = [] // rows for set_place_er24: the page settles the ER question but gives no hours
  const details = []   // rows for set_place_details: insurance, cards, English, travel clinic, female doctor
  const erSettled = new Set() // live hospitals whose website answered the emergency question
  if (forAi.length && useAi) {
    for (const { place, answer } of await readWithGemini(forAi)) {
      if (answer.details) details.push({ source_key: place.source_key, ...answer.details })
      const found = answer.publish ?? answer.suggest
      if (!found) continue
      if (found.er24 !== null && place.live) erSettled.add(place.live.id)
      const row = { source_key: place.source_key, schedule: found.schedule, er24: found.er24, evidence: found.evidence }
      if (!answer.publish) suggest.push(row)
      else if (found.schedule) publish.push({ ...row, opening_hours: toOsmString(found.schedule), hours_source: 'website-ai' })
      else emergency.push(row)
    }
  }

  // 4. Google, for hospitals near tourists that are still unknown: suggestions only
  if (useSearch) {
    for (const { place, answer } of await searchForEmergencyRooms(places, city, erSettled)) {
      suggest.push({ source_key: place.source_key, schedule: null, er24: answer.suggest.er24, evidence: answer.suggest.evidence })
    }
  }

  console.log(`  Going live: hours for ${publish.length} (${countBy(publish, 'hours_source')}), ER status for ${emergency.length}, ` +
              `traveller details for ${details.length} · suggestions for review: ${suggest.length}`)
  if (!publish.length && !emergency.length && !details.length && !suggest.length) return console.log('Nothing to save.')
  if (push) {
    if (publish.length) console.log(`✓ Hours: ${JSON.stringify(await rpc('set_place_hours', publish))}`)
    if (emergency.length) console.log(`✓ ER status: ${JSON.stringify(await rpc('set_place_er24', emergency))}`)
    if (details.length) console.log(`✓ Traveller details: ${JSON.stringify(await rpc('set_place_details', details))}`)
    if (suggest.length) console.log(`✓ Suggestions: ${JSON.stringify(await rpc('suggest_place_hours', suggest))}`)
  } else {
    console.log(`✓ Wrote ${writeSqlFile(publish, emergency, details, suggest)}\n  Run it in Supabase → SQL Editor (after 20261004_tourist_features.sql).`)
  }
}

// ---------- What's still missing ----------

// Marks each imported place with what the live site lacks (needsHours, needsEr) and how far it is from the
// nearest tourist area (area, km). Live data wins over the import file: hours an admin confirmed, ER answers
// already known. Returns the city row (or null when Supabase can't be read; then the import files decide).
async function markWhatsMissing(places) {
  const db = supabaseRest(env)
  let city = null
  const live = new Map()
  try {
    city = db && await fetchCity(db, slug)
    if (city) for (const row of await livePlaces(db, city.name)) for (const key of sourceKeysOf(row)) live.set(key, row)
  } catch (err) {
    console.log(`  (Couldn't read the live places: ${err.message.slice(0, 120)}. Going by the import files.)`)
  }
  if (city && !city.areas.length) console.log('  (No tourist areas in cities.areas yet: hospitals are taken in import order. See 20261005_city_launch.sql.)')

  for (const p of places) {
    const row = live.get(p.source_key) ?? null
    p.live = row
    if (row) p.kind = row.kind
    p.needsHours = row ? !(Array.isArray(row.schedule) && row.schedule.length) && row.hours_source !== 'phone' : !p.schedule
    // An ER answer can only be saved on a live hospital (set_place_er24); without live data, assume it is
    p.needsEr = p.kind === 'hospital' && (row ? row.er24 == null : !live.size)
    Object.assign(p, nearestArea(city?.areas ?? [], p.lat, p.lng))
  }
  return city
}

// ---------- Places from the import files ----------

function loadImportedPlaces(slug) {
  const files = readdirSync(IMPORTS).filter(f => new RegExp(`^${slug}-\\d{4}-\\d{2}-\\d{2}(\\.part\\d+-of-\\d+)?\\.sql$`).test(f))
  if (!files.length) fail(`No import files for "${slug}" in supabase/imports. Run scripts/import-places.mjs --city ${slug} first.`)
  const latest = files.map(f => f.slice(slug.length + 1, slug.length + 11)).sort().at(-1)
  return files.filter(f => f.includes(latest))
    .flatMap(f => JSON.parse(readFileSync(join(IMPORTS, f), 'utf8').split('$mediway_import$')[1]))
}

// ---------- Fetching, politely ----------

// Machine-readable hours from the linked page or its contact page; otherwise the lines that mention times
async function hoursFor(place, robots) {
  const first = await fetchPage(place.website, robots)
  if (first.outcome) return first
  let found = extractHours(first.html)
  let text = htmlToText(first.html)
  let url = place.website

  const info = !found || found === 'ambiguous' ? infoPageUrl(first.html, place.website) : null
  if (info) {
    await sleep(PER_SITE_DELAY_MS)
    const second = await fetchPage(info, robots)
    if (!second.outcome) {
      const more = extractHours(second.html)
      if (more && more !== 'ambiguous' && !found) { found = more; url = info }
      text += '\n' + htmlToText(second.html)
    }
  }
  await sleep(PER_SITE_DELAY_MS)

  // The excerpts go along even with machine-readable hours: Gemini may still need to read the emergency question
  const excerpts = pageExcerpts(text)
  if (found === 'ambiguous') return { outcome: 'ambiguous', url: place.website, excerpts }
  if (found) return { outcome: 'found', url, ...found, excerpts }
  return { outcome: 'none', url: place.website, excerpts }
}

async function fetchPage(url, robots) {
  if (!robotsAllows(robots, url)) return { outcome: 'blocked' }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })
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
// Batch mode (half price, needs billing) when it's available, otherwise one page at a time.
// Answers are cached in supabase/imports/hours-ai-<city>.json by model + prompt version + place + page + excerpts, so a re-run only
// asks about pages that changed or weren't answered. A batch still running when the script stops is picked up next run.

const FINISHED = ['JOB_STATE_SUCCEEDED', 'JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED']

async function readWithGemini(items) {
  const cacheFile = join(IMPORTS, `hours-ai-${slug}.json`)
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : { answers: {} }
  const save = () => writeFileSync(cacheFile, JSON.stringify(cache))
  const keyOf = it => createHash('sha256').update(`${model}\n${PROMPT_VERSION}\n${it.place.name}\n${it.url}\n${it.excerpts}`).digest('hex').slice(0, 32)

  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })

  // A Gemini problem mustn't lose the rest of the run: whatever got answered is still used
  try {
    if (cache.pending) await collectBatch(ai, cache, save)

    // One request per distinct page and place (branches of a chain can share a page)
    const todo = [...new Map(items.filter(it => !cache.answers[keyOf(it)]).map(it => [keyOf(it), it])).values()]
    if (todo.length) {
      const requests = todo.map(it => batchRequest(it.place, it.url, it.excerpts))
      const { inputTokens, dollars } = estimateCost(requests, model)
      console.log(`→ Asking ${model} about ${requests.length} pages (${items.length - todo.length} answered before): ` +
                  `~${(inputTokens / 1e6).toFixed(2)}M input tokens. Roughly $${dollars.toFixed(2)} in batch mode, ` +
                  `$${(dollars * 2).toFixed(2)} one at a time, nothing within the free tier's limits.`)
      if (!assumeYes && !(await confirm('  Go ahead?'))) {
        console.log('  Skipped Gemini. Machine-readable and name-based hours are still saved.')
      } else if (useBatch && await submitBatch(ai, requests, todo.map(keyOf), cache, save)) {
        await collectBatch(ai, cache, save)
      } else {
        await askOneByOne(ai, todo, keyOf, cache, save)
      }
    }
  } catch (err) {
    console.log(`✗ Gemini: ${err.message?.slice(0, 300) ?? err}\n  Answers saved so far are kept; run again to continue.`)
  }

  return items.flatMap(it => {
    const saved = cache.answers[keyOf(it)]
    const answer = saved && interpretAnswer(saved, it.place, it.excerpts, { erOnly: it.erOnly })
    return answer ? [{ place: it.place, answer }] : []
  })
}

// Live hospitals within --near km of a tourist area whose ER status is still unknown, nearest first.
// One grounded Gemini request each, cached like the website answers.
async function searchForEmergencyRooms(places, city, erSettled) {
  if (!city) { console.log('✗ --search needs the live places from Supabase; skipped.'); return [] }
  if (!city.areas.length && nearKm !== Infinity) {
    console.log('✗ --search looks up hospitals near tourist areas, and this city has none in cities.areas yet. ' +
                'Add them (see 20261005_city_launch.sql), or pass --near 999 to search every hospital.')
    return []
  }
  const seen = new Set()
  const todo = places
    .filter(p => p.needsEr && p.live && p.km <= nearKm && !erSettled.has(p.live.id))
    .sort((a, b) => a.km - b.km)
    .filter(p => !seen.has(p.live.id) && seen.add(p.live.id))
    .slice(0, limit)
  console.log(`→ ${todo.length} hospitals within ${nearKm} km of tourist areas still have an unknown ER status.`)
  if (!todo.length) return []

  const cacheFile = join(IMPORTS, `hours-ai-${slug}.json`)
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : { answers: {} }
  const save = () => writeFileSync(cacheFile, JSON.stringify(cache))
  const keyOf = p => 'search:' + createHash('sha256').update(`${model}\n${SEARCH_PROMPT_VERSION}\n${p.name}\n${p.address ?? ''}\n${city.name}`).digest('hex').slice(0, 32)

  const ask = todo.filter(p => !cache.answers[keyOf(p)])
  if (ask.length) {
    console.log(`  Asking ${model} to search Google for ${ask.length} of them (${todo.length - ask.length} looked up before). ` +
                `Searches beyond the free allowance are billed per search: ai.google.dev/gemini-api/docs/pricing`)
    if (!assumeYes && !(await confirm('  Go ahead?'))) {
      console.log('  Skipped the search.')
    } else {
      const { GoogleGenAI } = await import('@google/genai')
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
      let plain = false // set when the model won't combine search with a JSON schema
      const call = async request => {
        try {
          return await ai.models.generateContent({ model, ...(plain ? withoutSchema(request) : request) })
        } catch (err) {
          if (plain || err.status !== 400 || !/schema|mime|json|tool/i.test(err.message ?? '')) throw err
          plain = true
          console.log(`  (${model} can't combine Google Search with a JSON schema; asking for plain JSON instead.)`)
          return ai.models.generateContent({ model, ...withoutSchema(request) })
        }
      }
      const gap = 60_000 / rpm
      let answered = 0
      for (const [i, p] of ask.entries()) {
        const started = Date.now()
        const result = await retry(() => call(searchRequest(p.live ?? p, city)), model)
        if (result.stop) { console.log(`  Stopped: ${result.stop}\n  ${answered} looked up and saved; run again later to continue.`); break }
        if (result.response) { cache.answers[keyOf(p)] = searchAnswerOf(result.response); save(); answered++ }
        if ((i + 1) % 10 === 0 || i === ask.length - 1) console.log(`  … ${i + 1}/${ask.length} searched · ${answered} answered`)
        await sleep(Math.max(0, gap - (Date.now() - started)))
      }
    }
  }

  const found = todo.flatMap(p => {
    const answer = cache.answers[keyOf(p)] && interpretSearchAnswer(cache.answers[keyOf(p)])
    return answer ? [{ place: p, answer }] : []
  })
  const yes = found.filter(f => f.answer.suggest.er24).length
  console.log(`  Web search: an answer with a quote for ${found.length} of ${todo.length} (${yes} with a 24/7 ER, ${found.length - yes} without); ` +
              `they wait in Admin -> Hours -> Suggestions`)
  return found
}

// false when this key can't use batch mode (billing off: 400 FAILED_PRECONDITION)
async function submitBatch(ai, requests, keys, cache, save) {
  try {
    const job = await ai.batches.create({ model, src: requests, config: { displayName: `mediway-hours-${slug}` } })
    // Results come back in request order: remember which answer is which
    cache.pending = { name: job.name, model, keys }
    save()
    console.log(`  Batch ${job.name} submitted. Safe to stop with Ctrl-C: the next run picks it up.`)
    return true
  } catch (err) {
    if (err.status !== 400 || !/FAILED_PRECONDITION|precondition/i.test(err.message)) throw err
    console.log('  Batch mode needs billing enabled on the Google Cloud project. Asking one page at a time instead.')
    return false
  }
}

async function collectBatch(ai, cache, save) {
  const { name, keys } = cache.pending
  let job
  while (!FINISHED.includes((job = await ai.batches.get({ name })).state)) {
    console.log(`  … batch ${name}: ${job.state.replace('JOB_STATE_', '').toLowerCase()}`)
    await sleep(BATCH_POLL_MS)
  }
  if (job.state !== 'JOB_STATE_SUCCEEDED') {
    console.log(`✗ Batch ${name} ended as ${job.state}${job.error ? `: ${JSON.stringify(job.error)}` : ''}. Its pages are retried on the next run.`)
  } else {
    let answered = 0
    ;(job.dest?.inlinedResponses ?? []).forEach((result, i) => {
      // Failed requests aren't cached, so the next run retries them
      if (result.response && !result.error) { cache.answers[keys[i]] = answerOf(result.response); answered++ }
    })
    console.log(`✓ Batch ${name}: ${answered} of ${keys.length} answered`)
  }
  delete cache.pending
  save()
}

// Paced to --rpm; each answer is saved straight away
async function askOneByOne(ai, todo, keyOf, cache, save) {
  const gap = 60_000 / rpm
  console.log(`  ${todo.length} pages at ${rpm} a minute: about ${Math.ceil(todo.length / rpm)} minutes. Safe to stop with Ctrl-C.`)
  let answered = 0, skipped = 0
  for (const [i, it] of todo.entries()) {
    const started = Date.now()
    const result = await retry(() => ai.models.generateContent({ model, ...batchRequest(it.place, it.url, it.excerpts) }), model)
    if (result.stop) {
      console.log(`  Stopped: ${result.stop}\n  ${answered} answered and saved; run the same command again later to continue.`)
      break
    }
    if (result.response) { cache.answers[keyOf(it)] = answerOf(result.response); save(); answered++ } else skipped++
    if ((i + 1) % 10 === 0 || i === todo.length - 1) console.log(`  … ${i + 1}/${todo.length} asked · ${answered} answered${skipped ? ` · ${skipped} skipped (retried next run)` : ''}`)
    await sleep(Math.max(0, gap - (Date.now() - started)))
  }
}

// ---------- Output ----------

// Plain ASCII (see lib/ascii-json.mjs), so pasting it into the SQL Editor can't garble names
function writeSqlFile(publish, emergency, details, suggest) {
  const file = join(IMPORTS, `hours-${slug}-${new Date().toISOString().slice(0, 10)}.sql`)
  const quote = (rows, tag) => {
    const json = asciiJson(rows)
    if (json.includes(`$${tag}$`)) fail('Data contains the SQL quote tag; aborting.')
    return `$${tag}$${json}$${tag}$::jsonb`
  }
  writeFileSync(file,
    `-- Opening hours for ${slug}, found by scripts/enrich-hours.mjs on ${new Date().toISOString()}\n` +
    `-- Live: hours for ${publish.length}, ER status for ${emergency.length}, traveller details for ${details.length}\n` +
    `-- (never over what an admin confirmed). ${suggest.length} wait in Admin -> Hours -> Suggestions.\n` +
    `-- The result counts what was saved.\n` +
    `select\n` +
    `  ${publish.length ? `public.set_place_hours(${quote(publish, 'mediway_hours')})` : 'null'} as hours,\n` +
    `  ${emergency.length ? `public.set_place_er24(${quote(emergency, 'mediway_er')})` : 'null'} as er_status,\n` +
    `  ${details.length ? `public.set_place_details(${quote(details, 'mediway_details')})` : 'null'} as traveller_details,\n` +
    `  ${suggest.length ? `public.suggest_place_hours(${quote(suggest, 'mediway_suggestions')})` : 'null'} as suggestions;\n`)
  return file.replace(ROOT + '/', '')
}

async function rpc(fn, updates) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ updates }),
  })
  if (!res.ok) fail(`${fn} failed (${res.status}): ${await res.text()}\n  Has 20261003_auto_hours.sql been run?`)
  return res.json()
}

// ---------- Helpers ----------

function groupBy(list, key) {
  const out = new Map()
  for (const x of list) { const k = key(x); out.set(k, [...(out.get(k) ?? []), x]) }
  return out
}
const countBy = (list, key) => [...groupBy(list, x => x[key])].map(([k, v]) => `${k} ${v.length}`).join(' · ') || 'none'

await main()
