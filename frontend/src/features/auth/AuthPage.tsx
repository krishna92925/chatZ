import { useEffect, useState, type FormEvent } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { ArrowLeft, At, EnvelopeSimple } from '@phosphor-icons/react'
import type { OtpStartResponse, SessionResponse } from '@shared/types'
import { USERNAME_RE } from '@shared/constants'
import { api, apiMessage } from '@/lib/api'
import { OTP_LENGTH } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/format'
import { Logo, Wordmark } from '@/components/Logo'
import { OtpInput } from '@/components/OtpInput'
import { Button, Field } from '@/components/ui'

type Mode = 'login' | 'signup'
type Availability = 'checking' | 'ok' | 'taken' | 'invalid' | 'reserved'

const REASONS: Record<Availability, string> = {
  checking: 'Checking…',
  ok: 'Available',
  taken: 'That username is taken',
  invalid: '3 to 20 characters: lowercase letters, numbers, underscore',
  reserved: 'That username is reserved',
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [step, setStep] = useState<'form' | 'code'>('form')
  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [masked, setMasked] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [avail, setAvail] = useState<{ u: string; status: Availability } | null>(null)

  const uname = username.trim().toLowerCase()
  const validName = USERNAME_RE.test(uname)

  useEffect(() => {
    if (mode !== 'signup' || !validName) return
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ available: boolean; reason?: Availability }>('/auth/username-available', { params: { u: uname } })
        setAvail({ u: uname, status: r.data.available ? 'ok' : (r.data.reason ?? 'taken') })
      } catch {
        setAvail(null)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [uname, validName, mode])

  const availability: Availability | null = mode !== 'signup' || !uname ? null : !validName ? 'invalid' : avail?.u === uname ? avail.status : 'checking'

  useEffect(() => {
    if (step !== 'code') return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [step])
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000))

  const target = mode === 'signup' ? email.trim().toLowerCase() : identifier.trim()
  const canStart = mode === 'signup' ? /^\S+@\S+\.\S+$/.test(target) && availability === 'ok' : target.length >= 3

  async function start(e?: FormEvent) {
    e?.preventDefault()
    if (!canStart || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<OtpStartResponse>('/auth/otp/start', { identifier: target, mode, ...(mode === 'signup' ? { username: uname } : {}) })
      setMasked(r.data.maskedEmail)
      setCode('')
      setStep('code')
      setNow(Date.now())
      setResendAt(Date.now() + 60_000)
    } catch (err) {
      setError(apiMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function verify(value: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<SessionResponse>('/auth/otp/verify', { identifier: target, code: value })
      const { error: sessionError } = await supabase.auth.setSession({ access_token: r.data.access_token, refresh_token: r.data.refresh_token })
      if (sessionError) throw sessionError
    } catch (err) {
      setError(apiMessage(err, 'That code did not work.'))
      setCode('')
      setBusy(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setStep('form')
    setError(null)
    setCode('')
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-panel p-12 lg:flex">
        <Wordmark size={36} />
        <div>
          <Logo size={120} animate className="mb-8" />
          <h2 className="max-w-md font-display text-5xl leading-[1.08] font-semibold tracking-tight">Private chat for people you actually know.</h2>
          <ul className="mt-8 max-w-sm space-y-2.5 text-muted">
            <li>Photos, videos and files, sent in a tap</li>
            <li>Read receipts and last seen that you control</li>
            <li>Keyboard shortcuts for everything. Press ? once you are in.</li>
          </ul>
        </div>
        <p className="text-sm text-muted">Sign-in is a code sent to your email. There are no passwords to forget.</p>
      </aside>

      <main className="pt-safe pb-safe flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-100">
          <div className="mb-8 lg:hidden">
            <Wordmark size={34} animate />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {step === 'form' ? (
              <m.form key={`form-${mode}`} onSubmit={start} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} noValidate>
                <h1 className="font-display text-4xl font-semibold tracking-tight">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
                <p className="mt-2 mb-7 text-muted">{mode === 'login' ? 'Enter your email or username and we will send you a code.' : 'Choose a username and we will email you a code to confirm your address.'}</p>

                {mode === 'login' ? (
                  <Field label="Email or username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@example.com or @you" autoFocus />
                ) : (
                  <div className="space-y-4">
                    <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" autoFocus />
                    <div>
                      <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="yourname" maxLength={20} />
                      {availability && (
                        <p className={cn('mt-1.5 text-[13px]', availability === 'ok' ? 'text-online' : availability === 'checking' ? 'text-muted' : 'text-danger')} aria-live="polite">
                          {REASONS[availability]}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <p role="alert" className="mt-4 rounded-xl bg-[color-mix(in_srgb,var(--c-danger)_14%,transparent)] px-3.5 py-2.5 text-sm text-danger">
                    {error}
                  </p>
                )}

                <Button type="submit" size="lg" className="mt-6 w-full" loading={busy} disabled={!canStart} icon={mode === 'login' ? <At size={18} weight="bold" /> : <EnvelopeSimple size={18} weight="bold" />}>
                  Send code
                </Button>

                <p className="mt-6 text-center text-sm text-muted">
                  {mode === 'login' ? 'New to chatZ?' : 'Already have an account?'}{' '}
                  <button type="button" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')} className="font-semibold text-accent-text underline-offset-4 hover:underline">
                    {mode === 'login' ? 'Create an account' : 'Sign in'}
                  </button>
                </p>
              </m.form>
            ) : (
              <m.div key="code" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                <button type="button" onClick={() => setStep('form')} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
                  <ArrowLeft size={16} /> Back
                </button>
                <h1 className="font-display text-4xl font-semibold tracking-tight">Check your email</h1>
                <p className="mt-2 mb-7 text-muted">
                  {masked ? (
                    <>
                      We sent a {OTP_LENGTH}-digit code to <span className="font-medium text-fg">{masked}</span>.
                    </>
                  ) : (
                    <>If that account exists, a {OTP_LENGTH}-digit code is on its way.</>
                  )}
                </p>
                <OtpInput length={OTP_LENGTH} value={code} onChange={setCode} onComplete={verify} disabled={busy} invalid={Boolean(error)} />
                {error && (
                  <p role="alert" className="mt-3 text-sm text-danger">
                    {error}
                  </p>
                )}
                <Button size="lg" className="mt-6 w-full" loading={busy} disabled={code.length < OTP_LENGTH} onClick={() => verify(code)}>
                  Verify and continue
                </Button>
                <p className="mt-5 text-center text-sm text-muted">
                  {wait > 0 ? (
                    <>Resend code in {wait}s</>
                  ) : (
                    <button type="button" onClick={() => void start()} className="font-semibold text-accent-text hover:underline">
                      Send a new code
                    </button>
                  )}
                </p>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
