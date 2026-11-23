import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Bell, CaretRight, Camera, Keyboard, Lock, Moon, Palette, SignOut, Sun, Trash, UserCircle, Desktop } from '@phosphor-icons/react'
import { MAX_AVATAR_BYTES, MAX_BIO_LENGTH, MAX_NAME_LENGTH } from '@shared/constants'
import type { MeResponse, Profile, PrivacySettings, PublicUser } from '@shared/types'
import { api, apiMessage } from '@/lib/api'
import { cn, formatBytes } from '@/lib/format'
import { desktopPermission, playPing, requestDesktopPermission } from '@/lib/notify'
import { supabase } from '@/lib/supabase'
import { useUi, type Theme } from '@/stores/ui'
import { Avatar } from '@/components/Avatar'
import { Modal } from '@/components/Modal'
import { Button, Field, Skeleton, TextArea, Toggle } from '@/components/ui'
import { useProfile } from '@/features/auth/useProfile'
import { keys, useBlocks, useMe } from '@/features/chat/queries'
import { MyCodeCard } from '@/features/friends/MyCodeCard'
import { SHORTCUTS } from '@/features/shell/shortcuts'

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: <UserCircle size={22} />, hint: 'Photo, name and connect code' },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={22} />, hint: 'Theme' },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={22} />, hint: 'Sound and desktop alerts' },
  { id: 'privacy', label: 'Privacy', icon: <Lock size={22} />, hint: 'Online status, receipts, who can message you' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: <Keyboard size={22} />, hint: 'Get around faster' },
  { id: 'account', label: 'Account', icon: <SignOut size={22} />, hint: 'Sign out and delete your account' },
] as const

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">{children}</div>
    </section>
  )
}

