import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ChatsCircle } from '@phosphor-icons/react'
import type { Conversation } from '@shared/types'
import { formatDayLabel, sameDay } from '@/lib/format'
import { EmptyState, Skeleton, Spinner } from '@/components/ui'
import { loadNewer, loadOlder, resetThread, useThread } from './queries'
import { MessageBubble, type MessageActions } from './MessageBubble'
import { TypingDots } from './TypingDots'
import { useChat } from '@/stores/chat'

interface Props {
  conversation: Conversation
  meId: string
  actions: MessageActions
  focusSeq: number | null
  onFocused: () => void
}

const NEAR_BOTTOM = 160

export function MessageList({ conversation, meId, actions, focusSeq, onFocused }: Props) {
  const id = conversation.id
  const qc = useQueryClient()
  const { data: thread, isPending, isError, refetch } = useThread(id)
  const scroller = useRef<HTMLDivElement>(null)
  const topSentinel = useRef<HTMLDivElement>(null)
  const bottomSentinel = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prev = useRef<{ id: string; firstId?: string; lastId?: string; len: number; height: number }>({ id: '', len: 0, height: 0 })
  const loadingOlder = useRef(false)
  const [atBottom, setAtBottom] = useState(true)
  const [flash, setFlash] = useState<number | null>(null)
  const typingIds = useChat((s) => s.typing[id])
  const peerTyping = (typingIds ?? []).length > 0

  const messages = thread?.messages
  const rows = useMemo(() => {
    const out: Array<{ kind: 'day'; key: string; label: string } | { kind: 'msg'; key: string; index: number; first: boolean; last: boolean }> = []
    ;(messages ?? []).forEach((m, i, arr) => {
      const before = arr[i - 1]
      const after = arr[i + 1]
      if (!before || !sameDay(before.createdAt, m.createdAt)) out.push({ kind: 'day', key: `d-${m.id}`, label: formatDayLabel(m.createdAt) })
      const sameRunBefore = before && sameDay(before.createdAt, m.createdAt) && before.senderId === m.senderId && new Date(m.createdAt).getTime() - new Date(before.createdAt).getTime() < 5 * 60_000
      const sameRunAfter = after && sameDay(after.createdAt, m.createdAt) && after.senderId === m.senderId && new Date(after.createdAt).getTime() - new Date(m.createdAt).getTime() < 5 * 60_000
      out.push({ kind: 'msg', key: m.id, index: i, first: !sameRunBefore, last: !sameRunAfter })
    })
    return out
  }, [messages])

  // Keep the view where the reader expects it: bottom on open and when they are at the bottom, stable when older pages load.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !messages) return
    const p = prev.current
    const first = messages[0]?.id
    const last = messages[messages.length - 1]
    if (p.id !== id) {
      el.scrollTop = el.scrollHeight
      stick.current = true
    } else if (messages.length > p.len && first !== p.firstId && last?.id === p.lastId) {
      el.scrollTop += el.scrollHeight - p.height
    } else if (last?.id !== p.lastId && (stick.current || last?.senderId === meId)) {
      el.scrollTo({ top: el.scrollHeight, behavior: p.len ? 'smooth' : 'auto' })
    }
    prev.current = { id, firstId: first, lastId: last?.id, len: messages.length, height: el.scrollHeight }
  }, [messages, id, meId])

  // Jump to a message from search or a reply preview.
  useEffect(() => {
    if (focusSeq === null || !messages) return
    const target = scroller.current?.querySelector<HTMLElement>(`[data-seq="${focusSeq}"]`)
    if (!target) return
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    stick.current = false
    const t1 = setTimeout(() => setFlash(focusSeq), 0)
    const t2 = setTimeout(() => {
      setFlash(null)
      onFocused()
    }, 2200)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [focusSeq, messages, onFocused])

  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM
    stick.current = near
    setAtBottom((v) => (v === near ? v : near))
  }, [])

  useEffect(() => {
    const el = topSentinel.current
    const root = scroller.current
    if (!el || !root || !thread?.hasMore) return
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry?.isIntersecting || loadingOlder.current) return
        loadingOlder.current = true
        try {
          await loadOlder(qc, id)
        } finally {
          loadingOlder.current = false
        }
      },
      { root, rootMargin: '300px 0px 0px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [thread?.hasMore, thread?.messages.length, id, qc])

  useEffect(() => {
    const el = bottomSentinel.current
    const root = scroller.current
    if (!el || !root || !thread?.hasNewer) return
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && void loadNewer(qc, id), { root, rootMargin: '0px 0px 300px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [thread?.hasNewer, thread?.messages.length, id, qc])

  function jumpToLatest() {
    if (thread?.hasNewer) void resetThread(qc, id)
    else scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }

  if (isPending) {
    return (
      <div className="flex flex-1 flex-col justify-end gap-3 p-5" aria-busy="true" aria-label="Loading messages">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={i % 2 ? 'flex justify-end' : 'flex'}>
            <Skeleton className="h-11 w-2/5 rounded-2xl" />
          </div>
        ))}
      </div>
    )
  }
  if (isError) {
    return (
      <div className="grid flex-1 place-items-center">
        <EmptyState icon={<ChatsCircle size={28} />} title="Could not load messages" action={<button className="font-semibold text-accent-text" onClick={() => void refetch()}>Try again</button>}>
          Check your connection.
        </EmptyState>
      </div>
    )
  }

  const readSeq = conversation.peerLastReadSeq

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain py-3" role="log" aria-live="polite" aria-label="Messages">
        <div ref={topSentinel} className="h-px" />
        {thread?.hasMore && (
          <div className="grid place-items-center py-3 text-muted">
            <Spinner size={18} />
          </div>
        )}
        {!thread?.hasMore && (messages?.length ?? 0) === 0 && (
          <EmptyState icon={<ChatsCircle size={28} weight="duotone" />} title={`Say hi to ${conversation.peer.fullName.split(' ')[0]}`}>
            Messages you send here are only visible to the two of you.
          </EmptyState>
        )}
        {rows.map((r) =>
          r.kind === 'day' ? (
            <div key={r.key} className="my-4 flex justify-center">
              <span className="rounded-full bg-panel px-3 py-1 text-xs text-muted">{r.label}</span>
            </div>
          ) : (
            <MessageBubble
              key={r.key}
              msg={messages![r.index]!}
              meId={meId}
              first={r.first}
              last={r.last}
              read={readSeq !== null && messages![r.index]!.seq <= readSeq}
              senderName={conversation.peer.fullName}
              highlighted={flash === messages![r.index]!.seq}
              actions={actions}
            />
          ),
        )}
        {peerTyping && (
          <div className="mt-2 flex px-3 sm:px-5" aria-live="polite">
            <span className="inline-flex items-center gap-2 rounded-full bg-them px-3.5 py-2 text-on-them">
              <TypingDots />
              <span className="sr-only">{conversation.peer.fullName} is typing</span>
            </span>
          </div>
        )}
        <div ref={bottomSentinel} className="h-px" />
      </div>
      {(!atBottom || thread?.hasNewer) && (
        <button type="button" onClick={jumpToLatest} className="absolute right-4 bottom-4 grid size-11 place-items-center rounded-full border border-line bg-panel text-fg shadow-lg hover:bg-raised" aria-label="Jump to latest message">
          <ArrowDown size={18} weight="bold" />
        </button>
      )}
    </div>
  )
}

