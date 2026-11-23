import { memo, useMemo, useState } from 'react'
import { NavLink } from 'react-router'
import { BellSlash, ChatsCircle, MagnifyingGlass, PencilSimpleLine, PushPin } from '@phosphor-icons/react'
import type { Conversation } from '@shared/types'
import { cn, formatListTime, previewText } from '@/lib/format'
import { useChat } from '@/stores/chat'
import { Avatar } from '@/components/Avatar'
import { EmptyState, IconButton, Skeleton } from '@/components/ui'
import { useConversations } from './queries'
import { TypingDots } from './TypingDots'

type Filter = 'all' | 'unread' | 'archived'

const Item = memo(function Item({ c, meId, typing }: { c: Conversation; meId: string; typing: boolean }) {
  const last = c.lastMessage
  const mine = last?.senderId === meId
  const text = last ? previewText(last.kind, last.body, last.deleted) : 'No messages yet'
  return (
    <NavLink
      to={`/chats/${c.id}`}
      className={({ isActive }) => cn('mx-2 flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors', isActive ? 'bg-raised' : 'hover:bg-hover')}
    >
      <Avatar name={c.peer.fullName} src={c.peer.avatarUrl} size={48} online={c.peer.online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate', c.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>{c.peer.fullName}</span>
          <span className={cn('shrink-0 text-xs', c.unreadCount > 0 ? 'text-accent-text' : 'text-muted')}>{c.lastMessageAt ? formatListTime(c.lastMessageAt) : ''}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={cn('flex min-w-0 items-center gap-1 truncate text-sm', typing ? 'text-accent-text' : c.unreadCount > 0 ? 'text-fg' : 'text-muted')}>
            {typing ? (
              <>
                typing <TypingDots />
              </>
            ) : (
              <span className="truncate">{mine && last && !last.deleted ? `You: ${text}` : text}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-muted">
            {c.muted && <BellSlash size={14} aria-label="Muted" />}
            {c.pinned && <PushPin size={14} weight="fill" aria-label="Pinned" />}
            {c.unreadCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold text-on-accent" aria-label={`${c.unreadCount} unread`}>
                {c.unreadCount > 99 ? '99+' : c.unreadCount}
              </span>
            )}
          </span>
        </div>
      </div>
    </NavLink>
  )
})

export function ConversationList({ meId, onNew }: { meId: string; onNew: () => void }) {
  const { data, isPending, isError, refetch } = useConversations()
  const typing = useChat((s) => s.typing)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data ?? []).filter((c) => {
      if (filter === 'archived' ? !c.archived : c.archived) return false
      if (filter === 'unread' && c.unreadCount === 0) return false
      return !term || c.peer.fullName.toLowerCase().includes(term) || c.peer.username.includes(term.replace(/^@/, ''))
    })
  }, [data, q, filter])

  const archivedCount = (data ?? []).filter((c) => c.archived).length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="pt-safe px-4 pt-4 pb-2">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Chats</h1>
          <IconButton label="New chat (Ctrl+K)" onClick={onNew}>
            <PencilSimpleLine size={22} />
          </IconButton>
        </div>
        <div className="relative">
          <MagnifyingGlass size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-10 w-full rounded-full border border-line bg-raised pr-4 pl-10 text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none"
          />
        </div>
        <div className="mt-3 flex gap-1.5" role="tablist" aria-label="Filter chats">
          {(['all', 'unread', 'archived'] as const).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn('rounded-full px-3.5 py-1 text-[13px] font-medium capitalize transition-colors', filter === f ? 'bg-accent text-on-accent' : 'text-muted hover:bg-hover hover:text-fg')}
            >
              {f}
              {f === 'archived' && archivedCount > 0 ? ` ${archivedCount}` : ''}
            </button>
          ))}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto pb-3" aria-label="Conversations">
        {isPending &&
          Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="mx-2 flex items-center gap-3 px-3 py-2.5" aria-hidden>
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        {isError && (
          <EmptyState icon={<ChatsCircle size={28} />} title="Could not load chats" action={<button className="font-semibold text-accent-text" onClick={() => void refetch()}>Try again</button>}>
            Check your connection.
          </EmptyState>
        )}
        {!isPending && !isError && shown.length === 0 && (
          <EmptyState
            icon={<ChatsCircle size={28} weight="duotone" />}
            title={q ? 'No matching chats' : filter === 'unread' ? 'Nothing unread' : filter === 'archived' ? 'No archived chats' : 'No chats yet'}
            action={!q && filter === 'all' ? <button className="font-semibold text-accent-text" onClick={onNew}>Find someone to message</button> : undefined}
          >
            {q ? 'Try a different name.' : filter === 'all' ? 'Add friends with a username or connect code, then start talking.' : 'You are all caught up.'}
          </EmptyState>
        )}
        {shown.map((c) => (
          <Item key={c.id} c={c} meId={meId} typing={(typing[c.id] ?? []).length > 0} />
        ))}
      </nav>
    </div>
  )
}
