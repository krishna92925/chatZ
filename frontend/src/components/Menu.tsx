import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/format'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  hidden?: boolean
}

export function Menu({ trigger, items, align = 'right', label }: { trigger: ReactNode; items: MenuItem[]; align?: 'left' | 'right'; label: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()
  const visible = items.filter((i) => !i.hidden)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const els = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
        const i = els.indexOf(document.activeElement as HTMLElement)
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus()
      }
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="contents">
        {trigger}
      </button>
      {open && (
        <div id={id} role="menu" className={cn('absolute top-full z-40 mt-1 min-w-48 overflow-hidden rounded-2xl border border-line bg-panel p-1 shadow-xl', align === 'right' ? 'right-0' : 'left-0')}>
          {visible.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
              className={cn('flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm hover:bg-hover focus:bg-hover focus:outline-none', it.danger && 'text-danger')}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
