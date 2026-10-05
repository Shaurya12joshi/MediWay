// Gemini plumbing the scripts share: retries for a busy or rate-limited model, a yes/no prompt, a pause.

import { createInterface } from 'node:readline/promises'

const MAX_ATTEMPTS = 5
export const sleep = ms => new Promise(r => setTimeout(r, ms))

// Busy model (503) or rate limit (429): wait and retry. A daily quota, or a model that stays busy, ends the run
// ({ stop }); a request the API rejects outright is skipped ({}) and retried on the next run.
export async function withRetries(call, model) {
  for (let attempt = 1; ; attempt++) {
    try {
      return { response: await call() }
    } catch (err) {
      const retryAfter = +(err.message?.match(/"retryDelay":\s*"(\d+)s"/)?.[1] ?? 0)
      const busy = err.status === 503 || err.status === 500
      const limited = err.status === 429
      if (limited && (retryAfter > 300 || /per ?day|PerDay|exceeded your current quota/i.test(err.message))) return { stop: 'the daily limit for this model is used up (free tier) or billing is needed.' }
      if ((busy || limited) && attempt < MAX_ATTEMPTS) {
        const wait = Math.min(120, retryAfter || 10 * 2 ** (attempt - 1))
        console.log(`  … Gemini ${busy ? 'is busy' : 'rate limit'} (${err.status}); waiting ${wait}s`)
        await sleep(wait * 1000)
        continue
      }
      if (busy) return { stop: `${model} is overloaded right now. Try again later, or use --model gemini-3.5-flash-lite.` }
      if (limited) return { stop: 'Gemini keeps rate-limiting this key. Try a lower --rpm, or run again later.' }
      console.log(`  … skipped one request: ${err.status ?? ''} ${err.message?.slice(0, 160)}`)
      return {}
    }
  }
}

export async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const reply = await rl.question(`${question} [y/N] `)
  rl.close()
  return /^y(es)?$/i.test(reply.trim())
}
