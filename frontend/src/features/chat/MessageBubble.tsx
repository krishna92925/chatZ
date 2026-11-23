import { memo, useState } from 'react'
import { ArrowBendUpLeft, Check, Checks, Clock, Copy, DotsThree, DownloadSimple, File as FileIcon, PencilSimple, SmileySticker, Trash, WarningCircle } from '@phosphor-icons/react'
import { REACTION_EMOJIS } from '@shared/constants'
import type { Attachment } from '@shared/types'
import { absUrl } from '@/lib/api'
import { cn, formatBytes, formatClock, linkify, previewText } from '@/lib/format'
import { Menu } from '@/components/Menu'
import type { ClientMessage } from './cache'

export interface MessageActions {
  reply: (m: ClientMessage) => void
  react: (m: ClientMessage, emoji: string) => void
  edit: (m: ClientMessage) => void
  remove: (m: ClientMessage, scope: 'me' | 'everyone') => void
  retry: (m: ClientMessage) => void
  discard: (m: ClientMessage) => void
  openImage: (a: Attachment) => void
  jumpTo: (messageId: string) => void
}

interface Props {
  msg: ClientMessage
  meId: string
  /** first/last bubble of a run from the same sender */
  first: boolean
  last: boolean
  read: boolean
  senderName: string
  highlighted: boolean
  actions: MessageActions
}

