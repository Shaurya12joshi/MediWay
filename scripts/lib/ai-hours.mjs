// Reading opening hours written as plain text ("Mon–Sat 10 AM to 8 PM, Sunday closed") with Gemini.
// enrich-hours.mjs sends one request per place through the Gemini Batch API and uses
// interpretAnswer() to decide what goes live, what becomes a suggestion and what is dropped.

import { normalizeSchedule, toHHMM } from './opening-hours.mjs'

export const DEFAULT_MODEL = 'gemini-3.8-flash'
// Bump when SYSTEM or SCHEMA changes, so cached answers to the old prompt are asked again
export const PROMPT_VERSION = 3

// Batch API $ per million tokens, input / output (ai.google.dev/gemini-api/docs/pricing, Oct 2026)
const BATCH_PRICES = { 'gemini-3.8-flash': [0.375, 1.875], 'gemini-3.5-flash': [0.75, 4.5], 'gemini-3.5-flash-lite': [0.15, 1.25] }

const SYSTEM = `You read excerpts from a healthcare facility's own website and extract its regular opening hours. The hours appear in a directory that helps travellers in India find care, so a wrong answer can send a sick person to a closed door: when in doubt, say so.

Rules:
- Only use hours the excerpts state for this facility. If they list hours for several branches, doctors or departments, use only hours that clearly apply to the facility as a whole (its OPD or front desk). If you can't tell which hours are the facility's, return no hours.
- Days are numbers: 0 Sunday, 1 Monday, 2 Tuesday, 3 Wednesday, 4 Thursday, 5 Friday, 6 Saturday.
- Times are 24-hour HH:MM. "24 hours", "24x7" or "open all day" is 00:00 to 23:59 on every day it applies to.
- A day with a break (e.g. 10-2 and 5-8) is two slots for the same days. Closing after midnight: end that slot at 23:59 and add a 00:00 slot on the next day.
- er24: true only if the excerpts say the facility runs a 24-hour emergency or casualty service; false only if they say it has none; otherwise null. Being open 24x7 is not by itself an emergency room.
- evidence: copy, word for word, the words in the excerpts that state the hours (and the emergency service, if any). Don't paraphrase or translate.
- confidence: "high" only when the days and times are both stated explicitly and clearly belong to this facility; "medium" when they probably do, when the days aren't stated, or when the wording is general ("typically", "usually", "may vary"); "low" otherwise.
- Marketing lines ("our experts are here for you 24x7", "24x7 online support") are not opening hours and not an emergency room.
- about_this_place: false if the page is plainly about a different facility than the one named.

Also note what the excerpts say about these, for foreign travellers (each true, false, or null when not stated):
- intl_insurance: accepts international travel insurance or cashless insurance claims (TPAs)
- accepts_cards: takes card payment (credit/debit, Visa, Mastercard)
- english_desk: staff speak English, or it serves international patients
- travel_clinic: offers travel medicine: travel vaccines, rabies shots, yellow fever
- female_doctor: a woman doctor practises there
details_evidence: copy, word for word, the words that state these. Leave a detail null unless the excerpts say it plainly.`

// Structured output: the answer always parses
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['about_this_place', 'hours', 'er24', 'confidence', 'evidence', 'details', 'details_evidence'],
  properties: {
    about_this_place: { type: 'boolean' },
    hours: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['days', 'open', 'close'],
        properties: {
          days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
          open: { type: 'string', description: 'HH:MM, 24-hour' },
          close: { type: 'string', description: 'HH:MM, 24-hour' },
        },
      },
    },
    er24: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    evidence: { type: 'string' },
    details: {
      type: 'object',
      additionalProperties: false,
      required: ['intl_insurance', 'accepts_cards', 'english_desk', 'travel_clinic', 'female_doctor'],
      properties: {
        intl_insurance: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
        accepts_cards: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
        english_desk: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
        travel_clinic: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
        female_doctor: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
      },
    },
    details_evidence: { type: 'string' },
  },
}

// One inlined request for ai.batches.create()
export function batchRequest(place, url, excerpts) {
  return {
    contents: [{
      role: 'user',
      parts: [{ text: `Facility: ${place.name} (${place.kind})\nAddress: ${place.address ?? 'not listed'}\nWebsite page: ${url}\n\nExcerpts from the page:\n${excerpts}` }],
    }],
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: 'application/json',
      responseJsonSchema: SCHEMA,
    },
  }
}

