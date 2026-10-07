// Reading the doctors a hospital or clinic lists on its own website, with Gemini.
// import-doctors.mjs sends the page's doctor lines; interpretDoctors() keeps only what the page itself says.

import { normalizeSchedule, toHHMM } from './opening-hours.mjs'

export const DOCTORS_MODEL = 'gemini-3.5-flash-lite'
// Bump when SYSTEM or SCHEMA changes, so cached answers to the old prompt are asked again
export const DOCTORS_PROMPT_VERSION = 3

// MediWay's specialty names (src/lib/specialties.js), plus Other for everything travellers can't book directly
export const SPECIALTIES = [
  'General Physician', 'Internal Medicine', 'Gastroenterologist', 'Pulmonologist', 'Cardiologist', 'Dermatologist',
  'ENT', 'Orthopedic', 'Pediatric', 'Gynecologist', 'Ophthalmologist', 'Dentist', 'Neurologist', 'Psychiatrist',
  'Urologist', 'Nephrologist', 'General Surgeon', 'Oncologist', 'Endocrinologist',
]

const SYSTEM = `You read excerpts from the website of a hospital or clinic in India and list the doctors who practise there. The list goes into a directory that helps travellers find a doctor, so only include what the page says.

Rules:
- Only individual doctors named on the page (a person, usually "Dr. ..."). Not departments, services, or staff who aren't doctors.
- page_covers: "this_place" if the page is about the named facility (its own site, or a page for that branch); "several_branches" if it lists doctors of several branches or cities of a chain; "not_about_doctors" if it lists no doctors; "unclear" otherwise.
- For "several_branches", give each doctor's branch exactly as the page states it (empty if it doesn't say).
- name: the doctor's name with "Dr." if the page uses it, without degrees.
- qualification: the degrees as written (e.g. "MBBS, MD (Medicine)"), or empty.
- specialty_as_written: the department or speciality as the page writes it.
- specialty: the closest of the given names. MBBS-only or family practice -> General Physician; MD Medicine / Physician / Internal Medicine -> Internal Medicine; Chest, TB, Respiratory -> Pulmonologist; Obstetrics & Gynaecology -> Gynecologist; Eye -> Ophthalmologist; Dental -> Dentist; Paediatrics / Neonatology -> Pediatric; Orthopaedics / Joint replacement / Spine -> Orthopedic; Skin / VD / Cosmetology -> Dermatologist; Liver / Gastro -> Gastroenterologist; Diabetes / Thyroid -> Endocrinologist. Use "Other" for anaesthesia, radiology, pathology, physiotherapy, dietetics, emergency/casualty medical officers, and anything that doesn't fit.
- gender: "female" only if the page marks it (Mrs., Ms., Smt., Miss, or "she"); otherwise null. Never guess from the name.
- languages: only languages the page says this doctor speaks; otherwise empty.
- The excerpts come from several pages of the site, each starting with "=== <address> ===". source_page: the address of the page where this doctor's details are (their own page if they have one).
- Consulting hours matter most. hours_from:
  "doctor" when the page gives this doctor's own OPD days and times (their profile page, or a timetable row with their name);
  "own_clinic" when the page is the clinic run by this doctor (it's named after them, or they are its only doctor) and gives the clinic's consulting hours;
  "none" otherwise. Never give a hospital's general OPD or 24x7 hours as one doctor's hours.
- opd_text: those days and times as written. hours_evidence: copy them word for word from the page.
- opd_hours: the same as slots (days 0 Sunday … 6 Saturday, times 24-hour HH:MM; "10–2 & 5–8" is two slots). Only when the days are stated, or follow from a stated closed day ("Sunday closed" means Monday to Saturday). Leave it empty if only times are given.
- evidence: copy, word for word, the words on the page that name the doctor and their speciality. Don't paraphrase.
- facility_hours: the consulting or opening hours the page gives for the facility as a whole (a clinic shared by several doctors, or a hospital's OPD), with hours_evidence copied word for word and opd_hours as slots (same rules). Not emergency or "24x7" marketing lines. Empty if the page gives none.`

