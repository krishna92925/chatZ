import { GoTrueClient } from '@supabase/auth-js'
import { SUPABASE_KEY, SUPABASE_URL } from './env'

// Only the auth part of Supabase is needed (email codes and session refresh), so the lightweight auth client is used
// instead of the full SDK. It keeps the session in localStorage and refreshes the access token by itself.
const auth = new GoTrueClient({
  url: `${(SUPABASE_URL || 'http://localhost').replace(/\/+$/, '')}/auth/v1`,
  headers: { apikey: SUPABASE_KEY || 'missing' },
  storageKey: 'chatz-auth',
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
})

export const supabase = { auth }