// What's worth keeping from a GenerateContentResponse: why it stopped, and the answer text (not thoughts)
export function answerOf(response) {
  const candidate = response?.candidates?.[0]
  return {
    finishReason: candidate?.finishReason ?? null,
    text: (candidate?.content?.parts ?? []).filter(p => !p.thought && p.text).map(p => p.text).join(''),
  }
}

// Rough, deliberately on the high side: ~3.5 characters a token, ~1,500 output tokens with thinking
export function estimateCost(requests, model) {
  const [inPrice, outPrice] = BATCH_PRICES[model] ?? BATCH_PRICES[DEFAULT_MODEL]
  const inputTokens = requests.reduce((n, r) => n + (SYSTEM.length + r.contents[0].parts[0].text.length) / 3.5, 0)
  const outputTokens = requests.length * 1500
  return { inputTokens: Math.round(inputTokens), dollars: (inputTokens * inPrice + outputTokens * outPrice) / 1e6 }
}

const squash = s => s.toLowerCase().replace(/[\s…]+/g, ' ').trim()

// Checks on the quoted evidence that don't depend on the model getting its confidence right
const NAMES_DAYS = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|daily|every ?day|all days|7 days|\b24\s*[x×*\/]\s*7\b|सोम|मंगल|बुध|गुरु|शुक्र|शनि|रवि|प्रतिदिन|रोज/i
const HEDGED = /typically|usually|generally|normally|may vary|subject to|approx|around \d|tentative/i
const NAMES_EMERGENCY = /emergenc|casualty|trauma|\ber\b|आपात|इमरजेंसी/i
const ROUND_THE_CLOCK = /\b24\s*[x×*\/]\s*7\b|\b24\s*(hours?|hrs?)\b|round[- ]the[- ]clock|all night|24 घंटे/i

// Each traveller detail needs a quote that talks about it
const DETAIL_WORDS = {
  intl_insurance: /insurance|cashless|\btpa\b|mediclaim/i,
  accepts_cards: /card|\bvisa\b|mastercard|\bamex\b|rupay/i,
  english_desk: /english/i,
  travel_clinic: /vaccin|travel|rabies|yellow fever/i,
  female_doctor: /female|lady|wom[ae]n/i,
}
export const DETAIL_KEYS = Object.keys(DETAIL_WORDS)

// Every line of a quote must appear in what the model was shown: nothing invented
function quotedFrom(quote, excerpts) {
  const shown = squash(excerpts)
  return Boolean(quote) && quote.split(/\n|…/).map(squash).filter(Boolean).every(part => shown.includes(part))
}

// Hours: { publish } when confident and backed by a real quote, { suggest } when worth a look.
// Either holds { schedule (or null), er24 (hospitals only, or null), evidence }, with at least one of the first two.
// Traveller details: { details } with the facts the page states, kept only when quoted. null when there's nothing.
// erOnly: the place already has hours; only its emergency answer (and details) are wanted.
export function interpretAnswer({ finishReason, text }, place, excerpts, { erOnly = false } = {}) {
  if (finishReason !== 'STOP') return null // blocked or cut off: nothing trustworthy
  let answer
  try { answer = JSON.parse(text) } catch { return null }
  if (!answer.about_this_place) return null
  const out = {}

  const slots = []
  let badSlot = false
  for (const slot of answer.hours ?? []) {
    const open = toHHMM(slot.open), close = toHHMM(slot.close)
    const days = [...new Set(slot.days)].filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
    if (!open || !close || !days.length) badSlot = true
    else slots.push({ days, open, close })
  }
  const schedule = badSlot || erOnly ? null : normalizeSchedule(slots)
  const er24 = place.kind === 'hospital' && typeof answer.er24 === 'boolean' ? answer.er24 : null

  if (schedule || er24 !== null) {
    const evidence = String(answer.evidence ?? '').trim()
    // Going live needs: a confident answer, a real quote, and a quote that actually backs the claim —
    // hours with their days and no hedging; a 24-hour ER only when the quote says emergency *and* round the clock
    const hoursBacked = !schedule || (NAMES_DAYS.test(evidence) && !HEDGED.test(evidence))
    const erBacked = er24 === null || (NAMES_EMERGENCY.test(evidence) && (er24 === false || ROUND_THE_CLOCK.test(evidence)))
    // A page may only settle the emergency question ("24/7 emergency, OPD timings vary"): that's worth keeping too
    const result = { schedule, er24, evidence: evidence.slice(0, 500) }
    if (answer.confidence === 'high' && quotedFrom(evidence, excerpts) && hoursBacked && erBacked) out.publish = result
    else out.suggest = result
  }

  const detailsEvidence = String(answer.details_evidence ?? '').trim()
  if (quotedFrom(detailsEvidence, excerpts)) {
    const details = {}
    for (const [key, words] of Object.entries(DETAIL_WORDS)) {
      const value = answer.details?.[key]
      if (typeof value === 'boolean' && words.test(detailsEvidence)) details[key] = value
    }
    if (Object.keys(details).length) out.details = { ...details, evidence: detailsEvidence.slice(0, 500) }
  }

  return Object.keys(out).length ? out : null
}

