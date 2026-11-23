import { describe, expect, it } from 'vitest'
import type { Conversation, Message } from '@shared/types'
import { PENDING_SEQ, applyMessageToConversations, sortConversations, totalUnread, upsertMessage, type ClientMessage } from './cache'

const msg = (o: Partial<ClientMessage>): ClientMessage => ({
  id: 'm', conversationId: 'c1', seq: 1, senderId: 'a', kind: 'text', body: 'hi', attachments: [], replyTo: null, reactions: [],
  editedAt: null, deletedAt: null, createdAt: '2026-01-01T10:00:00Z', clientId: null, ...o,
})
const conv = (o: Partial<Conversation>): Conversation => ({
  id: 'c1', type: 'direct', peer: { id: 'p', username: 'p', fullName: 'P', bio: '', avatarUrl: null, online: false, lastSeenAt: null },
  lastMessage: null, lastMessageAt: null, unreadCount: 0, muted: false, pinned: false, archived: false, canSend: true, myLastReadSeq: 0,
  peerLastReadSeq: null, createdAt: '2026-01-01T00:00:00Z', ...o,
})

describe('upsertMessage', () => {
  it('replaces an optimistic message by clientId and keeps order by seq', () => {
    const pending = msg({ id: 'tmp-1', clientId: 'cid-1', seq: PENDING_SEQ, status: 'sending' })
    const before = [msg({ id: 'a', seq: 1 }), pending]
    const confirmed = msg({ id: 'real', clientId: 'cid-1', seq: 3 })
    const after = upsertMessage([...before, msg({ id: 'b', seq: 2 })], confirmed)
    expect(after.map((m) => m.id)).toEqual(['a', 'b', 'real'])
    expect(after.find((m) => m.id === 'real')?.status).toBeUndefined()
  })
  it('does not duplicate a message that arrives twice', () => {
    const once = upsertMessage([], msg({ id: 'x', seq: 5 }))
    expect(upsertMessage(once, msg({ id: 'x', seq: 5, body: 'edited' }))).toHaveLength(1)
  })
  it('puts a live incoming message before still-pending ones', () => {
    const list = [msg({ id: 'p', seq: PENDING_SEQ, clientId: 'c', status: 'sending' })]
    expect(upsertMessage(list, msg({ id: 'in', seq: 10 })).map((m) => m.id)).toEqual(['in', 'p'])
  })
})

describe('conversation list', () => {
  it('moves a conversation with a new message to the top and counts unread', () => {
    const list = [conv({ id: 'c1', lastMessageAt: '2026-01-01T09:00:00Z' }), conv({ id: 'c2', lastMessageAt: '2026-01-02T09:00:00Z' })]
    const next = applyMessageToConversations(list, msg({ conversationId: 'c1', createdAt: '2026-01-03T09:00:00Z' }) as Message, 'me', false)!
    expect(next.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(next[0]!.unreadCount).toBe(1)
    expect(next[0]!.lastMessage?.body).toBe('hi')
  })
  it('does not count unread for my own messages or while viewing', () => {
    const list = [conv({ unreadCount: 2 })]
    expect(applyMessageToConversations(list, msg({ senderId: 'me' }), 'me', false)![0]!.unreadCount).toBe(0)
    expect(applyMessageToConversations(list, msg({ senderId: 'a' }), 'me', true)![0]!.unreadCount).toBe(2)
  })
  it('returns null for an unknown conversation so the caller can refetch', () => {
    expect(applyMessageToConversations([conv({})], msg({ conversationId: 'zzz' }), 'me', false)).toBeNull()
  })
  it('keeps pinned chats first, then newest', () => {
    const list = [conv({ id: 'old', lastMessageAt: '2026-01-01T00:00:00Z' }), conv({ id: 'pin', pinned: true, lastMessageAt: '2025-01-01T00:00:00Z' }), conv({ id: 'new', lastMessageAt: '2026-02-01T00:00:00Z' })]
    expect(sortConversations(list).map((c) => c.id)).toEqual(['pin', 'new', 'old'])
  })
  it('totals unread without muted or archived chats', () => {
    expect(totalUnread([conv({ unreadCount: 3 }), conv({ id: 'm', unreadCount: 5, muted: true }), conv({ id: 'a', unreadCount: 2, archived: true })])).toBe(3)
  })
})
