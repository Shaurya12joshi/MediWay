import { createClient } from '@supabase/supabase-js'
const Supabase_URL = import.meta.env.VITE_SUPABASE_URL
const Supabase_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(Supabase_URL, Supabase_KEY)