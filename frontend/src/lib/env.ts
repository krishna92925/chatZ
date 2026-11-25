export const API_URL = String(import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '')
export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '')
export const SUPABASE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '')
export const OTP_LENGTH = Number(import.meta.env.VITE_OTP_LENGTH ?? 8) || 8
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)
