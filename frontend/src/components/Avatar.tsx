import { useState } from 'react'
import { absUrl } from '@/lib/api'
import { cn, initials } from '@/lib/format'

interface Props {
  name: string
  src?: string | null
  size?: number
  online?: boolean
  className?: string
}

export function Avatar({ name, src, size = 40, online, className }: Props) {
  const [failed, setFailed] = useState<string | null>(null)
  const url = absUrl(src)
  const show = url && failed !== url
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {show ? (
        <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(url)} className="size-full rounded-full object-cover" />
      ) : (
        <span
          aria-hidden
          className="grid size-full place-items-center rounded-full bg-raised font-display font-semibold text-accent-text select-none"
          style={{ fontSize: Math.max(11, size * 0.38) }}
        >
          {initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          className={cn('absolute right-0 bottom-0 rounded-full ring-2 ring-[var(--c-panel)]', online ? 'bg-online' : 'hidden')}
          style={{ width: Math.max(9, size * 0.26), height: Math.max(9, size * 0.26) }}
          title={online ? 'Online' : undefined}
        />
      )}
    </span>
  )
}
