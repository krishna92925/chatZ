import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Archive, BellSlash, Bell, MagnifyingGlass, DotsThreeVertical, ProhibitInset, PushPin, ChatsCircle } from '@phosphor-icons/react'
import type { Attachment, Conversation } from '@shared/types'
import { api, apiMessage } from '@/lib/api'
import { formatLastSeen } from '@/lib/format'
import { request } from '@/lib/socket'
import { useChat } from '@/stores/chat'
import { Avatar } from '@/components/Avatar'
import { Confirm } from '@/components/Confirm'
import { Menu } from '@/components/Menu'
import { EmptyState, IconButton, Skeleton } from '@/components/ui'
import { useProfile } from '@/features/auth/useProfile'
import { deleteMessage, discardFailed, friendlyError, sendMessage, toggleReaction } from './actions'
import type { ClientMessage, Thread } from './cache'
import { ChatSearch } from './ChatSearch'
import { Composer } from './Composer'
import { ImageViewer } from './ImageViewer'
import type { MessageActions } from './MessageBubble'
import { MessageList } from './MessageList'
import { jumpToMessage, keys, useConversations, useConversation, useThread } from './queries'
import { TypingDots } from './TypingDots'
import { usePageActive } from './usePageActive'

export function ChatView() {
  const { id = '' } = useParams()
  const profile = useProfile()
  const meId = profile.id
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const convs = useConversations()
  const conv = useConversation(id)
  const typingIds = useChat((s) => s.typing[id])
  const setReplyTo = useChat((s) => s.setReplyTo)
  const active = usePageActive()
  const [searchOpen, setSearchOpen] = useState(false)
  const [editing, setEditing] = useState<ClientMessage | null>(null)
  const [viewer, setViewer] = useState<number | null>(null)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [focusSeq, setFocusSeq] = useState<number | null>(null)

  const jumpParam = params.get('m')
  useEffect(() => {
    if (!jumpParam || !id) return
    const seq = Number(jumpParam)
    if (!Number.isInteger(seq)) return
    void jumpToMessage(qc, id, seq).then(() => setFocusSeq(seq))
    setParams((p) => {
      p.delete('m')
      return p
    }, { replace: true })
  }, [jumpParam, id, qc, setParams])

  // Opening a chat, and anything arriving while it is open and in view, counts as read.
  const { data: thread } = useThread(id)
  const lastSeq = useMemo(() => {
    const real = (thread?.messages ?? []).filter((m) => m.status === undefined)
    return real.length && !thread?.hasNewer ? real[real.length - 1]!.seq : 0
  }, [thread])
  const unread = conv?.unreadCount ?? 0
  const myRead = conv?.myLastReadSeq ?? 0
  useEffect(() => {
    if (!active || !lastSeq || (unread === 0 && lastSeq <= myRead)) return
    const t = setTimeout(() => {
      qc.setQueryData<Conversation[]>(keys.conversations, (l) => l?.map((c) => (c.id === id ? { ...c, unreadCount: 0, myLastReadSeq: Math.max(c.myLastReadSeq, lastSeq) } : c)))
      void request('conversation:read', { conversationId: id, seq: lastSeq }).catch(() => undefined)
    }, 250)
    return () => clearTimeout(t)
  }, [active, lastSeq, unread, myRead, id, qc])

  const images = useMemo(() => (thread?.messages ?? []).flatMap((m) => (m.deletedAt ? [] : m.attachments.filter((a) => a.kind === 'image'))), [thread])

  const actions = useMemo<MessageActions>(
    () => ({
      reply: (m) => {
        setEditing(null)
        setReplyTo(id, m)
      },
      react: (m, emoji) => void toggleReaction(qc, m, emoji, meId).catch((e) => toast.error(friendlyError(e))),
      edit: (m) => {
        setReplyTo(id, null)
        setEditing(m)
      },
      remove: (m, scope) => void deleteMessage(qc, m, scope).catch((e) => toast.error(friendlyError(e))),
      retry: (m) => {
        if (m.clientId) void sendMessage(qc, meId, { conversationId: id, body: m.body, replyTo: null, attachments: m.attachments, attachmentIds: m.attachments.map((a) => a.id) }, m.clientId).catch((e) => toast.error(friendlyError(e)))
      },
      discard: (m) => discardFailed(qc, id, m),
      openImage: (a: Attachment) => setViewer(Math.max(0, images.findIndex((i) => i.id === a.id))),
      jumpTo: (messageId) => {
        const target = (qc.getQueryData<Thread>(keys.thread(id))?.messages ?? []).find((m) => m.id === messageId)
        if (target) setFocusSeq(target.seq)
        else toast('That message is further back in the chat. Use search to find it.')
      },
    }),
    [qc, id, meId, images, setReplyTo],
  )

  const editLast = useCallback(() => {
    const mine = [...(qc.getQueryData<Thread>(keys.thread(id))?.messages ?? [])].reverse().find((m) => m.senderId === meId && !m.deletedAt && m.status === undefined && m.kind === 'text')
    if (mine) setEditing(mine)
  }, [qc, id, meId])

  async function patch(body: Partial<Pick<Conversation, 'pinned' | 'muted' | 'archived'>>) {
    try {
      const r = await api.patch<Conversation>(`/conversations/${id}`, body)
      qc.setQueryData<Conversation[]>(keys.conversations, (l) => l?.map((c) => (c.id === id ? r.data : c)))
      if (body.archived) void navigate('/chats')
    } catch (e) {
      toast.error(apiMessage(e))
    }
  }

  async function block() {
    try {
      await api.post(`/blocks/${conv!.peer.id}`)
      setConfirmBlock(false)
      void qc.invalidateQueries({ queryKey: keys.conversations })
      void qc.invalidateQueries({ queryKey: keys.friends })
      void qc.invalidateQueries({ queryKey: keys.blocks })
      toast.success(`${conv!.peer.fullName} is blocked. You can undo this in Settings.`)
    } catch (e) {
      toast.error(apiMessage(e))
    }
  }

  if (convs.isPending) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-line px-4">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    )
  }
  if (!conv) {
    return (
      <div className="grid flex-1 place-items-center">
        <EmptyState icon={<ChatsCircle size={28} />} title="Conversation not found" action={<Link to="/chats" className="font-semibold text-accent-text">Back to chats</Link>}>
          It may have been removed, or you may not be part of it.
        </EmptyState>
      </div>
    )
  }

  const peer = conv.peer
  const typing = (typingIds ?? []).length > 0
  const status = typing ? null : peer.online ? 'Online' : formatLastSeen(peer.lastSeenAt)

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-app" aria-label={`Chat with ${peer.fullName}`}>
      <header className="pt-safe flex h-16 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 sm:px-4">
        <Link to="/chats" aria-label="Back to chats" className="grid size-10 place-items-center rounded-full text-muted hover:bg-hover md:hidden">
          <ArrowLeft size={22} />
        </Link>
        <Avatar name={peer.fullName} src={peer.avatarUrl} size={42} online={peer.online} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{peer.fullName}</h1>
          <p className="truncate text-[13px]" aria-live="polite">
            {typing ? (
              <span className="inline-flex items-center gap-1.5 text-accent-text">
                typing <TypingDots />
              </span>
            ) : (
              <span className={peer.online ? 'text-online' : 'text-muted'}>{status}</span>
            )}
            {!typing && <span className="text-muted"> · @{peer.username}</span>}
          </p>
        </div>
        <IconButton label="Search in chat (Ctrl+Shift+F)" active={searchOpen} onClick={() => setSearchOpen((o) => !o)}>
          <MagnifyingGlass size={21} />
        </IconButton>
        <Menu
          label="Chat options"
          trigger={
            <span className="grid size-10 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg">
              <DotsThreeVertical size={22} weight="bold" />
            </span>
          }
          items={[
            { label: conv.pinned ? 'Unpin chat' : 'Pin chat', icon: <PushPin size={17} />, onSelect: () => void patch({ pinned: !conv.pinned }) },
            { label: conv.muted ? 'Unmute notifications' : 'Mute notifications', icon: conv.muted ? <Bell size={17} /> : <BellSlash size={17} />, onSelect: () => void patch({ muted: !conv.muted }) },
            { label: conv.archived ? 'Unarchive chat' : 'Archive chat', icon: <Archive size={17} />, onSelect: () => void patch({ archived: !conv.archived }) },
            { label: `Block ${peer.fullName.split(' ')[0]}`, icon: <ProhibitInset size={17} />, danger: true, onSelect: () => setConfirmBlock(true) },
          ]}
        />
      </header>

      {searchOpen && (
        <ChatSearch
          conversationId={id}
          onClose={() => setSearchOpen(false)}
          onPick={(seq) => {
            void jumpToMessage(qc, id, seq).then(() => setFocusSeq(seq))
          }}
        />
      )}

      <MessageList conversation={conv} meId={meId} actions={actions} focusSeq={focusSeq} onFocused={() => setFocusSeq(null)} />

      <Composer key={`${id}:${editing?.id ?? ''}`} conversation={conv} meId={meId} editing={editing} onStopEditing={() => setEditing(null)} onEditLast={editLast} />

      <ImageViewer images={images} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      <Confirm open={confirmBlock} title={`Block ${peer.fullName}?`} message="They won't be able to message you or send you friend requests, and you'll stop being friends. You can unblock them in Settings." confirmLabel="Block" danger onConfirm={() => void block()} onClose={() => setConfirmBlock(false)} />
    </section>
  )
}
