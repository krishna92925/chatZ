import { create } from 'zustand'
import type { Message } from '@shared/types'

export type Connection = 'connecting' | 'online' | 'offline'

interface ChatState {
  connection: Connection
  drafts: Record<string, string>
  replyTo: Record<string, Message | null>
  typing: Record<string, string[]>
  switcherOpen: boolean
  helpOpen: boolean
  setConnection: (c: Connection) => void
  setDraft: (conversationId: string, text: string) => void
  setReplyTo: (conversationId: string, m: Message | null) => void
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void
  clearTyping: (conversationId: string, userId: string) => void
  setSwitcherOpen: (v: boolean) => void
  setHelpOpen: (v: boolean) => void
  reset: () => void
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

const initial = { connection: 'connecting' as Connection, drafts: {}, replyTo: {}, typing: {}, switcherOpen: false, helpOpen: false }

export const useChat = create<ChatState>((set, get) => ({
  ...initial,
  setConnection: (connection) => set({ connection }),
  setDraft: (id, text) => set((s) => ({ drafts: { ...s.drafts, [id]: text } })),
  setReplyTo: (id, m) => set((s) => ({ replyTo: { ...s.replyTo, [id]: m } })),
  setTyping: (id, userId, isTyping) => {
    const key = `${id}:${userId}`
    clearTimeout(timers.get(key))
    if (!isTyping) return get().clearTyping(id, userId)
    set((s) => ({ typing: { ...s.typing, [id]: [...new Set([...(s.typing[id] ?? []), userId])] } }))
    // a typing signal that is never followed by "stopped" (closed tab, lost network) expires on its own
    timers.set(key, setTimeout(() => get().clearTyping(id, userId), 6000))
  },
  clearTyping: (id, userId) => {
    clearTimeout(timers.get(`${id}:${userId}`))
    set((s) => ({ typing: { ...s.typing, [id]: (s.typing[id] ?? []).filter((u) => u !== userId) } }))
  },
  setSwitcherOpen: (switcherOpen) => set({ switcherOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  reset: () => {
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
    set({ ...initial })
  },
}))
