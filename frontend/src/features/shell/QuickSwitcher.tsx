import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChatCircleText, MagnifyingGlass, UserPlus } from '@phosphor-icons/react'
import type { Conversation, SearchMessageHit, UserCard } from '@shared/types'
import { api, apiMessage } from '@/lib/api'
import { formatListTime, previewText } from '@/lib/format'
import { Avatar } from '@/components/Avatar'
import { Modal } from '@/components/Modal'
import { Spinner } from '@/components/ui'
import { useDebounced } from '@/lib/useDebounced'
import { keys, useConversations } from '@/features/chat/queries'

interface Row {
  key: string
  group: 'Chats' | 'People' | 'Messages'
  avatar: { name: string; src: string | null }
  title: string
  subtitle: string
  hint?: string
  run: () => void | Promise<void>
}

function Inner({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const convs = useConversations()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const term = useDebounced(q.trim().replace(/^@/, ''), 250)
  const searching = term.length >= 2

  const people = useQuery({ queryKey: ['people', term], enabled: searching, staleTime: 20_000, queryFn: async () => (await api.get<UserCard[]>('/users/search', { params: { q: term } })).data })
  const messages = useQuery({ queryKey: ['msgsearch', term], enabled: searching, staleTime: 20_000, queryFn: async () => (await api.get<SearchMessageHit[]>('/search/messages', { params: { q: term } })).data })

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const needle = q.trim().toLowerCase().replace(/^@/, '')
    const chats = (convs.data ?? []).filter((c) => !needle || c.peer.fullName.toLowerCase().includes(needle) || c.peer.username.includes(needle)).slice(0, needle ? 6 : 8)
    for (const c of chats) {
      out.push({ key: `c-${c.id}`, group: 'Chats', avatar: { name: c.peer.fullName, src: c.peer.avatarUrl }, title: c.peer.fullName, subtitle: `@${c.peer.username}`, run: () => void navigate(`/chats/${c.id}`) })
    }
    const inChats = new Set((convs.data ?? []).map((c) => c.peer.id))
    for (const u of people.data ?? []) {
      if (inChats.has(u.id) && u.relation === 'friends') continue
      const chatNow = u.relation === 'friends' || u.canMessage
      out.push({
        key: `u-${u.id}`,
        group: 'People',
        avatar: { name: u.fullName, src: u.avatarUrl },
        title: u.fullName,
        subtitle: `@${u.username}`,
        hint: chatNow ? 'Message' : u.relation === 'request_sent' ? 'Request sent' : u.relation === 'blocked' ? 'Blocked' : u.relation === 'request_received' ? 'Accept in Friends' : 'Add friend',
        run: async () => {
          try {
            if (chatNow) {
              const r = await api.post<Conversation>('/conversations/direct', { userId: u.id })
              void qc.invalidateQueries({ queryKey: keys.conversations })
              void navigate(`/chats/${r.data.id}`)
            } else if (u.relation === 'none') {
              const r = await api.post<{ status: string; conversationId?: string }>('/friends/requests', { userId: u.id })
              toast.success(r.data.status === 'accepted' ? `You and ${u.fullName} are now friends` : `Friend request sent to ${u.fullName}`)
              void qc.invalidateQueries({ queryKey: keys.requests })
              void qc.invalidateQueries({ queryKey: keys.conversations })
              void qc.invalidateQueries({ queryKey: keys.friends })
            } else if (u.relation === 'request_received') void navigate('/friends?tab=requests')
          } catch (e) {
            toast.error(apiMessage(e))
          }
        },
      })
    }
    for (const h of messages.data ?? []) {
      out.push({
        key: `m-${h.message.id}`,
        group: 'Messages',
        avatar: { name: h.peer.fullName, src: h.peer.avatarUrl },
        title: h.peer.fullName,
        subtitle: previewText(h.message.kind, h.message.body, false),
        hint: formatListTime(h.message.createdAt),
        run: () => void navigate(`/chats/${h.conversationId}?m=${h.message.seq}`),
      })
    }
    return out
  }, [convs.data, people.data, messages.data, q, navigate, qc])

  const index = Math.min(active, Math.max(0, rows.length - 1))
  const loading = searching && (people.isFetching || messages.isFetching)

  async function choose(r: Row | undefined) {
    if (!r) return
    onClose()
    await r.run()
  }

  let lastGroup = ''
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line px-4">
        <MagnifyingGlass size={20} className="shrink-0 text-muted" />
        <input
          data-autofocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive(Math.min(index + 1, rows.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive(Math.max(index - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              void choose(rows[index])
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="switcher-list"
          aria-label="Search people, chats and messages"
          placeholder="Search by name, @username or message"
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-fg placeholder:text-muted/70 focus:outline-none"
        />
        {loading && <Spinner size={16} className="text-muted" />}
      </div>
      <ul id="switcher-list" role="listbox" className="max-h-[55dvh] overflow-y-auto p-2">
        {rows.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-muted">{searching ? (loading ? 'Searching…' : 'Nobody or nothing matches that.') : 'Type at least 2 letters to find people and messages.'}</li>
        )}
        {rows.map((r, i) => {
          const header = r.group !== lastGroup
          lastGroup = r.group
          return (
            <li key={r.key} role="presentation">
              {header && <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted">{r.group}</p>}
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                onMouseMove={() => setActive(i)}
                onClick={() => void choose(r)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${i === index ? 'bg-raised' : ''}`}
              >
                <Avatar name={r.avatar.name} src={r.avatar.src} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className="block truncate text-sm text-muted">{r.subtitle}</span>
                </span>
                {r.hint && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-accent-text">
                    {r.group === 'People' && (r.hint === 'Add friend' ? <UserPlus size={14} /> : r.hint === 'Message' ? <ChatCircleText size={14} /> : null)}
                    {r.hint}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="hidden border-t border-line px-4 py-2 text-xs text-muted sm:block">↑↓ to move · Enter to open · Esc to close</p>
    </div>
  )
}

export function QuickSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} bare size="lg">
      {open && <Inner onClose={onClose} />}
    </Modal>
  )
}