const SLOT = {
  type: 'object', additionalProperties: false, required: ['days', 'open', 'close'],
  properties: { days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } }, open: { type: 'string' }, close: { type: 'string' } },
}
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['page_covers', 'facility_hours', 'doctors'],
  properties: {
    page_covers: { type: 'string', enum: ['this_place', 'several_branches', 'not_about_doctors', 'unclear'] },
    facility_hours: {
      type: 'object', additionalProperties: false, required: ['hours_evidence', 'opd_hours'],
      properties: { hours_evidence: { type: 'string' }, opd_hours: { type: 'array', items: SLOT } },
    },
    doctors: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'qualification', 'specialty_as_written', 'specialty', 'branch', 'gender', 'languages', 'source_page', 'hours_from', 'opd_text', 'hours_evidence', 'opd_hours', 'evidence'],
        properties: {
          name: { type: 'string' }, qualification: { type: 'string' }, specialty_as_written: { type: 'string' },
          specialty: { type: 'string', enum: [...SPECIALTIES, 'Other'] }, branch: { type: 'string' },
          gender: { anyOf: [{ type: 'string', enum: ['female'] }, { type: 'null' }] },
          languages: { type: 'array', items: { type: 'string' } },
          source_page: { type: 'string' }, hours_from: { type: 'string', enum: ['doctor', 'own_clinic', 'none'] },
          opd_text: { type: 'string' }, hours_evidence: { type: 'string' }, opd_hours: { type: 'array', items: SLOT }, evidence: { type: 'string' },
        },
      },
    },
  },
}

export function doctorsRequest(place, city, urls, excerpts) {
  return {
    contents: [{ role: 'user', parts: [{ text:
      `Facility: ${place.name} (${place.kind})\nAddress: ${place.address ?? 'not listed'}, ${city.name}\nPages: ${urls.join(' , ')}\n\nExcerpts:\n${excerpts}` }] }],
    config: { systemInstruction: SYSTEM, responseMimeType: 'application/json', responseJsonSchema: SCHEMA },
  }
}

export function answerOf(response) {
  const candidate = response?.candidates?.[0]
  return { finishReason: candidate?.finishReason ?? null, text: (candidate?.content?.parts ?? []).filter(p => !p.thought && p.text).map(p => p.text).join('') }
}

// Lines that may name a doctor or give consulting hours, each with its neighbours: only these go to Gemini.
// One block per page ("=== <address> ===") so Gemini can tell whose page each time belongs to.
const DOCTOR_LINE = /\bdr\b\.?|\bprof\.|mbbs|\bm\.?\s?d\b|\bm\.?\s?s\b|\bdnb\b|\bd\.?\s?m\b|m\.?\s?ch\b|\bbds\b|\bmds\b|frcs|mrcp|consultant|specialist|physician|surgeon|gyn|obst|paediat|pediat|ortho|cardi|neuro|derma|\bent\b|ophthal|dent|gastro|pulmo|chest|psychiat|urolog|nephro|onco|endocrin|diabet|\bopd\b|timing|schedule|available|consult/i
const TIME_LINE = /\b\d{1,2}\s*([:.]\s*\d{2})?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])|\b([01]?\d|2[0-3])[:.][0-5]\d\b|\b(mon|tue|wed|thu|fri|sat|sun)(day)?\b|बजे|सुबह|शाम/i
const MAX_EXCERPT_CHARS = 45000, MAX_DOCTOR_PAGE_CHARS = 1400
function excerptOf(text, max) {
  const lines = text.split('\n'), keep = new Set()
  lines.forEach((line, i) => { if (DOCTOR_LINE.test(line) || TIME_LINE.test(line)) for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 2); j++) keep.add(j) })
  let out = '', last = -2
  for (const i of [...keep].sort((a, b) => a - b)) {
    const piece = (i === last + 1 ? '' : '\n…\n') + lines[i] + '\n'
    if (out.length + piece.length > max) break
    out += piece; last = i
  }
  return out.trim()
}
// One doctor's own page: their name and degrees, then the schedule block ("OPD schedule", "Timings", "Availability")
const SCHEDULE_HEADING = /opd schedule|opd tim|consultation tim|timings?\b|schedule|availability|available on|visiting hours|consulting hours|ओपीडी|समय/i
function doctorPageExcerpt(text) {
  const lines = text.split('\n')
  const nameAt = lines.findIndex(l => /\bdr\b\.?\s*[a-z]/i.test(l))
  const head = nameAt >= 0 ? lines.slice(nameAt, nameAt + 4) : []
  const at = lines.findIndex((l, i) => i > nameAt && SCHEDULE_HEADING.test(l) && lines.slice(i, i + 12).some(x => TIME_LINE.test(x) || /being updated|contact/i.test(x)))
  const body = at >= 0 ? lines.slice(at, at + 40) : []
  const out = [...head, ...(body.length ? ['…', ...body] : [])].join('\n')
  return out.length > MAX_DOCTOR_PAGE_CHARS ? out.slice(0, MAX_DOCTOR_PAGE_CHARS) : (out || excerptOf(text, MAX_DOCTOR_PAGE_CHARS))
}

