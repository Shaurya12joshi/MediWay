// Reading opening hours out of a web page, and deciding whether robots.txt lets us fetch it.
// Only machine-readable hours count; a page listing several different sets of hours is ambiguous.

import { fromSchemaOpeningHours, fromSchemaSpecification, fromPeriods } from './opening-hours.mjs'

// Rules from the group for our agent if there is one, else the "*" group
export function parseRobots(text) {
  const groups = []
  let current = null
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim()
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i)
    if (!m) continue
    const [, field, value] = m
    if (field.toLowerCase() === 'user-agent') {
      if (!current || current.rules.length) groups.push(current = { agents: [], rules: [] })
      current.agents.push(value.toLowerCase())
    } else if (current && value) {
      current.rules.push({ allow: field.toLowerCase() === 'allow', path: value })
    }
  }
  const mine = groups.find(g => g.agents.some(a => a.startsWith('mediway')))
  return (mine ?? groups.find(g => g.agents.includes('*')))?.rules ?? []
}

// Longest matching rule wins; Allow wins a tie (as Google does)
export function robotsAllows(rules, url) {
  const { pathname, search } = new URL(url)
  const path = pathname + search
  let best = null
  for (const r of rules) {
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'))
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r
  }
  return !best || best.allow
}

// Every set of hours on the page; if they disagree we can't tell which belongs to this place
export function extractHours(html) {
  const candidates = [...fromJsonLd(html), ...fromMicrodata(html), ...fromNextPeriods(html)]
  if (!candidates.length) return null
  const distinct = new Set(candidates.map(c => JSON.stringify(c.schedule)))
  return distinct.size === 1 ? candidates[0] : 'ambiguous'
}

function fromJsonLd(html) {
  const out = []
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data
    try { data = JSON.parse(m[1].trim()) } catch { continue }
    for (const node of walk(data)) {
      const schedule = node.openingHoursSpecification ? fromSchemaSpecification(node.openingHoursSpecification)
        : node.openingHours ? fromSchemaOpeningHours(node.openingHours) : null
      if (schedule) out.push({ schedule, method: 'schema.org' })
    }
  }
  return out
}

function fromMicrodata(html) {
  const values = [...html.matchAll(/<[^>]*itemprop=["']openingHours["'][^>]*>/gi)]
    .map(m => m[0].match(/(?:content|datetime)=["']([^"']+)["']/i)?.[1]).filter(Boolean)
  const schedule = values.length ? fromSchemaOpeningHours(values) : null
  return schedule ? [{ schedule, method: 'microdata' }] : []
}

// Next.js pages stream their data as "id:json" rows inside self.__next_f.push() calls, with "$id" references
function fromNextPeriods(html) {
  if (!html.includes('openDay')) return []
  const text = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
    .map(m => { try { return JSON.parse(m[1]) } catch { return '' } }).join('')
  const rows = new Map()
  for (const line of text.split('\n')) { const m = line.match(/^([0-9a-f]+):(.*)$/); if (m) rows.set(m[1], m[2]) }
  const resolve = (v, depth = 0) => {
    if (depth > 8) return v
    if (typeof v === 'string' && /^\$[0-9a-f]+$/.test(v)) {
      try { return resolve(JSON.parse(rows.get(v.slice(1)) ?? 'null'), depth + 1) } catch { return null }
    }
    if (Array.isArray(v)) return v.map(x => resolve(x, depth + 1))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, depth + 1)]))
    return v
  }
  const out = []
  for (const raw of rows.values()) {
    if (!raw.includes('"periods"')) continue
    let data
    try { data = JSON.parse(raw) } catch { continue }
    for (const node of walk(data)) {
      if (!node.periods) continue
      const periods = resolve(node.periods)
      const schedule = Array.isArray(periods) && periods.length ? fromPeriods(periods) : null
      if (schedule) out.push({ schedule, method: 'periods' })
    }
  }
  return out
}

function* walk(value) {
  if (Array.isArray(value)) { for (const v of value) yield* walk(v); return }
  if (!value || typeof value !== 'object') return
  yield value
  for (const v of Object.values(value)) if (v && typeof v === 'object') yield* walk(v)
}
