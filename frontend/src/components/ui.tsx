import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/format'

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

type Variant = 'primary' | 'subtle' | 'ghost' | 'danger'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover font-semibold',
  subtle: 'bg-raised text-fg hover:bg-[color-mix(in_srgb,var(--c-raised)_82%,var(--c-fg))]',
  ghost: 'text-fg hover:bg-hover',
  danger: 'text-danger hover:bg-[color-mix(in_srgb,var(--c-danger)_14%,transparent)]',
}
const SIZES = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-5 text-base gap-2' }

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-full whitespace-nowrap transition-[background-color,transform,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 14 : 18} /> : icon}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  size?: number
}

export function IconButton({ label, active, size = 40, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-fg active:scale-90 disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-hover text-accent-text',
        className,
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
    </button>
  )
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
  error?: string | null
  ref?: Ref<HTMLInputElement>
}

export function Field({ label, hint, error, id, className, ref, ...rest }: FieldProps) {
  const fid = id ?? `f-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div className={className}>
      <label htmlFor={fid} className="mb-1.5 block text-[13px] font-medium text-muted">
        {label}
      </label>
      <input
        id={fid}
        ref={ref}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${fid}-note` : undefined}
        className={cn(
          'h-11 w-full rounded-xl border bg-raised px-3.5 text-fg transition-colors placeholder:text-muted/70 focus:border-accent focus:outline-none',
          error ? 'border-danger' : 'border-line',
        )}
        {...rest}
      />
      {(error || hint) && (
        <p id={`${fid}-note`} role={error ? 'alert' : undefined} className={cn('mt-1.5 text-[13px]', error ? 'text-danger' : 'text-muted')}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export function TextArea({ label, hint, id, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode }) {
  const fid = id ?? `t-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div className={className}>
      <label htmlFor={fid} className="mb-1.5 block text-[13px] font-medium text-muted">
        {label}
      </label>
      <textarea id={fid} className="min-h-24 w-full resize-none rounded-xl border border-line bg-raised px-3.5 py-2.5 text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none" {...rest} />
      {hint && <p className="mt-1.5 text-[13px] text-muted">{hint}</p>}
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-accent' : 'bg-raised ring-1 ring-line ring-inset')}
    >
      <span className={cn('absolute top-0.5 left-0.5 size-5 rounded-full transition-transform duration-200', checked ? 'translate-x-5 bg-on-accent' : 'bg-muted')} />
    </button>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-xs flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-raised text-accent-text">{icon}</div>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {children && <p className="mt-1.5 text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