export function doctorExcerpts(sections) {
  let out = ''
  for (const sec of sections) {
    const part = sec.doctorPage ? doctorPageExcerpt(sec.text) : excerptOf(sec.text, 8000)
    if (!part) continue
    const block = `=== ${sec.url} ===\n${part}\n\n`
    if (out.length + block.length > MAX_EXCERPT_CHARS) break
    out += block
  }
  return /\bdr\b\.?\s*[a-z]/i.test(out) || /mbbs|\bbds\b/i.test(out) ? out.trim() : null
}

const squash = s => s.toLowerCase().replace(/[\s….,:;()\-–|/]+/g, ' ').trim()
// "Dr. (Mrs.) A. K. Jain" -> "a k jain"; same rules as doctor_key() in SQL
export const doctorKey = name => squash(String(name ?? '').toLowerCase()
  .replace(/\b(dr|prof|professor|mr|mrs|ms|miss|smt|shri|mbbs|md|dm|mch|dnb|bds|mds|frcs|mrcp|dgo|dch|phd|facs|fics)\b\.?/g, ' ')
  .replace(/[^a-z]+/g, ' '))

// A word in the evidence that backs the chosen specialty
const SPECIALTY_WORDS = {
  'General Physician': /general|family|physician|medical officer|mbbs/i, 'Internal Medicine': /medicine|physician|internal/i,
  Gastroenterologist: /gastro|liver|hepat|digest|endoscop/i, Pulmonologist: /pulmo|chest|respir|lung|\btb\b/i, Cardiologist: /cardi|heart/i,
  Dermatologist: /derma|skin|cosmet|venereo/i, ENT: /\bent\b|ear|nose|throat|otorhino|rhino|laryn|cochlear|\bdlo\b/i, Orthopedic: /ortho|joint|spine|bone|fracture|trauma/i,
  Pediatric: /paediat|pediat|child|neonat/i, Gynecologist: /gyn|obst|women|maternity|ivf|infertility/i, Ophthalmologist: /eye|ophthal|retina|cataract|lasik/i,
  Dentist: /dent|bds|mds|oral|ortho?dont|endodont|periodont|prosthodont|root canal/i, Neurologist: /neuro/i, Psychiatrist: /psych/i, Urologist: /uro|genito/i, Nephrologist: /nephro|kidney|dialysis/i,
  'General Surgeon': /surg/i, Oncologist: /onco|cancer/i, Endocrinologist: /endocrin|diabet|thyroid/i,
}
const KNOWN_LANGUAGES = ['English', 'Hindi', 'French', 'German', 'Spanish', 'Italian', 'Russian', 'Japanese', 'Chinese', 'Korean', 'Hebrew', 'Tamil', 'Kannada', 'Bengali', 'Telugu', 'Marathi']

// A doctor's OPD hours, only when the page states them for this doctor (or for the clinic they alone run),
// with the days given, and the quoted hours really on the page
const DAY_WORDS = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|daily|all days|every ?day|सोम|मंगल|बुध|गुरु|शुक्र|शनि|रवि|रोज/i
const TIME_WORDS = /\d\s*(a\.?m|p\.?m)|\b\d{1,2}[:.]\d{2}\b|बजे/i
function hoursOf(d, answer, shown) {
  const only = (answer.doctors ?? []).length === 1
  // The page's only doctor: the clinic's stated hours are theirs, even when Gemini filed them under the clinic
  if ((!d.hours_from || d.hours_from === 'none') && only && answer.page_covers === 'this_place' && answer.facility_hours) return quotedSchedule(answer.facility_hours, shown)
  if (d.hours_from === 'none' || !d.hours_from) return null
  if (d.hours_from === 'own_clinic' && !only) return null // a shared clinic's hours aren't each doctor's
  return quotedSchedule(d, shown)
}

// DEBUG_HOURS=1 prints why hours were dropped
const why = (reason, quote) => { if (process.env.DEBUG_HOURS) console.log(`    (hours dropped: ${reason}: ${JSON.stringify(String(quote).slice(0, 90))})`); return null }

// Slots backed by a quote that's really on the page, names the days and gives times
function quotedSchedule(d, shown) {
  const quote = String(d.hours_evidence ?? '').trim()
  if (!quote || !DAY_WORDS.test(quote) || !TIME_WORDS.test(quote)) return why('no days or times in the quote', quote)
  const missing = quote.split(/\n|…/).map(squash).filter(Boolean).find(part => !shown.includes(part))
  if (missing) return why(`not on the page ("${missing}")`, quote)
  const slots = (d.opd_hours ?? []).map(x => ({ days: [...new Set(x.days)].filter(v => v >= 0 && v <= 6), open: toHHMM(x.open), close: toHHMM(x.close) }))
  if (!slots.length || slots.some(x => !x.days.length || !x.open || !x.close || x.close <= x.open)) return why(`bad slots ${JSON.stringify(d.opd_hours)}`, quote)
  return normalizeSchedule(slots)
}

