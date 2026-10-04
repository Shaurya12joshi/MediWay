// What the city scripts share: .env, the city's row, its live places, and distances to where tourists are.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// Hospitals this close to a tourist area are the ones worth a web search or a phone call about their ER
// (in compact old towns like Varanasi's, 5 km would take in nearly every hospital in the city)
export const NEAR_TOURISTS_KM = 2
// Launching needs a known 24/7 emergency room within this distance of every tourist area
export const ER_REACH_KM = 3

export function readEnv() {
  const file = join(ROOT, '.env')
  const fromFile = !existsSync(file) ? {} : Object.fromEntries(readFileSync(file, 'utf8').split('\n')
    .map(line => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^(['"])(.*)\1$/, '$2')]))
  return { ...fromFile, ...process.env }
}

// Reads with the service role key when there is one (it can see the import queue), else the anon key
export function supabaseRest(env, { service = false } = {}) {
  const key = service ? env.SUPABASE_SERVICE_ROLE_KEY : env.VITE_SUPABASE_ANON_KEY
  if (!env.VITE_SUPABASE_URL || !key) return null
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const call = async (path, init = {}) => {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, 'Content-Type': 'application/json', ...init.headers } })
    if (!res.ok) throw Object.assign(new Error(`${path.split('?')[0]}: ${res.status} ${await res.text()}`), { status: res.status })
    return res.status === 204 ? null : res.json()
  }
  return {
    get: call,
    // Every row, 1000 at a time (PostgREST's page size)
    async all(path) {
      const rows = []
      for (let from = 0; ; from += 1000) {
        const page = await call(`${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${from}`)
        rows.push(...page)
        if (page.length < 1000) return rows
      }
    },
    rpc: (fn, body) => call(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) }),
    patch: (path, body) => call(path, { method: 'PATCH', body: JSON.stringify(body), headers: { Prefer: 'return=minimal' } }),
  }
}

// The cities row, with `areas` ([] before 20261005_city_launch.sql)
export async function fetchCity(db, slug) {
  let rows
  try {
    rows = await db.get(`cities?slug=eq.${encodeURIComponent(slug)}&select=*`)
  } catch (err) {
    throw new Error(`Couldn't read the cities table (${err.status}). Has 20260930_multi_city.sql been run?`)
  }
  if (!rows[0]) return null
  return { ...rows[0], areas: Array.isArray(rows[0].areas) ? rows[0].areas : [] }
}

export function addCitySql(slug) {
  return `insert into cities (slug, name, state, center_lat, center_lng, radius_km, launched, areas)\n` +
    `values ('${slug}', '<Name>', '<State>', <lat>, <lng>, 25, false,\n` +
    `  '[{"name": "<old town / beach / ghat>", "lat": <lat>, "lng": <lng>}, {"name": "<station>", "lat": <lat>, "lng": <lng>}]');`
}

// Live places in a city (hospitals.city holds the city's name)
export function livePlaces(db, cityName, select = 'id,kind,name,lat,lng,schedule,er24,hours_source,phone,website,sources') {
  return db.all(`hospitals?select=${select}&city=eq.${encodeURIComponent(cityName)}&order=id`)
}

// The importer's keys for a live place: 'osm:node/123', 'overture:abc…'
export const sourceKeysOf = place => (place.sources ?? []).map(s => `${s.source}:${s.id}`)

export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371.0088, rad = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// { area, km } for the nearest tourist area, or { area: null, km: Infinity } when the city has none
export function nearestArea(areas, lat, lng) {
  let best = { area: null, km: Infinity }
  for (const a of areas) {
    const km = distanceKm(lat, lng, a.lat, a.lng)
    if (km < best.km) best = { area: a.name, km }
  }
  return best
}
