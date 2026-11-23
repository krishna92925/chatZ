import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Conversation, FriendRequest, MeResponse, MessagePage, PublicUser } from '@shared/types'
import { api } from '@/lib/api'
import type { Thread } from './cache'

export const keys = {
  me: ['me'] as const,
  conversations: ['conversations'] as const,
  thread: (id: string) => ['thread', id] as const,
  friends: ['friends'] as const,
  requests: ['requests'] as const,
  blocks: ['blocks'] as const,
}

export const useMe = (enabled = true) =>
  useQuery({ queryKey: keys.me, queryFn: async () => (await api.get<MeResponse>('/me')).data, enabled, staleTime: 5 * 60_000 })

export const useConversations = () =>
  useQuery({ queryKey: keys.conversations, queryFn: async () => (await api.get<Conversation[]>('/conversations')).data, staleTime: 30_000 })

export function useConversation(id: string | undefined): Conversation | undefined {
  const { data } = useConversations()
  return data?.find((c) => c.id === id)
}

export const useFriends = () => useQuery({ queryKey: keys.friends, queryFn: async () => (await api.get<PublicUser[]>('/friends')).data, staleTime: 30_000 })
export const useRequests = () => useQuery({ queryKey: keys.requests, queryFn: async () => (await api.get<FriendRequest[]>('/friends/requests')).data, staleTime: 30_000 })
export const useBlocks = () => useQuery({ queryKey: keys.blocks, queryFn: async () => (await api.get<PublicUser[]>('/blocks')).data, staleTime: 60_000 })

/** Latest page of a conversation. Live events keep it current, so it never goes stale by itself. */
export function useThread(id: string) {
  return useQuery({
    queryKey: keys.thread(id),
    queryFn: async (): Promise<Thread> => {
      const page = (await api.get<MessagePage>(`/conversations/${id}/messages`, { params: { limit: 40 } })).data
      return { messages: page.messages, hasMore: page.hasMore, hasNewer: false }
    },
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })
}

export async function loadOlder(qc: QueryClient, id: string): Promise<void> {
  const cur = qc.getQueryData<Thread>(keys.thread(id))
  const first = cur?.messages.find((m) => m.status === undefined)
  if (!cur || !first || !cur.hasMore) return
  const page = (await api.get<MessagePage>(`/conversations/${id}/messages`, { params: { limit: 40, before: first.seq } })).data
  qc.setQueryData<Thread>(keys.thread(id), (t) => (t ? { ...t, messages: [...page.messages, ...t.messages], hasMore: page.hasMore } : t))
}

export async function loadNewer(qc: QueryClient, id: string): Promise<void> {
  const cur = qc.getQueryData<Thread>(keys.thread(id))
  const last = [...(cur?.messages ?? [])].reverse().find((m) => m.status === undefined)
  if (!cur || !last || !cur.hasNewer) return
  const page = (await api.get<MessagePage>(`/conversations/${id}/messages`, { params: { limit: 40, around: last.seq } })).data
  qc.setQueryData<Thread>(keys.thread(id), (t) => {
    if (!t) return t
    const known = new Set(t.messages.map((m) => m.id))
    const fresh = page.messages.filter((m) => !known.has(m.id))
    return { ...t, messages: [...t.messages, ...fresh], hasNewer: page.hasNewer }
  })
}

/** Replace the cached thread with the messages around one message (used by search results). */
export async function jumpToMessage(qc: QueryClient, id: string, seq: number): Promise<void> {
  const page = (await api.get<MessagePage>(`/conversations/${id}/messages`, { params: { limit: 25, around: seq } })).data
  qc.setQueryData<Thread>(keys.thread(id), { messages: page.messages, hasMore: page.hasMore, hasNewer: page.hasNewer })
}

export async function resetThread(qc: QueryClient, id: string): Promise<void> {
  qc.removeQueries({ queryKey: keys.thread(id) })
  await qc.invalidateQueries({ queryKey: keys.thread(id) })
}

export const useInvalidate = () => {
  const qc = useQueryClient()
  return {
    conversations: () => qc.invalidateQueries({ queryKey: keys.conversations }),
    friends: () => qc.invalidateQueries({ queryKey: keys.friends }),
    requests: () => qc.invalidateQueries({ queryKey: keys.requests }),
    blocks: () => qc.invalidateQueries({ queryKey: keys.blocks }),
    me: () => qc.invalidateQueries({ queryKey: keys.me }),
  }
}