// The hospital or clinic's own hours, when the page states them for the whole place: for set_place_hours().
// Shown on its doctors' cards as the place's hours while their own aren't known.
export function interpretFacilityHours({ finishReason, text }, place, excerpts, sourceKey) {
  if (finishReason !== 'STOP' || !sourceKey) return null
  let answer
  try { answer = JSON.parse(text) } catch { return null }
  if (answer.page_covers !== 'this_place' || !answer.facility_hours) return null
  const quote = String(answer.facility_hours.hours_evidence ?? '')
  if (/emergenc|casualty|trauma/i.test(quote)) return null
  const schedule = quotedSchedule(answer.facility_hours, squash(excerpts))
  return schedule ? { source_key: sourceKey, schedule, hours_source: 'website-ai', evidence: quote.trim().slice(0, 500) } : null
}

// The rows for stage_doctors(): only named doctors whose quote really is on the page and names them.
// Chain pages keep only doctors whose stated branch is in this city (or this place).
export function interpretDoctors({ finishReason, text }, place, city, urls, excerpts) {
  if (finishReason !== 'STOP') return []
  let answer
  try { answer = JSON.parse(text) } catch { return [] }
  if (!['this_place', 'several_branches'].includes(answer.page_covers)) return []
  const shown = squash(excerpts), here = [city.name, ...String(place.name).split(/\s+/).filter(w => w.length > 4)].map(w => w.toLowerCase())
  const out = new Map()
  for (const d of answer.doctors ?? []) {
    // "Dr.Manoj Gupta, MBBS" -> "Dr. Manoj Gupta"
    const name = String(d.name ?? '').replace(/,.*$/, '').replace(/\b(Dr|Prof)\.(?=\S)/gi, '$1. ').replace(/\s+/g, ' ').trim()
    const key = doctorKey(name)
    if (!key || key.split(' ').filter(w => w.length > 1).length < 1 || key.length < 4) continue
    if (d.specialty === 'Other' || !SPECIALTIES.includes(d.specialty)) continue
    const evidence = String(d.evidence ?? '').trim()
    const quoted = evidence && evidence.split(/\n|…/).map(squash).filter(Boolean).every(part => shown.includes(part))
    const surname = key.split(' ').at(-1)
    if (!quoted || !squash(evidence).includes(surname)) continue
    if (answer.page_covers === 'several_branches' && !here.some(w => String(d.branch ?? '').toLowerCase().includes(w))) continue
    const backed = SPECIALTY_WORDS[d.specialty].test(`${evidence} ${d.specialty_as_written} ${d.qualification}`)
    const schedule = hoursOf(d, answer, shown)
    const prefixFemale = /\b(mrs|ms|smt|miss)\b\.?/i.test(`${d.name} ${evidence}`)
    out.set(key, {
      source_key: `${place.id}:${key}`,
      city: city.slug,
      place_id: place.id,
      name: /^\s*(dr|prof)\b/i.test(name) || !/\b(mbbs|bds|md|ms)\b/i.test(d.qualification ?? '') ? name : `Dr. ${name}`,
      specialty: [d.specialty],
      specialty_text: String(d.specialty_as_written ?? '').slice(0, 120) || null,
      qualification: String(d.qualification ?? '').trim().slice(0, 160) || null,
      languages: (d.languages ?? []).filter(l => KNOWN_LANGUAGES.includes(l) && shown.includes(l.toLowerCase())),
      gender: d.gender === 'female' && prefixFemale ? 'female' : null,
      schedule,
      opd_text: String(d.opd_text ?? '').trim().slice(0, 200) || null,
      hours_evidence: schedule ? String(d.hours_evidence || answer.facility_hours?.hours_evidence || '').trim().slice(0, 300) : null,
      source_url: urls.includes(d.source_page) || String(d.source_page).startsWith('http') && excerpts.includes(`=== ${d.source_page} ===`) ? d.source_page : urls[0],
      evidence: evidence.slice(0, 400),
      // Quoted and the specialty is in the page's words: confident; quoted but the specialty was inferred: a person checks
      confidence: backed ? 0.9 : 0.7,
    })
  }
  return [...out.values()]
}