// ---------- Looking a hospital up on the web (enrich-hours.mjs --search) ----------
// For hospitals near tourists whose own website doesn't settle the emergency question (or that have no
// website at all), Gemini searches Google. The quote comes from pages this script never fetched, so it
// can't be checked like a website answer: these only ever become suggestions a person accepts.

// Bump when SEARCH_SYSTEM or SEARCH_SCHEMA changes
export const SEARCH_PROMPT_VERSION = 1

const SEARCH_SYSTEM = `You check one fact for a directory that helps travellers in India find care: does this hospital run a 24-hour emergency department (casualty)? Search the web for the hospital by its name and locality.

Rules:
- Only answer about this exact hospital: the same name in the same locality. If you can't find it, or can't tell which result it is, found is false.
- er24: true only if a source says this hospital has a 24-hour (24x7, round-the-clock) emergency or casualty service; false only if a source says it has no emergency service; otherwise null. Being "open 24 hours", a 24x7 pharmacy, or an ambulance number is not an emergency department.
- evidence: copy, word for word, the sentence from the source that says so. Don't paraphrase or translate.
- source_url and source_title: the page that says it.`

const SEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'er24', 'evidence', 'source_url', 'source_title'],
  properties: {
    found: { type: 'boolean' },
    er24: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
    evidence: { type: 'string' },
    source_url: { type: 'string' },
    source_title: { type: 'string' },
  },
}

export function searchRequest(place, city) {
  const where = [city.name, city.state, 'India'].filter(Boolean).join(', ')
  return {
    contents: [{
      role: 'user',
      parts: [{ text: `Hospital: ${place.name}\nAddress: ${place.address ?? 'not listed'}\nCity: ${where}` +
        `${place.phone ? `\nPhone: ${place.phone}` : ''}${place.website ? `\nWebsite: ${place.website}` : ''}` }],
    }],
    config: {
      systemInstruction: SEARCH_SYSTEM,
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseJsonSchema: SEARCH_SCHEMA,
    },
  }
}

// For models that can't combine Google Search with a JSON schema: ask for the JSON in words instead
export function withoutSchema(request) {
  const { responseMimeType, responseJsonSchema, ...config } = request.config
  return { ...request, config: { ...config, systemInstruction: `${SEARCH_SYSTEM}\n\nAnswer with only a JSON object: {"found": boolean, "er24": boolean or null, "evidence": string, "source_url": string, "source_title": string}` } }
}

// The answer plus the pages Google actually returned for it
export function searchAnswerOf(response) {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  return { ...answerOf(response), sources: chunks.map(c => c.web).filter(Boolean).map(w => ({ title: w.title ?? '', uri: w.uri ?? '' })) }
}

// { suggest: { schedule: null, er24, evidence } } or null. Needs a real search behind it (an answer from
// the model's memory doesn't count) and a quote that names an emergency service, round the clock if true.
export function interpretSearchAnswer({ finishReason, text, sources }) {
  if (finishReason !== 'STOP' || !sources?.length) return null
  let answer
  try { answer = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '') } catch { return null }
  if (!answer.found || typeof answer.er24 !== 'boolean') return null
  const quote = String(answer.evidence ?? '').replace(/\s+/g, ' ').trim()
  if (!NAMES_EMERGENCY.test(quote) || (answer.er24 && !ROUND_THE_CLOCK.test(quote))) return null
  const searched = [...new Set(sources.map(s => s.title).filter(Boolean))].slice(0, 3).join(', ')
  const page = [answer.source_title, answer.source_url].filter(Boolean).join(' ')
  return {
    suggest: {
      schedule: null,
      er24: answer.er24,
      evidence: `Web search: "${quote.slice(0, 300)}"${page ? ` (${page})` : ''}${searched ? ` · sources: ${searched}` : ''}`.slice(0, 500),
    },
  }
}
