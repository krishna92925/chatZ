import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Conversation, Message } from '@shared/types'
import { useChat } from '@/stores/chat'
import { keys } from './queries'
import type { Thread } from './cache'

const request = vi.fn()
vi.mock('@/lib/socket', () => ({ request: (...a: unknown[]) => request(...a), getSocket: () => null, useSocket: () => null }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const { Composer } = await import('./Composer')

const conversation: Conversation = {
  id: 'c1', type: 'direct', peer: { id: 'p', username: 'peer', fullName: 'Peer Person', bio: '', avatarUrl: null, online: false, lastSeenAt: null },
  lastMessage: null, lastMessageAt: null, unreadCount: 0, muted: false, pinned: false, archived: false, canSend: true, myLastReadSeq: 0, peerLastReadSeq: null, createdAt: '2026-01-01T00:00:00Z',
}
const server = (o: Partial<Message> = {}): Message => ({
  id: 'real-1', conversationId: 'c1', seq: 7, senderId: 'me', kind: 'text', body: 'hello', attachments: [], replyTo: null, reactions: [],
  editedAt: null, deletedAt: null, createdAt: '2026-03-04T09:05:00Z', clientId: null, ...o,
})

let qc: QueryClient
const mount = (c = conversation) =>
  render(
    <QueryClientProvider client={qc}>
      <Composer conversation={c} meId="me" editing={null} onStopEditing={() => undefined} onEditLast={() => undefined} />
    </QueryClientProvider>,
  )
const thread = () => qc.getQueryData<Thread>(keys.thread('c1'))!

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  qc = new QueryClient()
  qc.setQueryData<Thread>(keys.thread('c1'), { messages: [], hasMore: false, hasNewer: false })
  qc.setQueryData<Conversation[]>(keys.conversations, [conversation])
  useChat.getState().reset()
  request.mockReset()
})
afterEach(cleanup)

describe('Composer', () => {
  it('Enter sends: the message appears at once, then is replaced by the server copy', async () => {
    let finish!: (m: Message) => void
    request.mockImplementation((_e, p) => new Promise<Message>((r) => (finish = (m) => r({ ...m, clientId: (p as { clientId: string }).clientId }))))
    mount()
    await userEvent.type(screen.getByLabelText('Message Peer Person'), 'hello{Enter}')
    await waitFor(() => expect(thread().messages).toHaveLength(1))
    expect(thread().messages[0]).toMatchObject({ body: 'hello', status: 'sending', senderId: 'me' })
    expect(request).toHaveBeenCalledWith('message:send', expect.objectContaining({ conversationId: 'c1', body: 'hello', attachmentIds: [] }))
    expect((screen.getByLabelText('Message Peer Person') as HTMLTextAreaElement).value).toBe('')
    finish(server())
    await waitFor(() => expect(thread().messages[0]?.status).toBeUndefined())
    expect(thread().messages).toHaveLength(1)
    expect(thread().messages[0]!.id).toBe('real-1')
    expect(qc.getQueryData<Conversation[]>(keys.conversations)![0]!.lastMessage?.body).toBe('hello')
  })
  it('Shift+Enter makes a new line and does not send', async () => {
    mount()
    await userEvent.type(screen.getByLabelText('Message Peer Person'), 'a{Shift>}{Enter}{/Shift}b')
    expect((screen.getByLabelText('Message Peer Person') as HTMLTextAreaElement).value).toBe('a\nb')
    expect(request).not.toHaveBeenCalled()
  })
  it('does not send blank messages', async () => {
    mount()
    await userEvent.type(screen.getByLabelText('Message Peer Person'), '   {Enter}')
    expect(request).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Send message') as HTMLButtonElement).disabled).toBe(true)
  })
  it('a failed send stays in the chat marked as failed so it can be retried', async () => {
    request.mockRejectedValue(Object.assign(new Error('offline'), { code: 'x' }))
    mount()
    await userEvent.type(screen.getByLabelText('Message Peer Person'), 'will fail{Enter}')
    await waitFor(() => expect(thread().messages[0]?.status).toBe('failed'))
    expect(thread().messages[0]!.body).toBe('will fail')
  })
  it('keeps a separate draft for every conversation', async () => {
    const first = mount()
    await userEvent.type(screen.getByLabelText('Message Peer Person'), 'draft for one')
    first.unmount()
    mount({ ...conversation, id: 'c2' })
    expect((screen.getByLabelText('Message Peer Person') as HTMLTextAreaElement).value).toBe('')
    cleanup()
    mount()
    expect((screen.getByLabelText('Message Peer Person') as HTMLTextAreaElement).value).toBe('draft for one')
  })
  it('explains why you cannot write when sending is not allowed', () => {
    mount({ ...conversation, canSend: false })
    expect(screen.queryByLabelText('Message Peer Person')).toBeNull()
    expect(screen.getByText(/can't send messages here/i)).toBeTruthy()
  })
})
