import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import type { SearchMessageHit } from '@shared/types'
import { api } from '@/lib/api'
import { formatListTime } from '@/lib/format'
import { useDebounced } from '@/lib/useDebounced'
import { IconButton, Spinner } from '@/components/ui'

/** Search inside one conversation. Picking a result jumps to that message. */
export function ChatSearch({ conversationId, onPick, onClose }: { conversationId: string; onPick: (seq: number) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim(), 300)
  const { data, isFetching } = useQuery({
    queryKey: ['search', conversationId, term],
    enabled: term.length >= 2,
    queryFn: async () => (await api.get<SearchMessageHit[]>('/search/messages', { params: { q: term, conversationId } })).data,
    staleTime: 30_000,
  })
  return (
    <div className="border-b border-line bg-panel">
      <div className="flex items-center gap-2 px-3 py-2">
        <MagnifyingGlass size={18} className="shrink-0 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder="Search in this chat"
          aria-label="Search in this chat"
          className="h-9 min-w-0 flex-1 bg-transparent text-fg placeholder:text-muted/70 focus:outline-none"
        />
        {isFetching && <Spinner size={16} className="text-muted" />}
        <IconButton label="Close search" size={32} onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      {term.length >= 2 && !isFetching && data && (
        <ul className="max-h-60 overflow-y-auto border-t border-line">
          {data.length === 0 && <li className="px-4 py-3 text-sm text-muted">No messages found.</li>}
          {data.map((h) => (
            <li key={h.message.id}>
              <button type="button" onClick={() => onPick(h.message.seq)} className="block w-full px-4 py-2.5 text-left hover:bg-hover">
                <span className="flex justify-between gap-3 text-xs text-muted">
                  <span>{h.message.senderId === h.peer.id ? h.peer.fullName : 'You'}</span>
                  <span>{formatListTime(h.message.createdAt)}</span>
                </span>
                <span className="line-clamp-2 text-sm">{h.message.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
