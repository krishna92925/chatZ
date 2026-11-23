import { useEffect, useRef } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Conversation, PublicUser } from '@shared/types'
import { connectSocket, disconnectSocket, useSocket } from '@/lib/socket'
import { supabase } from '@/lib/supabase'
import { playPing, showDesktopNotification } from '@/lib/notify'
import { previewText } from '@/lib/format'
import { useChat } from '@/stores/chat'
import { useUi } from '@/stores/ui'
import { applyMessageToConversations, applyUpdateToPreview, removeMessage, setReactions, upsertMessage, type Thread } from './cache'
import { keys } from './queries'

/** Opens the socket for the signed-in user and keeps every cache in sync with what the server pushes. */
export function useRealtime(meId: string) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const socket = useSocket()
  const openId = useRef<string | null>(null)

  useEffect(() => {
    openId.current = matchPath('/chats/:id', location.pathname)?.params.id ?? null
  }, [location.pathname])

  useEffect(() => {
    connectSocket()
    return () => disconnectSocket()
  }, [])

  useEffect(() => {
    if (!socket) return
    const chat = useChat.getState()
    let wasConnected = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const onConnect = () => {
      chat.setConnection('online')
      if (wasConnected) {
        // anything pushed while we were away is missed: pull fresh state
        void qc.invalidateQueries({ queryKey: keys.conversations })
        void qc.invalidateQueries({ queryKey: ['thread'] })
        void qc.invalidateQueries({ queryKey: keys.friends })
        void qc.invalidateQueries({ queryKey: keys.requests })
      }
      wasConnected = true
    }
    const onDisconnect = () => chat.setConnection('offline')
    const onConnectError = async () => {
      chat.setConnection('offline')
      // the server refuses expired tokens and does not retry by itself: refresh the session, then connect again
      if (!socket.active) {
        await supabase.auth.refreshSession().catch(() => undefined)
        retryTimer = setTimeout(() => socket.connect(), 2500)
      }
    }
    const onAttempt = () => chat.setConnection('connecting')

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.io.on('reconnect_attempt', onAttempt)
    if (socket.connected) onConnect()

    socket.on('message:new', ({ message }) => {
      qc.setQueryData<Thread>(keys.thread(message.conversationId), (t) => (t && !t.hasNewer ? { ...t, messages: upsertMessage(t.messages, message) } : t))
      useChat.getState().clearTyping(message.conversationId, message.senderId)
      const viewing = openId.current === message.conversationId && document.visibilityState === 'visible' && document.hasFocus()
      const list = qc.getQueryData<Conversation[]>(keys.conversations)
      const next = list ? applyMessageToConversations(list, message, meId, viewing) : null
      if (next) qc.setQueryData(keys.conversations, next)
      else void qc.invalidateQueries({ queryKey: keys.conversations })
      const conv = list?.find((c) => c.id === message.conversationId)
      if (message.senderId !== meId && !viewing && !conv?.muted) {
        const ui = useUi.getState()
        if (ui.sound) playPing()
        if (ui.desktopNotifications && document.visibilityState === 'hidden') {
          showDesktopNotification(
            conv?.peer.fullName ?? 'New message',
            previewText(message.kind, message.body, false),
            () => void navigate(`/chats/${message.conversationId}`),
            message.conversationId,
          )
        }
      }
    })

    socket.on('message:updated', ({ message }) => {
      qc.setQueryData<Thread>(keys.thread(message.conversationId), (t) => (t ? { ...t, messages: upsertMessage(t.messages, message) } : t))
      qc.setQueryData<Conversation[]>(keys.conversations, (l) => (l ? applyUpdateToPreview(l, message) : l))
    })
    socket.on('message:hidden', ({ conversationId, messageId }) => {
      qc.setQueryData<Thread>(keys.thread(conversationId), (t) => (t ? { ...t, messages: removeMessage(t.messages, messageId) } : t))
    })
    socket.on('reaction:updated', ({ conversationId, messageId, reactions }) => {
      qc.setQueryData<Thread>(keys.thread(conversationId), (t) => (t ? { ...t, messages: setReactions(t.messages, messageId, reactions) } : t))
    })
    socket.on('receipt:updated', ({ conversationId, userId, lastReadSeq }) => {
      qc.setQueryData<Conversation[]>(keys.conversations, (l) =>
        l?.map((c) => {
          if (c.id !== conversationId) return c
          if (userId === meId) return { ...c, unreadCount: 0, myLastReadSeq: Math.max(c.myLastReadSeq, lastReadSeq) }
          return c.peerLastReadSeq === null ? c : { ...c, peerLastReadSeq: Math.max(c.peerLastReadSeq, lastReadSeq) }
        }),
      )
    })
    socket.on('typing', ({ conversationId, userId, isTyping }) => useChat.getState().setTyping(conversationId, userId, isTyping))
    socket.on('presence:update', ({ userId, online, lastSeenAt }) => {
      const patch = (u: PublicUser) => (u.id === userId ? { ...u, online, lastSeenAt } : u)
      qc.setQueryData<Conversation[]>(keys.conversations, (l) => l?.map((c) => (c.peer.id === userId ? { ...c, peer: patch(c.peer) } : c)))
      qc.setQueryData<PublicUser[]>(keys.friends, (l) => l?.map(patch))
    })
    socket.on('friend:request', ({ request }) => {
      void qc.invalidateQueries({ queryKey: keys.requests })
      toast(`${request.user.fullName} (@${request.user.username}) sent you a friend request`, { action: { label: 'View', onClick: () => void navigate('/friends?tab=requests') } })
    })
    socket.on('friend:accepted', ({ user, conversationId }) => {
      void qc.invalidateQueries({ queryKey: keys.friends })
      void qc.invalidateQueries({ queryKey: keys.requests })
      void qc.invalidateQueries({ queryKey: keys.conversations })
      toast.success(`You and ${user.fullName} are now friends`, { action: { label: 'Say hi', onClick: () => void navigate(`/chats/${conversationId}`) } })
    })
    socket.on('friend:removed', () => {
      void qc.invalidateQueries({ queryKey: keys.friends })
      void qc.invalidateQueries({ queryKey: keys.requests })
      void qc.invalidateQueries({ queryKey: keys.conversations })
    })
    socket.on('conversation:updated', () => void qc.invalidateQueries({ queryKey: keys.conversations }))

    return () => {
      clearTimeout(retryTimer)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.io.off('reconnect_attempt', onAttempt)
      socket.off('message:new')
      socket.off('message:updated')
      socket.off('message:hidden')
      socket.off('reaction:updated')
      socket.off('receipt:updated')
      socket.off('typing')
      socket.off('presence:update')
      socket.off('friend:request')
      socket.off('friend:accepted')
      socket.off('friend:removed')
      socket.off('conversation:updated')
    }
  }, [socket, meId, qc, navigate])
}
