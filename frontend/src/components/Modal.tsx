import { useEffect, useId, useRef, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { X } from '@phosphor-icons/react'
import { IconButton } from './ui'
import { cn } from '@/lib/format'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** wide content such as the quick switcher */
  size?: 'sm' | 'md' | 'lg'
  bare?: boolean
}

/** Dialog on desktop, bottom sheet on phones. Closes with Esc or a click outside, keeps keyboard focus inside. */
export function Modal({ open, onClose, title, children, size = 'md', bare }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const node = ref.current
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
        if (!items.length) return
        const a = items[0]!
        const z = items[items.length - 1]!
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <m.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-overlay backdrop-blur-[2px]" onClick={onClose} aria-hidden />
          <m.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : 'Dialog'}
            className={cn(
              'pb-safe relative max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-panel shadow-2xl sm:rounded-3xl',
              size === 'sm' && 'sm:max-w-sm',
              size === 'md' && 'sm:max-w-md',
              size === 'lg' && 'sm:max-w-xl',
            )}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            {!bare && (
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <h2 id={titleId} className="font-display text-xl font-semibold">
                  {title}
                </h2>
                <IconButton label="Close" onClick={onClose} size={36}>
                  <X size={18} />
                </IconButton>
              </div>
            )}
            <div className={bare ? '' : 'px-5 pb-5'}>{children}</div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
