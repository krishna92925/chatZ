import type { QueryClient } from '@tanstack/react-query'
import type { Attachment, Conversation, Message, ReactionGroup } from '@shared/types'
import { request } from '@/lib/socket'
import { PENDING_SEQ, applyMessageToConversations, removeMessage, setReactions, upsertMessage, type ClientMessage, type Thread } from './cache'
import { keys } from './queries'

const FRIENDLY: Record<string, string> = {
  friends_only: 'This person only accepts messages from friends.',
  blocked: "You can't message this person.",
  rate_limited: 'You are sending too fast. Wait a moment.',
  invalid_attachment: 'An attachment expired. Remove it and add it again.',
}
export const friendlyError = (err: unknown): string => {
  const code = (err as { code?: string })?.code
  return (code && FRIENDLY[code]) || (err instanceof Error ? err.message : 'Something went wrong.')
}

export interface SendInput {
  conversationId: string
  body: string
  replyTo: Message | null
  attachments: Attachment[]
  attachmentIds: string[]
}

const outbox = new Map<string, SendInput>()

function patchThread(qc: QueryClient, conversationId: string, fn: (m: ClientMessage[]) => ClientMessage[]) {
  qc.setQueryData<Thread>(keys.thread(conversationId), (t) => (t ? { ...t, messages: fn(t.messages) } : t))
}

/** Shows the message immediately, sends it, then swaps in the server's copy (or marks it failed). */
export async function sendMessage(qc: QueryClient, meId: string, input: SendInput, retryClientId?: string): Promise<boolean> {
  const clientId = retryClientId ?? crypto.randomUUID()
  const saved = retryClientId ? (outbox.get(retryClientId) ?? input) : input
  outbox.set(clientId, saved)
  const optimistic: ClientMessage = {
    id: `tmp-${clientId}`,
    conversationId: saved.conversationId,
    seq: PENDING_SEQ,
    senderId: meId,
    kind: saved.attachments.length ? (saved.attachments.every((a) => a.kind === saved.attachments[0]!.kind) ? saved.attachments[0]!.kind : 'file') : 'text',
    body: saved.body,
    attachments: saved.attachments,
    replyTo: saved.replyTo
      ? { id: saved.replyTo.id, senderId: saved.replyTo.senderId, kind: saved.replyTo.kind, body: saved.replyTo.body.slice(0, 140), deleted: false }
      : null,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    clientId,
    status: 'sending',
  }
  patchThread(qc, saved.conversationId, (m) => upsertMessage(m, optimistic))
  qc.setQueryData<Conversation[]>(keys.conversations, (l) => (l ? (applyMessageToConversations(l, optimistic, meId, true) ?? l) : l))
  try {
    const message = await request<Message>('message:send', {
      conversationId: saved.conversationId,
      clientId,
      body: saved.body,
      replyToId: saved.replyTo?.id ?? null,
      attachmentIds: saved.attachmentIds,
    })
    outbox.delete(clientId)
    patchThread(qc, saved.conversationId, (m) => upsertMessage(m, message))
    qc.setQueryData<Conversation[]>(keys.conversations, (l) => (l ? (applyMessageToConversations(l, message, meId, true) ?? l) : l))
    return true
  } catch (err) {
    patchThread(qc, saved.conversationId, (m) => upsertMessage(m, { ...optimistic, status: 'failed' }))
    const code = (err as { code?: string }).code
    if (code === 'friends_only' || code === 'blocked') void qc.invalidateQueries({ queryKey: keys.conversations })
    throw err
  }
}

export function discardFailed(qc: QueryClient, conversationId: string, msg: ClientMessage) {
  if (msg.clientId) outbox.delete(msg.clientId)
  patchThread(qc, conversationId, (m) => removeMessage(m, msg.id))
}

export async function editMessage(qc: QueryClient, conversationId: string, messageId: string, body: string) {
  const message = await request<Message>('message:edit', { messageId, body })
  patchThread(qc, conversationId, (m) => upsertMessage(m, message))
  qc.setQueryData<Conversation[]>(keys.conversations, (l) => l?.map((c) => (c.lastMessage?.id === messageId ? { ...c, lastMessage: { ...c.lastMessage, body: message.body } } : c)))
}

export async function deleteMessage(qc: QueryClient, msg: ClientMessage, scope: 'me' | 'everyone') {
  await request<null>('message:delete', { messageId: msg.id, scope })
  if (scope === 'me') return patchThread(qc, msg.conversationId, (m) => removeMessage(m, msg.id))
  patchThread(qc, msg.conversationId, (m) => m.map((x) => (x.id === msg.id ? { ...x, body: '', attachments: [], reactions: [], deletedAt: new Date().toISOString() } : x)))
  qc.setQueryData<Conversation[]>(keys.conversations, (l) => l?.map((c) => (c.lastMessage?.id === msg.id ? { ...c, lastMessage: { ...c.lastMessage, body: '', deleted: true } } : c)))
}

export async function toggleReaction(qc: QueryClient, msg: ClientMessage, emoji: string, meId: string) {
  // show the change at once, then trust the server's answer
  const had = msg.reactions.find((r) => r.emoji === emoji)?.userIds.includes(meId)
  const guess: ReactionGroup[] = had
    ? msg.reactions.map((r) => (r.emoji === emoji ? { ...r, userIds: r.userIds.filter((u) => u !== meId) } : r)).filter((r) => r.userIds.length)
    : msg.reactions.some((r) => r.emoji === emoji)
      ? msg.reactions.map((r) => (r.emoji === emoji ? { ...r, userIds: [...r.userIds, meId] } : r))
      : [...msg.reactions, { emoji, userIds: [meId] }]
  patchThread(qc, msg.conversationId, (m) => setReactions(m, msg.id, guess))
  try {
    const real = await request<ReactionGroup[]>('reaction:toggle', { messageId: msg.id, emoji })
    patchThread(qc, msg.conversationId, (m) => setReactions(m, msg.id, real))
  } catch (err) {
    patchThread(qc, msg.conversationId, (m) => setReactions(m, msg.id, msg.reactions))
    throw err
  }
}
