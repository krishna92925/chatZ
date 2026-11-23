import { m } from 'motion/react'

const BUBBLE = 'M32 9C18.7 9 8 18.6 8 30.4c0 5.6 2.4 10.7 6.4 14.5L11 56l11.2-5.1c3 .9 6.2 1.4 9.8 1.4 13.3 0 24-9.6 24-21.5S45.3 9 32 9z'
const Z = 'M23 24h18L23 38h18'

/** The chatZ mark: a speech bubble whose tail is the one asymmetric corner, with a Z written inside. */
export function Logo({ size = 40, animate = false, className }: { size?: number; animate?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="chatZ" className={className}>
      <m.path
        d={BUBBLE}
        fill="var(--c-accent)"
        initial={animate ? { opacity: 0, scale: 0.7 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        style={{ transformOrigin: '32px 32px' }}
      />
      <m.path
        d={Z}
        fill="none"
        stroke="var(--c-on-accent)"
        strokeWidth={4.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ delay: animate ? 0.35 : 0, duration: 0.7, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  )
}

export function Wordmark({ size = 32, animate = false }: { size?: number; animate?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logo size={size} animate={animate} />
      <m.span
        className="font-display text-[1.65rem] leading-none font-semibold tracking-tight text-accent-text"
        initial={animate ? { opacity: 0, x: -8 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: animate ? 0.9 : 0, duration: 0.45 }}
      >
        chat<span className="text-fg">Z</span>
      </m.span>
    </span>
  )
}
