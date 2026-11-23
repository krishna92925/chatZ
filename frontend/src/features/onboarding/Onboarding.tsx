import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { m, AnimatePresence } from 'motion/react'
import { Camera, Check, Copy } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { MeResponse, Profile } from '@shared/types'
import { MAX_AVATAR_BYTES, MAX_BIO_LENGTH, MAX_NAME_LENGTH, USERNAME_RE } from '@shared/constants'
import { api, apiMessage } from '@/lib/api'
import { cn, formatBytes } from '@/lib/format'
import { Avatar } from '@/components/Avatar'
import { Wordmark } from '@/components/Logo'
import { Button, Field, TextArea } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { keys, useMe } from '@/features/chat/queries'

type Availability = 'checking' | 'ok' | 'taken' | 'invalid' | 'reserved'

export function Onboarding() {
  const { session } = useAuth()
  const me = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const fromSignup = String(session?.user.user_metadata?.username ?? '')
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState(fromSignup)
  const [bio, setBio] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Profile | null>(null)
  const [copied, setCopied] = useState(false)
  const [avail, setAvail] = useState<{ u: string; status: Availability } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const uname = username.trim().toLowerCase()
  const validName = USERNAME_RE.test(uname)

  useEffect(() => {
    if (!validName) return
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ available: boolean; reason?: Availability }>('/auth/username-available', { params: { u: uname } })
        setAvail({ u: uname, status: r.data.available ? 'ok' : (r.data.reason ?? 'taken') })
      } catch {
        setAvail(null)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [uname, validName])

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  if (me.data?.profile && !created) return <Navigate to="/chats" replace />

  const availability: Availability | null = !uname ? null : !validName ? 'invalid' : avail?.u === uname ? avail.status : 'checking'
  const nameOk = fullName.trim().length > 0
  const step1Ok = nameOk && availability === 'ok'

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('Choose an image file.')
    if (f.size > MAX_AVATAR_BYTES) return setError(`That photo is ${formatBytes(f.size)}. Choose one under ${formatBytes(MAX_AVATAR_BYTES)}.`)
    setError(null)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function finish() {
    setBusy(true)
    setError(null)
    try {
      let profile = (await api.post<Profile>('/me/onboarding', { username: uname, fullName: fullName.trim(), bio: bio.trim() })).data
      if (file) {
        try {
          const fd = new FormData()
          fd.append('file', file)
          profile = (await api.post<Profile>('/me/avatar', fd)).data
        } catch (err) {
          toast.error(`${apiMessage(err, 'Your photo could not be uploaded.')} You can add one later in Settings.`)
        }
      }
      setCreated(profile)
      qc.setQueryData<MeResponse>(keys.me, { email: session?.user.email ?? '', profile })
      setStep(3)
    } catch (err) {
      const msg = apiMessage(err)
      setError(msg)
      if (/username/i.test(msg)) setStep(1)
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy. Select the code and copy it by hand.')
    }
  }

  return (
    <div className="pt-safe pb-safe flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Wordmark size={30} />
          <div className="flex gap-1.5" aria-label={`Step ${step} of 3`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={cn('h-1.5 w-7 rounded-full transition-colors', n <= step ? 'bg-accent' : 'bg-raised')} />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === 1 && (
            <m.div key="s1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
              <h1 className="font-display text-4xl font-semibold tracking-tight">Tell us who you are</h1>
              <p className="mt-2 mb-7 text-muted">This is what your friends will see.</p>
              <div className="space-y-4">
                <Field label="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={MAX_NAME_LENGTH} autoComplete="name" autoFocus />
                <div>
                  <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))} maxLength={20} autoCapitalize="none" spellCheck={false} autoComplete="off" />
                  {availability && (
                    <p className={cn('mt-1.5 text-[13px]', availability === 'ok' ? 'text-online' : availability === 'checking' ? 'text-muted' : 'text-danger')} aria-live="polite">
                      {availability === 'ok' ? 'Available' : availability === 'checking' ? 'Checking…' : availability === 'taken' ? 'That username is taken' : availability === 'reserved' ? 'That username is reserved' : '3 to 20 characters: lowercase letters, numbers, underscore'}
                    </p>
                  )}
                </div>
                <TextArea label="About you (optional)" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={MAX_BIO_LENGTH} rows={3} hint={`${bio.length}/${MAX_BIO_LENGTH}`} />
              </div>
              {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
              <Button size="lg" className="mt-6 w-full" disabled={!step1Ok} onClick={() => setStep(2)}>
                Continue
              </Button>
            </m.div>
          )}

          {step === 2 && (
            <m.div key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
              <h1 className="font-display text-4xl font-semibold tracking-tight">Add a photo</h1>
              <p className="mt-2 mb-8 text-muted">Optional. People find you faster with a face they know.</p>
              <div className="mb-8 flex flex-col items-center gap-4">
                <button type="button" onClick={() => fileInput.current?.click()} className="group relative rounded-full" aria-label="Choose a photo">
                  <Avatar name={fullName || uname} src={preview} size={136} />
                  <span className="absolute inset-0 grid place-items-center rounded-full bg-overlay opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Camera size={30} />
                  </span>
                </button>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} />
                <Button variant="subtle" size="sm" onClick={() => fileInput.current?.click()} icon={<Camera size={16} />}>
                  {file ? 'Choose a different photo' : 'Choose a photo'}
                </Button>
              </div>
              {error && <p role="alert" className="mb-4 text-center text-sm text-danger">{error}</p>}
              <div className="flex gap-3">
                <Button variant="ghost" size="lg" onClick={() => setStep(1)} disabled={busy}>
                  Back
                </Button>
                <Button size="lg" className="flex-1" loading={busy} onClick={finish}>
                  {file ? 'Finish' : 'Skip and finish'}
                </Button>
              </div>
            </m.div>
          )}

          {step === 3 && created && (
            <m.div key="s3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <h1 className="font-display text-4xl font-semibold tracking-tight">You are in, {created.fullName.split(' ')[0]}</h1>
              <p className="mt-2 mb-7 text-muted">Share your connect code so friends can find you, or search for them by username.</p>
              <div className="rounded-2xl border border-line bg-panel p-5">
                <p className="text-[13px] text-muted">Your connect code</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="font-mono text-2xl tracking-[0.2em] select-all">{created.connectCode}</span>
                  <Button variant="subtle" size="sm" onClick={() => copy(created.connectCode)} icon={copied ? <Check size={16} /> : <Copy size={16} />}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="mt-3 text-[13px] text-muted">You are @{created.username}. You can change who may message you in Settings.</p>
              </div>
              <Button size="lg" className="mt-6 w-full" onClick={() => navigate('/chats', { replace: true })}>
                Start chatting
              </Button>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
