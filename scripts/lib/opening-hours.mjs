// Opening hours in the shape the site uses: [{ days: [0–6, Sunday = 0], open: 'HH:MM', close: 'HH:MM' }].
// Readers for OSM opening_hours strings, schema.org markup and Google-Business-style periods.
// Anything ambiguous returns null: wrong hours on a health app are worse than "Hours not listed".

const OSM_DAY = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 }
const OSM_NAME = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const FULL_DAY = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

// "7", "07:30", "7.30", "07:30:00", "7:30 PM", "07:30PM" → "HH:MM" (24 h)
export function toHHMM(t) {
  const m = String(t ?? '').trim().match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*([ap]\.?m\.?)?$/i)
  if (!m) return null
  let h = +m[1]
  const min = +(m[2] ?? 0)
  const ampm = m[3]?.toLowerCase().replace(/\./g, '')
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  if (h === 24 && min === 0) return '23:59'
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// OSM syntax: "24/7", "Mo-Sa 09:00-21:00; Su 10:00-14:00", "Mo-Fr 10:00-13:00,17:00-20:00"
export function parseOsmHours(raw) {
  if (!raw) return null
  const s = raw.trim()
  if (s === '24/7') return [{ days: EVERY_DAY, open: '00:00', close: '23:59' }]
  const slots = []
  for (const rule of s.split(';').map(r => r.trim()).filter(Boolean)) {
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)?\s*(.*)$/)
    if (!m) return null
    const days = m[1] ? expandOsmDays(m[1]) : EVERY_DAY
    const times = m[2].trim()
    if (!days) return null
    if (times === 'off' || times === 'closed') continue
    for (const range of times.split(',').map(t => t.trim())) {
      const t = range.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/)
      if (!t) return null
      slots.push({ days, open: toHHMM(t[1]), close: toHHMM(t[2]) })
    }
  }
  return normalizeSchedule(slots)
}

function expandOsmDays(spec) {
  const days = new Set()
  for (const part of spec.split(',').filter(Boolean)) {
    const [a, b] = part.split('-')
    if (!(a in OSM_DAY) || (b && !(b in OSM_DAY))) return null
    if (!b) { days.add(OSM_DAY[a]); continue }
    for (let d = OSM_DAY[a]; ; d = (d + 1) % 7) { days.add(d); if (d === OSM_DAY[b]) break }
  }
  return [...days].sort()
}

// schema.org `openingHours`: "Mo-Sa 09:00-21:00", or the common variant "Mo-Su 07:00 AM to 08:00 PM"
export function fromSchemaOpeningHours(value) {
  const parts = (Array.isArray(value) ? value : [value]).filter(v => typeof v === 'string' && v.trim())
  if (!parts.length) return null
  const osm = parts.map(p => p.trim()
    .replace(/(\d{1,2}(?:[:.]\d{2})?\s*[ap]\.?m\.?)/gi, t => toHHMM(t) ?? t)   // 12 h → 24 h
    .replace(/\s*(?:to|–|—)\s*/gi, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/(Mo|Tu|We|Th|Fr|Sa|Su)\s*,\s*/g, '$1,')).join('; ')
  return parseOsmHours(osm)
}

// schema.org `openingHoursSpecification`: [{ dayOfWeek: "Monday" | [...], opens: "07:30 AM", closes: "07:30 PM" }]
export function fromSchemaSpecification(specs) {
  const list = (Array.isArray(specs) ? specs : [specs]).filter(Boolean)
  const slots = []
  for (const spec of list) {
    const days = (Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek])
      .map(d => FULL_DAY[String(d ?? '').split('/').pop().toLowerCase()])
    if (!days.length || days.some(d => d === undefined)) return null
    const open = toHHMM(spec.opens), close = toHHMM(spec.closes)
    if (!open || !close) return null
    if (open === close) continue // "closed" in some generators
    slots.push({ days, open, close: close === '00:00' ? '23:59' : close })
  }
  return normalizeSchedule(slots)
}

// Google-Business-style periods: [{ openDay: 'MONDAY', openTime: { hours: 7 }, closeDay: 'MONDAY', closeTime: { hours: 20 } }]
export function fromPeriods(periods) {
  const slots = []
  for (const p of periods) {
    const day = FULL_DAY[String(p.openDay ?? '').toLowerCase()]
    if (day === undefined) return null
    const open = timeObj(p.openTime)
    let close = timeObj(p.closeTime)
    if (!open || !close) return null
    if (p.closeDay && p.closeDay !== p.openDay) {
      if (close !== '00:00') return null // overnight hours aren't representable yet
      close = '23:59'
    }
    slots.push({ days: [day], open, close })
  }
  return normalizeSchedule(slots)
}
const timeObj = t => t && typeof t === 'object' ? toHHMM(`${t.hours ?? 0}:${String(t.minutes ?? 0).padStart(2, '0')}`) : null

// Combines days that share the same times, drops nonsense, and rejects anything implausible
export function normalizeSchedule(slots) {
  if (!slots?.length) return null
  const byTime = new Map()
  for (const { days, open, close } of slots) {
    if (!open || !close || close <= open) return null
    const minutes = toMin(close) - toMin(open)
    if (minutes < 60) return null
    const key = `${open}-${close}`
    byTime.set(key, [...new Set([...(byTime.get(key) ?? []), ...days])].sort())
  }
  const out = [...byTime].map(([key, days]) => { const [open, close] = key.split('-'); return { days, open, close } })
  return out.sort((a, b) => a.days[0] - b.days[0] || a.open.localeCompare(b.open))
}
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3)

// Back to an OSM-style string, for display in the admin page: "Mo-Sa 07:30-19:30; Su 07:30-14:00"
export function toOsmString(schedule) {
  if (!schedule?.length) return null
  if (schedule.length === 1 && schedule[0].days.length === 7 && schedule[0].open === '00:00' && schedule[0].close === '23:59') return '24/7'
  return schedule.map(({ days, open, close }) => `${dayRanges(days)} ${open}-${close === '23:59' ? '24:00' : close}`).join('; ')
}
function dayRanges(days) {
  // Monday-first runs read naturally: Mo-Su rather than Su-Sa
  const order = [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d))
  const runs = []
  for (const d of order) {
    const last = runs.at(-1)
    if (last && (last.end + 1) % 7 === d && !(last.end === 0)) last.end = d
    else runs.push({ start: d, end: d })
  }
  return runs.map(r => r.start === r.end ? OSM_NAME[r.start] : `${OSM_NAME[r.start]}-${OSM_NAME[r.end]}`).join(',')
}
