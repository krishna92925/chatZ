import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Message } from '@shared/types'
import { MessageBubble, type MessageActions } from './MessageBubble'
import type { ClientMessage } from './cache'

afterEach(cleanup)

const base: Message = {
  id: 'm1', conversationId: 'c', seq: 1, senderId: 'them', kind: 'text', body: 'hello there', attachments: [], replyTo: null,
  reactions: [], editedAt: null, deletedAt: null, createdAt: '2026-03-04T09:05:00', clientId: null,
}
const actions = (): MessageActions => ({ reply: vi.fn(), react: vi.fn(), edit: vi.fn(), remove: vi.fn(), retry: vi.fn(), discard: vi.fn(), openImage: vi.fn(), jumpTo: vi.fn() })
const show = (m: Partial<ClientMessage>, a = actions(), read = false) =>
  render(<MessageBubble msg={{ ...base, ...m }} meId="me" first last read={read} senderName="Aarav" highlighted={false} actions={a} />)

describe('MessageBubble', () => {
  it('shows text and time', () => {
    show({})
    expect(screen.getByText('hello there')).toBeTruthy()
    expect(screen.getByText('09:05')).toBeTruthy()
  })
  it('turns http links into safe links and leaves other schemes as text', () => {
    show({ body: 'open https://example.com/x now, not javascript:alert(1)' })
    const a = screen.getByRole('link') as HTMLAnchorElement
    expect(a.href).toBe('https://example.com/x')
    expect(a.rel).toContain('noopener')
    expect(a.target).toBe('_blank')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
  it('never renders markup from a message as HTML', () => {
    const { container } = show({ body: '<img src=x onerror=alert(1)><b>bold</b>' })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
  it('shows the right delivery state on my messages', () => {
    const a = show({ senderId: 'me' })
    expect(screen.getByLabelText('Sent')).toBeTruthy()
    a.unmount()
    const b = show({ senderId: 'me' }, actions(), true)
    expect(screen.getByLabelText('Read')).toBeTruthy()
    b.unmount()
    show({ senderId: 'me', status: 'failed' })
    expect(screen.getByLabelText('Failed to send')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
  it('retry and discard call back for failed messages', async () => {
    const a = actions()
    show({ senderId: 'me', status: 'failed', clientId: 'cid' }, a)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(a.retry).toHaveBeenCalledOnce()
    expect(a.discard).toHaveBeenCalledOnce()
  })
  it('deleted messages show a placeholder and no actions', () => {
    show({ deletedAt: '2026-03-04T10:00:00Z', body: '' })
    expect(screen.getByText('This message was deleted')).toBeTruthy()
    expect(screen.queryByLabelText('Reply')).toBeNull()
  })
  it('only the author can edit or delete for everyone', async () => {
    show({ senderId: 'them' })
    await userEvent.click(screen.getByLabelText('More'))
    expect(screen.queryByText('Edit')).toBeNull()
    expect(screen.queryByText('Delete for everyone')).toBeNull()
    expect(screen.getByText('Delete for me')).toBeTruthy()
    cleanup()
    show({ senderId: 'me' })
    await userEvent.click(screen.getByLabelText('More'))
    expect(screen.getByText('Edit')).toBeTruthy()
    expect(screen.getByText('Delete for everyone')).toBeTruthy()
  })
  it('reaction chips toggle on click and show counts', async () => {
    const a = actions()
    show({ reactions: [{ emoji: '❤️', userIds: ['me', 'them'] }] }, a)
    await userEvent.click(screen.getByRole('button', { name: /❤️ 2/ }))
    expect(a.react).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), '❤️')
  })
})
