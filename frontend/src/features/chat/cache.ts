import type { Conversation, Message, ReactionGroup } from '@shared/types'

export type ClientMessage = Message & { status?: 'sending' | 'failed' }

export interface Thread {
  messages: ClientMessage[]
  hasMore: boolean
  hasNewer: boolean
}

/** Optimistic messages have no server number yet, so they sort after everything else. */
export const PENDING_SEQ = Number.MAX_SAFE_INTEGER

export function sortConversations(list: Conversation[]): Conversation[] {
  const time = (c: Conversation) => new Date(c.lastMessageAt ?? c.createdAt).getTime()
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || time(b) - time(a))
}

/** Insert or replace by id, or by clientId when the server confirms an optimistic message. */
export function upsertMessage(messages: ClientMessage[], msg: ClientMessage): ClientMessage[] {
  const i = messages.findIndex((m) => m.id === msg.id || (msg.clientId !== null && m.clientId === msg.clientId))
  const next = i >= 0 ? messages.map((m, idx) => (idx === i ? msg : m)) : [...messages, msg]
  return next.sort((a, b) => a.seq - b.seq)
}

export function removeMessage(messages: ClientMessage[], id: string): ClientMessage[] {
  return messages.filter((m) => m.id !== id)
}

export function setReactions(messages: ClientMessage[], id: string, reactions: ReactionGroup[]): ClientMessage[] {
  return messages.map((m) => (m.id === id ? { ...m, reactions } : m))
}

/** A new message arrived (or was sent): refresh the preview, order and unread badge of its conversation. */
export function applyMessageToConversations(list: Conversation[], msg: Message, meId: string, viewing: boolean): Conversation[] | null {
  const idx = list.findIndex((c) => c.id === msg.conversationId)
  if (idx < 0) return null
  const mine = msg.senderId === meId
  const updated: Conversation = {
    ...list[idx]!,
    lastMessage: { id: msg.id, senderId: msg.senderId, kind: msg.kind, body: msg.body, deleted: false, createdAt: msg.createdAt },
    lastMessageAt: msg.createdAt,
    archived: mine ? list[idx]!.archived : false,
    unreadCount: mine || viewing ? (mine ? 0 : list[idx]!.unreadCount) : list[idx]!.unreadCount + 1,
  }
  return sortConversations(list.map((c, i) => (i === idx ? updated : c)))
}

/** The message shown as a conversation's preview was edited or deleted. */
export function applyUpdateToPreview(list: Conversation[], msg: Message): Conversation[] {
  return list.map((c) =>
    c.lastMessage?.id === msg.id ? { ...c, lastMessage: { ...c.lastMessage, body: msg.body, kind: msg.kind, deleted: Boolean(msg.deletedAt) } } : c,
  )
}

export function totalUnread(list: Conversation[] | undefined): number {
  return (list ?? []).filter((c) => !c.muted && !c.archived).reduce((n, c) => n + c.unreadCount, 0)
}
