import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, File as FileIcon, PaperPlaneRight, Paperclip, Smiley, WarningCircle, X } from '@phosphor-icons/react'
import { MAX_ATTACHMENTS, MAX_BODY_LENGTH, MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from '@shared/constants'
import type { Attachment, Conversation, UploadResult } from '@shared/types'
import { api, apiMessage } from '@/lib/api'
import { cn, formatBytes, previewText } from '@/lib/format'
import { getSocket } from '@/lib/socket'
import { useChat } from '@/stores/chat'
import { IconButton, Spinner } from '@/components/ui'
import { editMessage, friendlyError, sendMessage } from './actions'
import type { ClientMessage } from './cache'
import { EmojiPicker } from './EmojiPicker'

interface Pending {
  key: string
  file: File
  preview: string | null
  progress: number
  status: 'uploading' | 'done' | 'error'
  upload?: UploadResult
  error?: string
}

interface Props {
  conversation: Conversation
  meId: string
  editing: ClientMessage | null
  onStopEditing: () => void
  onEditLast: () => void
}

const limitFor = (f: File) => (f.type.startsWith('image/') ? MAX_IMAGE_BYTES : f.type.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_FILE_BYTES)
const coarse = () => window.matchMedia('(pointer: coarse)').matches

export function Composer({ conversation, meId, editing, onStopEditing, onEditLast }: Props) {
  const id = conversation.id
  const qc = useQueryClient()
  const draft = useChat((s) => s.drafts[id] ?? '')
  const replyTo = useChat((s) => s.replyTo[id] ?? null)
  const setDraft = useChat((s) => s.setDraft)
  const setReplyTo = useChat((s) => s.setReplyTo)
  const [editText, setEditText] = useState(editing?.body ?? '')
  const [pending, setPending] = useState<Pending[]>([])
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const files = useRef<HTMLInputElement>(null)
  const aborts = useRef(new Map<string, AbortController>())
  const typing = useRef({ on: false, timer: undefined as ReturnType<typeof setTimeout> | undefined })

  const text = editing ? editText : draft
  const setText = (v: string) => (editing ? setEditText(v) : setDraft(id, v))

  const emitTyping = useCallback(
    (on: boolean) => {
      const t = typing.current
      clearTimeout(t.timer)
      if (on) t.timer = setTimeout(() => emitTyping(false), 3000)
      if (t.on === on) return
      t.on = on
      getSocket()?.emit('typing', { conversationId: id, isTyping: on })
    },
    [id],
  )

  useEffect(
    () => () => {
      emitTyping(false)
      aborts.current.forEach((a) => a.abort())
    },
    [emitTyping],
  )

  useEffect(() => {
    resize()
    // on phones focusing would pop the keyboard up every time a chat opens
    if (!coarse() || editing) area.current?.focus({ preventScroll: true })
  }, [id, editing])

  function resize() {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }

  function addFiles(list: File[]) {
    if (!list.length) return
    const room = MAX_ATTACHMENTS - pending.length
    if (room <= 0) return void toast.error(`You can attach up to ${MAX_ATTACHMENTS} files at once.`)
    for (const file of list.slice(0, room)) {
      if (file.size === 0) {
        toast.error(`${file.name} is empty.`)
        continue
      }
      if (file.size > limitFor(file)) {
        toast.error(`${file.name} is ${formatBytes(file.size)}. The limit for this type is ${formatBytes(limitFor(file))}.`)
        continue
      }
      const key = crypto.randomUUID()
      const item: Pending = { key, file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null, progress: 0, status: 'uploading' }
      setPending((p) => [...p, item])
      const ctrl = new AbortController()
      aborts.current.set(key, ctrl)
      const fd = new FormData()
      fd.append('file', file)
      api
        .post<UploadResult>('/uploads', fd, { signal: ctrl.signal, timeout: 5 * 60_000, onUploadProgress: (e) => setPending((p) => p.map((x) => (x.key === key ? { ...x, progress: e.total ? e.loaded / e.total : 0 } : x))) })
        .then((r) => setPending((p) => p.map((x) => (x.key === key ? { ...x, status: 'done', progress: 1, upload: r.data } : x))))
        .catch((err) => {
          if (ctrl.signal.aborted) return
          setPending((p) => p.map((x) => (x.key === key ? { ...x, status: 'error', error: apiMessage(err, 'Upload failed') } : x)))
        })
        .finally(() => aborts.current.delete(key))
    }
    if (list.length > room) toast.error(`Only ${MAX_ATTACHMENTS} files fit in one message.`)
  }

  function removePending(key: string) {
    aborts.current.get(key)?.abort()
    setPending((p) => {
      const gone = p.find((x) => x.key === key)
      if (gone?.preview) URL.revokeObjectURL(gone.preview)
      return p.filter((x) => x.key !== key)
    })
  }

  const uploading = pending.some((p) => p.status === 'uploading')
  const ready = pending.filter((p) => p.status === 'done' && p.upload)
  const canSend = !busy && !uploading && (editing ? text.trim().length > 0 : text.trim().length > 0 || ready.length > 0) && text.length <= MAX_BODY_LENGTH

  async function submit() {
    if (!canSend) return
    emitTyping(false)
    if (editing) {
      setBusy(true)
      try {
        if (text.trim() !== editing.body) await editMessage(qc, id, editing.id, text.trim())
        onStopEditing()
      } catch (err) {
        toast.error(friendlyError(err))
      } finally {
        setBusy(false)
      }
      return
    }
    const attachments: Attachment[] = ready.map((p) => ({ ...p.upload!, url: p.preview ?? '' }))
    const input = { conversationId: id, body: text.trim(), replyTo, attachments, attachmentIds: ready.map((p) => p.upload!.id) }
    setDraft(id, '')
    setReplyTo(id, null)
    setPending([])
    requestAnimationFrame(resize)
    sendMessage(qc, meId, input)
      .catch((err) => toast.error(friendlyError(err)))
      .finally(() => ready.forEach((p) => p.preview && setTimeout(() => URL.revokeObjectURL(p.preview!), 15_000)))
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !coarse()) {
      e.preventDefault()
      void submit()
    } else if (e.key === 'Escape') {
      if (editing) onStopEditing()
      else if (replyTo) setReplyTo(id, null)
    } else if (e.key === 'ArrowUp' && !text && !editing) {
      e.preventDefault()
      onEditLast()
    }
  }

  function onPaste(e: ClipboardEvent) {
    const list = [...e.clipboardData.files]
    if (list.length) {
      e.preventDefault()
      addFiles(list)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles([...e.dataTransfer.files])
  }

  function insertEmoji(emoji: string) {
    const el = area.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    setText(text.slice(0, start) + emoji + text.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  if (!conversation.canSend) {
    return (
      <div className="pb-safe border-t border-line bg-panel px-4 py-4 text-center text-sm text-muted">
        <WarningCircle size={18} className="mr-1.5 inline -translate-y-px" />
        You can't send messages here. The other person only accepts messages from friends, or one of you blocked the other.
      </div>
    )
  }

  return (
    <div
      className={cn('pb-safe relative border-t border-line bg-panel px-3 pt-2.5 sm:px-4', dragging && 'ring-2 ring-accent ring-inset')}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {editing && (
        <div className="mb-2 flex items-center justify-between rounded-xl bg-raised px-3 py-2 text-sm">
          <span className="font-medium text-accent-text">Editing message</span>
          <IconButton label="Cancel editing" size={28} onClick={onStopEditing}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {replyTo && !editing && (
        <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border-l-[3px] border-accent bg-raised px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium text-accent-text">Replying to {replyTo.senderId === meId ? 'yourself' : conversation.peer.fullName}</p>
            <p className="truncate text-muted">{previewText(replyTo.kind, replyTo.body, false)}</p>
          </div>
          <IconButton label="Cancel reply" size={28} onClick={() => setReplyTo(id, null)}>
            <X size={16} />
          </IconButton>
        </div>
      )}

      {pending.length > 0 && !editing && (
        <ul className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="Attachments">
          {pending.map((p) => (
            <li key={p.key} className={cn('relative flex h-16 shrink-0 items-center gap-2 overflow-hidden rounded-xl border bg-raised pr-7', p.status === 'error' ? 'border-danger' : 'border-line', p.preview ? 'pl-0' : 'pl-3')}>
              {p.preview ? <img src={p.preview} alt="" className="size-16 object-cover" /> : <FileIcon size={24} className="shrink-0 text-accent-text" />}
              <div className="max-w-36 min-w-0 pl-1 text-xs">
                <p className="truncate font-medium">{p.file.name}</p>
                <p className={p.status === 'error' ? 'text-danger' : 'text-muted'}>
                  {p.status === 'uploading' ? `Uploading ${Math.round(p.progress * 100)}%` : p.status === 'error' ? p.error : formatBytes(p.file.size)}
                </p>
              </div>
              {p.status === 'uploading' && <Spinner size={14} className="absolute top-1.5 right-6 text-muted" />}
              {p.status === 'done' && <Check size={14} weight="bold" className="absolute right-6 bottom-1.5 text-online" />}
              <button type="button" onClick={() => removePending(p.key)} aria-label={`Remove ${p.file.name}`} className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60">
                <X size={11} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1.5">
        {!editing && (
          <>
            <IconButton label="Attach files" onClick={() => files.current?.click()} disabled={pending.length >= MAX_ATTACHMENTS}>
              <Paperclip size={22} />
            </IconButton>
            <input
              ref={files}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
          </>
        )}
        <div className="relative">
          <IconButton label="Emoji" active={emojiOpen} onClick={() => setEmojiOpen((o) => !o)}>
            <Smiley size={22} />
          </IconButton>
          {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
        </div>
        <textarea
          ref={area}
          value={text}
          rows={1}
          maxLength={MAX_BODY_LENGTH + 200}
          aria-label={`Message ${conversation.peer.fullName}`}
          placeholder={editing ? 'Edit your message' : 'Write a message'}
          onChange={(e) => {
            setText(e.target.value)
            resize()
            if (!editing) emitTyping(e.target.value.length > 0)
          }}
          onBlur={() => emitTyping(false)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="max-h-42 min-h-11 flex-1 resize-none rounded-3xl border border-line bg-raised px-4 py-2.5 leading-snug text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          aria-label={editing ? 'Save edit' : 'Send message'}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-[transform,opacity] hover:bg-accent-hover active:scale-90 disabled:opacity-40"
        >
          {busy ? <Spinner size={18} /> : editing ? <Check size={20} weight="bold" /> : <PaperPlaneRight size={20} weight="fill" />}
        </button>
      </div>
      {text.length > MAX_BODY_LENGTH - 300 && <p className={cn('mt-1 text-right text-xs', text.length > MAX_BODY_LENGTH ? 'text-danger' : 'text-muted')}>{text.length}/{MAX_BODY_LENGTH}</p>}
      <p className="hidden py-1.5 text-[11px] text-muted sm:block">Enter to send · Shift+Enter for a new line{!editing && ' · ↑ edits your last message'}</p>
    </div>
  )
}

