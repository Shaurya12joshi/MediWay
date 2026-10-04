import { createClient } from '@supabase/supabase-js'

const Supabase_URL = import.meta.env.VITE_SUPABASE_URL
const Supabase_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(Supabase_URL && Supabase_KEY)
if (!supabaseConfigured) {
  // Vite inlines these at build time — the host must have them set before `npm run build`
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time. Add them to your hosting provider\'s environment variables and redeploy.')
}

// Invite emails land on /auth#access_token=…&type=invite. Read the type before the client below
// consumes the tokens and clears the hash.
export const authLinkType = new URLSearchParams(window.location.hash.slice(1)).get('type')

// createClient throws on an empty URL, which would take the whole app down.
// A placeholder keeps it alive: queries come back as { error } and there is no session.
export const supabase = createClient(
  Supabase_URL || 'https://not-configured.invalid',
  Supabase_KEY || 'not-configured'
)
