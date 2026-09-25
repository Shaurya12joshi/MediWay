import { createClient } from '@supabase/supabase-js'
const Supabase_URL = import.meta.env.VITE_SUPABASE_URL
const Supabase_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(Supabase_URL && Supabase_KEY)
if (!supabaseConfigured) {
  // Vite inlines these at build time — the host must have them set before `npm run build`
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time. Add them to your hosting provider\'s environment variables and redeploy.')
}

// createClient throws on an empty URL, which would take down every script importing this file.
// A placeholder keeps the page alive: queries come back as { error } and there is no session.
export const supabase = createClient(
  Supabase_URL || 'https://not-configured.invalid',
  Supabase_KEY || 'not-configured'
)
