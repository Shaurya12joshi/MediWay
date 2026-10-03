#!/usr/bin/env node
// Fill in opening hours from the web page each imported place already links to.
//
//   node scripts/enrich-hours.mjs --city varanasi           writes supabase/imports/hours-varanasi-<date>.sql
//   node scripts/enrich-hours.mjs --city varanasi --push    sends them straight to Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
//   --limit <n>                                             only try the first n pages (for a quick test)
//
// Reads places from the latest `supabase/imports/<city>-*.sql` files written by import-places.mjs.
// Only machine-readable hours are trusted (schema.org markup, Google-Business-style periods); free text
// is ignored, and a page that lists several different sets of hours is skipped as ambiguous.
// Polite by design: one request per second per site, robots.txt respected, only the linked page fetched.
// Hours found here never overwrite hours an admin confirmed by phone (see set_place_hours()).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toOsmString } from './lib/opening-hours.mjs'
import { extractHours, parseRobots, robotsAllows } from './lib/page-hours.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMPORTS = join(ROOT, 'supabase', 'imports')
const USER_AGENT = 'MediWay-hours/1.0 (+https://github.com/Shaurya12joshi/MEDROUTE)'
const PER_SITE_DELAY_MS = 1000
const SITES_IN_PARALLEL = 6
const MAX_PAGE_BYTES = 3_000_000
// Profiles on these sites aren't the clinic's own page and don't carry usable hours markup
const NOT_OWN_SITE = /facebook|instagram|justdial|practo|wa\.me|whatsapp|google\.|youtube|twitter|x\.com|linktr|linkedin/i

// ---------- CLI & env ----------

const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const slug = option('city')?.toLowerCase()
const limit = option('limit') ? +option('limit') : Infinity
const push = args.includes('--push')
if (!slug) fail('Usage: node scripts/enrich-hours.mjs --city <slug> [--push] [--limit <n>]')

const env = { ...readEnvFile(join(ROOT, '.env')), ...process.env }
if (push && (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
  fail('--push needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
}

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
  const todo = places.filter(p => p.website && !p.schedule && !NOT_OWN_SITE.test(p.website)).slice(0, limit)
  console.log(`→ ${places.length} imported places for ${slug}; ${todo.length} have their own web page and no hours yet`)

  const stats = { found: 0, blocked: 0, failed: 0, ambiguous: 0, none: 0 }
  const found = []
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
        if (result.schedule) {
          found.push({ source_key: p.source_key, kind: p.kind, method: result.method, schedule: result.schedule,
                       opening_hours: toOsmString(result.schedule), hours_source: 'website' })
        }
        if (++done % 50 === 0) console.log(`  … ${done}/${todo.length} pages, ${found.length} with hours`)
        await sleep(PER_SITE_DELAY_MS)
      }
    }
  }
  await Promise.all(Array.from({ length: SITES_IN_PARALLEL }, worker))

  printSummary(todo.length, stats, found)
  if (!found.length) return console.log('Nothing to save.')
  const rows = found.map(({ kind, method, ...r }) => r)
  if (push) console.log(`✓ Saved: ${JSON.stringify(await pushToSupabase(rows))}`)
  else console.log(`✓ Wrote ${writeSqlFile(rows)}\n  Run it in Supabase → SQL Editor (after 20261003_place_hours.sql).`)
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

async function hoursFor(place, robots) {
  if (!robotsAllows(robots, place.website)) return { outcome: 'blocked' }
  let html
  try {
    const res = await fetch(place.website, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return { outcome: 'failed' }
    html = (await res.text()).slice(0, MAX_PAGE_BYTES)
  } catch {
    return { outcome: 'failed' }
  }
  const found = extractHours(html)
  if (found === 'ambiguous') return { outcome: 'ambiguous' }
  return found ? { outcome: 'found', ...found } : { outcome: 'none' }
}

async function fetchRobots(origin) {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) })
    return res.ok ? parseRobots(await res.text()) : []
  } catch {
    return []
  }
}

// ---------- Output ----------

function writeSqlFile(rows) {
  const file = join(IMPORTS, `hours-${slug}-${new Date().toISOString().slice(0, 10)}.sql`)
  const json = JSON.stringify(rows)
  if (json.includes('$mediway_hours$')) fail('Data contains the SQL quote tag; aborting.')
  writeFileSync(file,
    `-- Opening hours for ${rows.length} ${slug} places, read from their own web pages by scripts/enrich-hours.mjs on ${new Date().toISOString()}\n` +
    `-- Fills places that have no hours; never overwrites hours confirmed by phone.\n` +
    `select public.set_place_hours($mediway_hours$${json}$mediway_hours$::jsonb);\n`)
  return file.replace(ROOT + '/', '')
}

async function pushToSupabase(rows) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/set_place_hours`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ updates: rows }),
  })
  if (!res.ok) fail(`set_place_hours failed (${res.status}): ${await res.text()}\n  Has 20261003_place_hours.sql been run?`)
  return res.json()
}

function printSummary(total, stats, found) {
  const count = (list, key) => [...groupBy(list, x => x[key])].map(([k, v]) => `${k} ${v.length}`).join(' · ')
  console.log(`  Pages tried: ${total} · no hours on page: ${stats.none} · conflicting hours (skipped): ${stats.ambiguous} · ` +
              `blocked by robots.txt: ${stats.blocked} · couldn't load: ${stats.failed}`)
  if (found.length) console.log(`  Found hours for ${found.length} places (${count(found, 'kind')}) via ${count(found, 'method')}`)
}

function groupBy(list, key) {
  const out = new Map()
  for (const x of list) { const k = key(x); out.set(k, [...(out.get(k) ?? []), x]) }
  return out
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

await main()