function SettingRow({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function ProfileSection() {
  const profile = useProfile()
  const me = useMe()
  const qc = useQueryClient()
  const [fullName, setFullName] = useState(profile.fullName)
  const [bio, setBio] = useState(profile.bio)
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const dirty = fullName.trim() !== profile.fullName || bio.trim() !== profile.bio

  const store = (p: Profile) => qc.setQueryData<MeResponse>(keys.me, (m) => (m ? { ...m, profile: p } : m))

  async function save() {
    setSaving(true)
    try {
      store((await api.patch<Profile>('/me', { fullName: fullName.trim(), bio: bio.trim() })).data)
      toast.success('Profile saved')
    } catch (e) {
      toast.error(apiMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > MAX_AVATAR_BYTES) return void toast.error(`That photo is ${formatBytes(f.size)}. Choose one under ${formatBytes(MAX_AVATAR_BYTES)}.`)
    setPhotoBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      store((await api.post<Profile>('/me/avatar', fd)).data)
      toast.success('Photo updated')
    } catch (err) {
      toast.error(apiMessage(err))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removePhoto() {
    setPhotoBusy(true)
    try {
      store((await api.delete<Profile>('/me/avatar')).data)
    } catch (err) {
      toast.error(apiMessage(err))
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-5">
        <Avatar name={profile.fullName} src={profile.avatarUrl} size={88} />
        <div className="flex flex-wrap gap-2">
          <Button variant="subtle" size="sm" loading={photoBusy} onClick={() => input.current?.click()} icon={<Camera size={16} />}>
            {profile.avatarUrl ? 'Change photo' : 'Add photo'}
          </Button>
          {profile.avatarUrl && (
            <Button variant="ghost" size="sm" disabled={photoBusy} onClick={() => void removePhoto()}>
              Remove
            </Button>
          )}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void upload(e)} />
        </div>
      </div>
      <div className="mb-6 space-y-4">
        <Field label="Name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={MAX_NAME_LENGTH} />
        <TextArea label="About you" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={MAX_BIO_LENGTH} rows={3} hint={`${bio.length}/${MAX_BIO_LENGTH}`} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Username" value={`@${profile.username}`} readOnly hint="Usernames cannot be changed." />
          <Field label="Email" value={me.data?.email ?? ''} readOnly hint="Only you can see this." />
        </div>
        <Button loading={saving} disabled={!dirty || !fullName.trim()} onClick={() => void save()}>
          Save changes
        </Button>
      </div>
      <MyCodeCard profile={profile} />
    </>
  )
}

function AppearanceSection() {
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const options: Array<{ id: Theme; label: string; icon: ReactNode }> = [
    { id: 'dark', label: 'Dark', icon: <Moon size={22} /> },
    { id: 'light', label: 'Light', icon: <Sun size={22} /> },
    { id: 'system', label: 'Match device', icon: <Desktop size={22} /> },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={theme === o.id} onClick={() => setTheme(o.id)} className={cn('flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-colors', theme === o.id ? 'border-accent bg-raised' : 'border-line bg-panel hover:bg-raised')}>
          <span className={theme === o.id ? 'text-accent-text' : 'text-muted'}>{o.icon}</span>
          <span className="font-medium">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

function NotificationsSection() {
  const sound = useUi((s) => s.sound)
  const desktop = useUi((s) => s.desktopNotifications)
  const setSound = useUi((s) => s.setSound)
  const setDesktop = useUi((s) => s.setDesktopNotifications)
  const [perm, setPerm] = useState(desktopPermission())

  async function toggleDesktop(on: boolean) {
    if (!on) return setDesktop(false)
    const p = perm === 'granted' ? 'granted' : await requestDesktopPermission()
    setPerm(p)
    if (p === 'granted') setDesktop(true)
    else toast.error(p === 'unsupported' ? 'This browser does not support desktop notifications.' : 'Notifications are blocked. Allow them in your browser settings for this site.')
  }

  return (
    <>
      <Group>
        <SettingRow title="Message sound" hint="A short ping when a message arrives in a chat you are not looking at">
          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={playPing}>
              Test
            </Button>
            <Toggle checked={sound} onChange={setSound} label="Message sound" />
          </div>
        </SettingRow>
        <SettingRow title="Desktop notifications" hint={perm === 'denied' ? 'Blocked in your browser settings' : perm === 'unsupported' ? 'Not supported in this browser' : 'Shown when chatZ is in the background'}>
          <Toggle checked={desktop && perm === 'granted'} onChange={(v) => void toggleDesktop(v)} label="Desktop notifications" disabled={perm === 'denied' || perm === 'unsupported'} />
        </SettingRow>
      </Group>
      <p className="text-sm text-muted">The browser tab title always shows your unread count. Mute a single chat from its menu to silence it.</p>
    </>
  )
}

function PrivacySection() {
  const profile = useProfile()
  const qc = useQueryClient()
  const blocks = useBlocks()
  const s = profile.settings

  async function update(patch: Partial<PrivacySettings>) {
    const prev = qc.getQueryData<MeResponse>(keys.me)
    qc.setQueryData<MeResponse>(keys.me, (m) => (m?.profile ? { ...m, profile: { ...m.profile, settings: { ...m.profile.settings, ...patch } } } : m))
    try {
      await api.patch('/me/settings', patch)
      void qc.invalidateQueries({ queryKey: keys.conversations })
    } catch (e) {
      qc.setQueryData(keys.me, prev)
      toast.error(apiMessage(e))
    }
  }

  async function unblock(u: PublicUser) {
    try {
      await api.delete(`/blocks/${u.id}`)
      void qc.invalidateQueries({ queryKey: keys.blocks })
      void qc.invalidateQueries({ queryKey: keys.conversations })
      toast.success(`${u.fullName} unblocked`)
    } catch (e) {
      toast.error(apiMessage(e))
    }
  }

  return (
    <>
      <Group title="Who can see what">
        <SettingRow title="Show when I'm online" hint="If off, you appear offline to everyone">
          <Toggle checked={s.showOnline} onChange={(v) => void update({ showOnline: v })} label="Show when I'm online" />
        </SettingRow>
        <SettingRow title="Show my last seen" hint="Shown when you are not online">
          <Toggle checked={s.showLastSeen} onChange={(v) => void update({ showLastSeen: v })} label="Show my last seen" disabled={!s.showOnline} />
        </SettingRow>
        <SettingRow title="Read receipts" hint="Both of you must have this on to see when messages are read">
          <Toggle checked={s.readReceipts} onChange={(v) => void update({ readReceipts: v })} label="Read receipts" />
        </SettingRow>
      </Group>

      <Group title="Who can message me">
        {(
          [
            ['friends', 'Friends only', 'People must be your friend first'],
            ['everyone', 'Everyone', 'Anyone who finds you can start a chat'],
          ] as const
        ).map(([id, title, hint]) => (
          <button key={id} role="radio" aria-checked={s.whoCanMessage === id} onClick={() => void update({ whoCanMessage: id })} className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-hover">
            <span>
              <span className="block font-medium">{title}</span>
              <span className="block text-sm text-muted">{hint}</span>
            </span>
            <span className={cn('grid size-5 place-items-center rounded-full border-2', s.whoCanMessage === id ? 'border-accent' : 'border-line')}>{s.whoCanMessage === id && <span className="size-2.5 rounded-full bg-accent" />}</span>
          </button>
        ))}
      </Group>

      <Group title="Blocked people">
        {blocks.isPending && (
          <div className="p-4">
            <Skeleton className="h-10" />
          </div>
        )}
        {blocks.data?.length === 0 && <p className="px-4 py-4 text-sm text-muted">You have not blocked anyone.</p>}
        {blocks.data?.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={u.fullName} src={u.avatarUrl} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{u.fullName}</p>
              <p className="truncate text-sm text-muted">@{u.username}</p>
            </div>
            <Button size="sm" variant="subtle" onClick={() => void unblock(u)}>
              Unblock
            </Button>
          </div>
        ))}
      </Group>
    </>
  )
}

function ShortcutsSection() {
  return (
    <Group>
      {SHORTCUTS.map((s) => (
        <div key={s.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <span>{s.label}</span>
          <span className="flex shrink-0 gap-1">
            {s.keys.map((k) => (
              <kbd key={k} className="min-w-6 rounded-md border border-line bg-raised px-1.5 py-0.5 text-center font-mono text-xs">
                {k}
              </kbd>
            ))}
          </span>
        </div>
      ))}
    </Group>
  )
}

function AccountSection() {
  const profile = useProfile()
  const me = useMe()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [everywhere, setEverywhere] = useState(false)

  async function deleteAccount() {
    setBusy(true)
    try {
      await api.delete('/me', { data: { confirm: confirmText } })
      toast.success('Your account data was deleted.')
      await supabase.auth.signOut()
    } catch (e) {
      toast.error(apiMessage(e))
      setBusy(false)
    }
  }

  return (
    <>
      <Group title="Signed in as">
        <SettingRow title={profile.fullName} hint={me.data?.email ?? `@${profile.username}`}>
          <span className="text-sm text-muted">@{profile.username}</span>
        </SettingRow>
      </Group>
      <Group>
        <SettingRow title="Sign out" hint="On this device">
          <Button variant="subtle" size="sm" icon={<SignOut size={16} />} onClick={() => void supabase.auth.signOut()}>
            Sign out
          </Button>
        </SettingRow>
        <SettingRow title="Sign out everywhere" hint="Ends every session on every device">
          <Button
            variant="subtle"
            size="sm"
            loading={everywhere}
            onClick={async () => {
              setEverywhere(true)
              await supabase.auth.signOut({ scope: 'global' })
            }}
          >
            Sign out all
          </Button>
        </SettingRow>
      </Group>
      <Group title="Danger zone">
        <SettingRow title="Delete my account" hint="Removes your profile, friends, messages and files for good">
          <Button variant="danger" size="sm" icon={<Trash size={16} />} onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </SettingRow>
      </Group>
      <p className="text-sm text-muted">chatZ 2.0</p>

      <Modal open={deleteOpen} onClose={() => (busy ? undefined : setDeleteOpen(false))} title="Delete your account?" size="sm">
        <p className="mb-4 text-muted">This permanently deletes your profile, your friends, every message you sent, and your photos and files. It cannot be undone.</p>
        <Field label={`Type ${profile.username} to confirm`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="none" spellCheck={false} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" className="bg-[color-mix(in_srgb,var(--c-danger)_16%,transparent)] font-semibold" loading={busy} disabled={confirmText.trim().toLowerCase() !== profile.username} onClick={() => void deleteAccount()}>
            Delete forever
          </Button>
        </div>
      </Modal>
    </>
  )
}

const CONTENT: Record<(typeof SECTIONS)[number]['id'], () => ReactNode> = {
  profile: () => <ProfileSection />,
  appearance: () => <AppearanceSection />,
  notifications: () => <NotificationsSection />,
  privacy: () => <PrivacySection />,
  shortcuts: () => <ShortcutsSection />,
  account: () => <AccountSection />,
}

export function SettingsPage() {
  const { section } = useParams()
  const navigate = useNavigate()
  const current = SECTIONS.find((s) => s.id === section)
  if (section && !current) return <Navigate to="/settings" replace />
  const Content = current ? CONTENT[current.id] : null

  return (
    <div className="flex min-h-0 flex-1">
      <aside className={cn('w-full shrink-0 flex-col overflow-y-auto border-r border-line bg-panel md:flex md:w-[20rem]', current ? 'hidden' : 'flex')}>
        <h1 className="pt-safe px-5 pt-6 pb-3 font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <nav aria-label="Settings sections" className="px-2 pb-4">
          {SECTIONS.map((s) => (
            <Link key={s.id} to={`/settings/${s.id}`} className={cn('flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors', current?.id === s.id ? 'bg-raised' : 'hover:bg-hover')}>
              <span className={current?.id === s.id ? 'text-accent-text' : 'text-muted'}>{s.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.label}</span>
                <span className="block truncate text-[13px] text-muted">{s.hint}</span>
              </span>
              <CaretRight size={16} className="text-muted md:hidden" />
            </Link>
          ))}
        </nav>
      </aside>
      <div className={cn('min-w-0 flex-1 overflow-y-auto md:block', current ? 'block' : 'hidden')}>
        {current && Content && (
          <div className="pt-safe mx-auto max-w-2xl px-4 py-6 sm:px-8">
            <button type="button" onClick={() => void navigate('/settings')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg md:hidden">
              <ArrowLeft size={16} /> Settings
            </button>
            <h2 className="mb-6 font-display text-3xl font-semibold tracking-tight">{current.label}</h2>
            <Content />
          </div>
        )}
        {!current && (
          <div className="hidden h-full place-items-center md:grid">
            <Navigate to="/settings/profile" replace />
          </div>
        )}
      </div>
    </div>
  )
}
