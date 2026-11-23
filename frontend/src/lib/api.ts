import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiErrorBody } from '@shared/types'
import { API_URL } from './env'
import { supabase } from './supabase'

export const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 30_000 })

type Retriable = InternalAxiosRequestConfig & { _retried?: boolean }

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) config.headers.Authorization = `Bearer ${data.session.access_token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as Retriable | undefined
    if (error.response?.status === 401 && config && !config._retried && !config.url?.startsWith('/auth/')) {
      config._retried = true
      const { data, error: refreshError } = await supabase.auth.refreshSession()
      if (!refreshError && data.session) {
        config.headers.Authorization = `Bearer ${data.session.access_token}`
        return api.request(config)
      }
      await supabase.auth.signOut()
    }
    return Promise.reject(error)
  },
)

export function apiCode(err: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(err)) return err.response?.data?.error?.code ?? (err.response ? 'http_error' : 'network_error')
  return 'unknown'
}

export function apiMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    const msg = err.response?.data?.error?.message
    if (msg) return msg
    if (!err.response) return "Can't reach the server. Check your connection and try again."
  }
  if (err instanceof Error && err.message && !axios.isAxiosError(err)) return err.message
  return fallback
}

/** API paths such as /api/files/... or /api/avatars/... become absolute URLs for <img> and <video>. */
export function absUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return /^https?:/.test(path) ? path : `${API_URL}${path}`
}
