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

// ---------- Plain-text hours (read by Gemini, see ai-hours.mjs) ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—' }

export function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/footer|\/td|\/dt|\/dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#'
      ? String.fromCodePoint(parseInt(e.slice(e[1].toLowerCase() === 'x' ? 2 : 1), e[1].toLowerCase() === 'x' ? 16 : 10))
      : ENTITIES[e.toLowerCase()] ?? m)
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

// A time of day, "24x7"/"24 hours", or Hindi time words: without one of these a page states no hours
const TIME = /\b\d{1,2}\s*([:.]\s*\d{2})?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])|\b([01]?\d|2[0-3])[:.][0-5]\d\b|\b24\s*[x×*\/]\s*7\b|\b24\s*(hours?|hrs?)\b|round[- ]the[- ]clock|बजे|सुबह|शाम|24 घंटे/i
const HOURS_WORDS = /timing|hours|open|closed|opd|consult|visit|emergency|casualty|\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|daily|every ?day|सोम|मंगल|बुध|गुरु|शुक्र|शनि|रवि|समय/i
const MAX_EXCERPT_CHARS = 6000
// What foreign travellers ask about: insurance and payment, English, travel medicine, a female doctor
const TRAVELLER_WORDS = /insurance|cashless|\btpa\b|mediclaim|credit card|debit card|\bvisa\b|mastercard|\bamex\b|card payment|vaccin|rabies|travel (medicine|clinic|health)|yellow fever|lady doctor|female doctor|woman doctor|english[- ]speaking|international patient|foreign patient/i

// Lines about an emergency service go along even without a time in them ("Emergency & Trauma care",
// "No emergency services"): they settle the most important question for a hospital
const EMERGENCY_WORDS = /emergenc|casualty|trauma|accident|आपातकाल|इमरजेंसी/i

// The lines that talk about hours, emergencies or traveller details, each with its neighbours for context.
// Only these go to Gemini: a whole page would cost ~20x more and add nothing.
export function pageExcerpts(text) {
  const lines = text.split('\n')
  const keep = new Set()
  lines.forEach((line, i) => {
    if (TIME.test(line) || TRAVELLER_WORDS.test(line) || EMERGENCY_WORDS.test(line) || (HOURS_WORDS.test(line) && TIME.test(lines[i + 1] ?? ''))) {
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) keep.add(j)
    }
  })
  if (!keep.size) return null
  let out = ''
  let last = -2
  for (const i of [...keep].sort((a, b) => a - b)) {
    const piece = (i === last + 1 ? '' : '\n…\n') + lines[i] + '\n'
    if (out.length + piece.length > MAX_EXCERPT_CHARS) break
    out += piece
    last = i
  }
  return out.trim()
}

// Hours often live on a separate page: the first same-site link that looks like contact or timings
export function infoPageUrl(html, pageUrl) {
  const here = new URL(pageUrl)
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = m[2].replace(/<[^>]+>/g, ' ')
    if (!/contact|timing|hours|opd|reach us|visit us|location/i.test(m[1] + ' ' + label)) continue
    let url
    try { url = new URL(m[1], here) } catch { continue }
    if (url.origin === here.origin && url.pathname !== here.pathname && /^https?:$/.test(url.protocol)) return url.href
  }
  return null
}

function* walk(value) {
  if (Array.isArray(value)) { for (const v of value) yield* walk(v); return }
  if (!value || typeof value !== 'object') return
  yield value
  for (const v of Object.values(value)) if (v && typeof v === 'object') yield* walk(v)
}
