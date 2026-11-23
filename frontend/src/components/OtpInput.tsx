import { useRef } from 'react'
import { cn } from '@/lib/format'

interface Props {
  length: number
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  disabled?: boolean
  invalid?: boolean
}

/** One box per digit. Typing, backspace, arrow keys and pasting a whole code all work. */
export function OtpInput({ length, value, onChange, onComplete, disabled, invalid }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length)
    onChange(clean)
    if (clean.length === length) onComplete?.(clean)
  }

  return (
    <div className={cn('flex justify-between gap-2', invalid && 'shake')} role="group" aria-label="Verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          data-autofocus={i === 0 ? '' : undefined}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            if (!v) return
            const next = value.slice(0, i) + v + value.slice(i + 1)
            commit(next)
            refs.current[Math.min(i + v.length, length - 1)]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault()
              commit(value.slice(0, d ? i : Math.max(0, i - 1)) + value.slice(d ? i + 1 : i))
              refs.current[Math.max(0, d ? i : i - 1)]?.focus()
            } else if (e.key === 'ArrowLeft') refs.current[Math.max(0, i - 1)]?.focus()
            else if (e.key === 'ArrowRight') refs.current[Math.min(length - 1, i + 1)]?.focus()
          }}
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData.getData('text')
            commit(text)
            refs.current[Math.min(text.replace(/\D/g, '').length, length - 1)]?.focus()
          }}
          className={cn(
            'h-14 w-full min-w-0 rounded-xl border bg-raised text-center font-mono text-2xl text-fg transition-colors focus:border-accent focus:outline-none disabled:opacity-60',
            invalid ? 'border-danger' : d ? 'border-accent/60' : 'border-line',
          )}
        />
      ))}
    </div>
  )
}
