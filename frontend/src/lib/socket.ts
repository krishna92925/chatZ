import { useSyncExternalStore } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@shared/types'
import { API_URL } from './env'
import { supabase } from './supabase'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: AppSocket | null = null
const subscribers = new Set<() => void>()
const notify = () => subscribers.forEach((f) => f())

export function connectSocket(): AppSocket {
  if (socket) return socket
  socket = io(API_URL, {
    // a fresh token on every (re)connect attempt
    auth: (cb) => {
      void supabase.auth.getSession().then(({ data }) => cb({ token: data.session?.access_token ?? '' }))
    },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 8000,
    timeout: 15_000,
  })
  notify()
  return socket
}

export function disconnectSocket() {
  socket?.removeAllListeners()
  socket?.close()
  socket = null
  notify()
}

export const getSocket = () => socket
const subscribe = (cb: () => void) => {
  subscribers.add(cb)
  return () => void subscribers.delete(cb)
}
export const useSocket = () => useSyncExternalStore(subscribe, getSocket)

type Emitter = { timeout(ms: number): { emitWithAck(event: string, payload: unknown): Promise<Ack<unknown>> } }

/** Emit and wait for the server's acknowledgement. Rejects with a readable Error. */
export async function request<T>(event: keyof ClientToServerEvents, payload: unknown): Promise<T> {
  const s = getSocket()
  if (!s || !s.connected) throw new Error("You're offline. We'll reconnect in a moment.")
  let res: Ack<unknown>
  try {
    res = await (s as unknown as Emitter).timeout(12_000).emitWithAck(event, payload)
  } catch {
    throw new Error('The server took too long to answer. Please try again.')
  }
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}