function Text({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

function Media({ atts, onOpen }: { atts: Attachment[]; onOpen: (a: Attachment) => void }) {
  const images = atts.filter((a) => a.kind === 'image')
  const videos = atts.filter((a) => a.kind === 'video')
  const files = atts.filter((a) => a.kind === 'file')
  return (
    <div className="space-y-1.5">
      {images.length > 0 && (
        <div className={cn('grid gap-1', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {images.map((a) => (
            <button key={a.id} type="button" onClick={() => onOpen(a)} className="overflow-hidden rounded-xl bg-black/20" aria-label={`Open ${a.name}`}>
              <img
                src={absUrl(a.url)}
                alt={a.name}
                loading="lazy"
                decoding="async"
                width={a.width ?? undefined}
                height={a.height ?? undefined}
                style={images.length === 1 && a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}`, maxHeight: 380 } : undefined}
                className={cn('w-full object-cover', images.length > 1 ? 'aspect-square' : 'max-h-96 min-h-24 min-w-40')}
              />
            </button>
          ))}
        </div>
      )}
      {videos.map((a) => (
        <video key={a.id} src={absUrl(a.url)} controls preload="metadata" playsInline className="max-h-96 w-full rounded-xl bg-black" aria-label={a.name} />
      ))}
      {files.map((a) => (
        <a key={a.id} href={absUrl(a.url)} download={a.name} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl bg-black/15 px-3 py-2.5 hover:bg-black/25">
          <FileIcon size={26} weight="duotone" className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{a.name}</span>
            <span className="block text-xs opacity-70">{formatBytes(a.size)}</span>
          </span>
          <DownloadSimple size={18} className="shrink-0 opacity-80" />
        </a>
      ))}
    </div>
  )
}

function Ticks({ msg, read }: { msg: ClientMessage; read: boolean }) {
  if (msg.status === 'sending') return <Clock size={13} aria-label="Sending" />
  if (msg.status === 'failed') return <WarningCircle size={14} weight="fill" aria-label="Failed to send" />
  return read ? <Checks size={15} weight="bold" aria-label="Read" /> : <Check size={14} weight="bold" aria-label="Sent" />
}

function BubbleImpl({ msg, meId, first, last, read, senderName, highlighted, actions }: Props) {
  const mine = msg.senderId === meId
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const deleted = Boolean(msg.deletedAt)
  const pending = msg.status !== undefined
  const mineReacted = (emoji: string) => msg.reactions.find((r) => r.emoji === emoji)?.userIds.includes(meId) ?? false

  return (
    <div
      data-seq={msg.seq}
      data-id={msg.id}
      className={cn('group flex px-3 sm:px-5', mine ? 'justify-end' : 'justify-start', first ? 'mt-2.5' : 'mt-0.5', highlighted && 'rounded-2xl bg-[color-mix(in_srgb,var(--c-accent)_18%,transparent)] transition-colors duration-700')}
    >
      <div className={cn('relative flex max-w-[min(82%,34rem)] flex-col', mine ? 'items-end' : 'items-start')}>
        <div
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('a,button,video,input')) setOpen((o) => !o)
          }}
          className={cn(
            'relative px-3 py-2 text-[15px] leading-snug',
            mine ? 'bg-me text-on-me' : 'bg-them text-on-them',
            'rounded-[1.15rem]',
            last && (mine ? 'rounded-br-[0.3rem]' : 'rounded-bl-[0.3rem]'),
            msg.status === 'sending' && 'opacity-70',
            msg.status === 'failed' && 'ring-1 ring-danger',
            deleted && 'bg-transparent text-muted ring-1 ring-line',
          )}
        >
          {deleted ? (
            <span className="text-sm italic">This message was deleted</span>
          ) : (
            <div className="space-y-1.5">
              {msg.replyTo && (
                <button type="button" onClick={() => actions.jumpTo(msg.replyTo!.id)} className="block w-full rounded-lg border-l-[3px] border-current/50 bg-black/10 px-2.5 py-1.5 text-left text-[13px]">
                  <span className="block font-semibold opacity-90">{msg.replyTo.senderId === meId ? 'You' : senderName}</span>
                  <span className="line-clamp-2 opacity-80">{previewText(msg.replyTo.kind, msg.replyTo.body, msg.replyTo.deleted)}</span>
                </button>
              )}
              {msg.attachments.length > 0 && <Media atts={msg.attachments} onOpen={actions.openImage} />}
              {msg.body && (
                <p className="break-words whitespace-pre-wrap">
                  <Text text={msg.body} />
                </p>
              )}
            </div>
          )}
          {!deleted && (
            <span className={cn('mt-0.5 flex items-center justify-end gap-1 text-[11px] opacity-70', msg.attachments.length > 0 && !msg.body && 'mt-1')}>
              {msg.editedAt && <span>edited</span>}
              <span>{formatClock(msg.createdAt)}</span>
              {mine && <Ticks msg={msg} read={read} />}
            </span>
          )}
        </div>

        {msg.reactions.length > 0 && !deleted && (
          <div className={cn('-mt-1.5 flex flex-wrap gap-1', mine ? 'justify-end pr-2' : 'pl-2')}>
            {msg.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => actions.react(msg, r.emoji)}
                aria-label={`${r.emoji} ${r.userIds.length}, ${mineReacted(r.emoji) ? 'remove your reaction' : 'react'}`}
                className={cn('flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs', mineReacted(r.emoji) ? 'border-accent bg-[color-mix(in_srgb,var(--c-accent)_22%,var(--c-bg))]' : 'border-line bg-panel')}
              >
                <span>{r.emoji}</span>
                {r.userIds.length > 1 && <span className="text-muted">{r.userIds.length}</span>}
              </button>
            ))}
          </div>
        )}

        {msg.status === 'failed' && (
          <div className="mt-1 flex items-center gap-3 text-xs text-danger">
            <span>Not sent.</span>
            <button type="button" onClick={() => actions.retry(msg)} className="font-semibold underline">
              Retry
            </button>
            <button type="button" onClick={() => actions.discard(msg)} className="underline">
              Discard
            </button>
          </div>
        )}

        {!deleted && !pending && (
          <div
            className={cn(
              'absolute top-0 z-10 -translate-y-1/2 items-center gap-0.5 rounded-full border border-line bg-panel p-0.5 shadow-lg',
              mine ? 'right-2' : 'left-2',
              open || picking ? 'flex' : 'hidden group-hover:flex group-focus-within:flex',
            )}
          >
            {picking ? (
              REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setPicking(false)
                    setOpen(false)
                    actions.react(msg, e)
                  }}
                  className="grid size-8 place-items-center rounded-full text-lg hover:bg-hover"
                  aria-label={`React ${e}`}
                >
                  {e}
                </button>
              ))
            ) : (
              <>
                <button type="button" aria-label="React" title="React" onClick={() => setPicking(true)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg">
                  <SmileySticker size={18} />
                </button>
                <button type="button" aria-label="Reply" title="Reply" onClick={() => actions.reply(msg)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg">
                  <ArrowBendUpLeft size={18} />
                </button>
                <Menu
                  label="More"
                  trigger={
                    <span className="grid size-8 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg">
                      <DotsThree size={20} weight="bold" />
                    </span>
                  }
                  align={mine ? 'right' : 'left'}
                  items={[
                    { label: 'Copy text', icon: <Copy size={16} />, hidden: !msg.body, onSelect: () => void navigator.clipboard?.writeText(msg.body) },
                    { label: 'Edit', icon: <PencilSimple size={16} />, hidden: !mine, onSelect: () => actions.edit(msg) },
                    { label: 'Delete for me', icon: <Trash size={16} />, onSelect: () => actions.remove(msg, 'me') },
                    { label: 'Delete for everyone', icon: <Trash size={16} />, danger: true, hidden: !mine, onSelect: () => actions.remove(msg, 'everyone') },
                  ]}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const MessageBubble = memo(BubbleImpl)
