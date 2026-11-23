const pad = (n: number) => String(n).padStart(2, '0')

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = Array.from(parts[0])[0] ?? '?'
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : ''
  return (first + (last ?? '')).toUpperCase()
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
export const dayDiff = (iso: string, now = new Date()) => Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Short time for the conversation list: clock today, "Yesterday", weekday this week, otherwise a date. */
export function formatListTime(iso: string, now = new Date()): string {
  const diff = dayDiff(iso, now)
  const d = new Date(iso)
  if (diff <= 0) return formatClock(iso)
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return WEEKDAYS[d.getDay()]!
  const sameYear = d.getFullYear() === now.getFullYear()
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`
}

/** Label for date separators inside a chat. */
export function formatDayLabel(iso: string, now = new Date()): string {
  const diff = dayDiff(iso, now)
  const d = new Date(iso)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const base = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`
}

export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b))
}

export function formatLastSeen(iso: string | null, now = new Date()): string {
  if (!iso) return 'Offline'
  const diff = dayDiff(iso, now)
  if (diff <= 0) return `Last seen today at ${formatClock(iso)}`
  if (diff === 1) return `Last seen yesterday at ${formatClock(iso)}`
  return `Last seen ${formatListTime(iso, now)}`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi

export type TextPart = { text: string; href?: string }
/** Splits text into plain parts and links. Only http(s) links are ever made clickable. */
export function linkify(text: string): TextPart[] {
  const out: TextPart[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push({ text: text.slice(last, i) })
    out.push({ text: m[0], href: m[0] })
    last = i + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

export function previewText(kind: string, body: string, deleted: boolean): string {
  if (deleted) return 'Message deleted'
  if (body) return body
  if (kind === 'image') return 'Photo'
  if (kind === 'video') return 'Video'
  if (kind === 'file') return 'File'
  return ''
}
