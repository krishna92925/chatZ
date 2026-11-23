import { useEffect, useMemo } from 'react'
import { NavLink, Outlet, matchPath, useLocation, useNavigate } from 'react-router'
import { ChatsCircle, GearSix, MagnifyingGlass, Users } from '@phosphor-icons/react'
import { cn } from '@/lib/format'
import { useChat } from '@/stores/chat'
import { Avatar } from '@/components/Avatar'
import { Logo } from '@/components/Logo'
import { Spinner } from '@/components/ui'
import { useProfile } from '@/features/auth/useProfile'
import { totalUnread } from '@/features/chat/cache'
import { useRealtime } from '@/features/chat/realtime'
import { useConversations, useRequests } from '@/features/chat/queries'
import { QuickSwitcher } from './QuickSwitcher'
import { ShortcutsHelp } from './ShortcutsHelp'
import { MOD, useShortcuts } from './shortcuts'

function Badge({ n }: { n: number }) {
  if (n <= 0) return null
  return <span className="absolute -top-0.5 -right-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">{n > 99 ? '99+' : n}</span>
}

const itemClass = ({ isActive }: { isActive: boolean }) =>
  cn('relative grid size-12 place-items-center rounded-2xl transition-colors', isActive ? 'bg-raised text-accent-text' : 'text-muted hover:bg-hover hover:text-fg')

export function AppShell() {
  const profile = useProfile()
  useRealtime(profile.id)
  const navigate = useNavigate()
  const location = useLocation()
  const convs = useConversations()
  const requests = useRequests()
  const connection = useChat((s) => s.connection)
  const switcherOpen = useChat((s) => s.switcherOpen)
  const helpOpen = useChat((s) => s.helpOpen)
  const setSwitcherOpen = useChat((s) => s.setSwitcherOpen)
  const setHelpOpen = useChat((s) => s.setHelpOpen)

  const unread = totalUnread(convs.data)
  const incoming = (requests.data ?? []).filter((r) => r.direction === 'incoming').length
  const inChat = Boolean(matchPath('/chats/:id', location.pathname))

  useEffect(() => {
    document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) chatZ` : 'chatZ'
    return () => {
      document.title = 'chatZ'
    }
  }, [unread])

  const shortcuts = useMemo(() => {
    const step = (dir: 1 | -1) => () => {
      const list = (convs.data ?? []).filter((c) => !c.archived)
      if (!list.length) return
      const cur = matchPath('/chats/:id', location.pathname)?.params.id
      const i = list.findIndex((c) => c.id === cur)
      const next = list[i === -1 ? 0 : (i + dir + list.length) % list.length]
      if (next) void navigate(`/chats/${next.id}`)
    }
    return {
      'mod+k': () => setSwitcherOpen(true),
      'mod+shift+o': () => void navigate('/chats'),
      'mod+shift+u': () => void navigate('/friends'),
      'mod+,': () => void navigate('/settings'),
      '?': () => setHelpOpen(true),
      'alt+arrowup': step(-1),
      'alt+arrowdown': step(1),
    }
  }, [convs.data, location.pathname, navigate, setSwitcherOpen, setHelpOpen])
  useShortcuts(shortcuts)

  const nav = [
    { to: '/chats', label: 'Chats', icon: <ChatsCircle size={24} />, badge: unread },
    { to: '/friends', label: 'Friends', icon: <Users size={24} />, badge: incoming },
  ]

  return (
    <div className="flex h-dvh flex-col bg-app">
      {connection !== 'online' && (
        <div role="status" className="pt-safe flex items-center justify-center gap-2 bg-raised px-3 py-1.5 text-[13px] text-muted">
          <Spinner size={13} /> {connection === 'connecting' ? 'Connecting…' : 'You are offline. Reconnecting…'}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Main" className="pt-safe hidden w-[4.5rem] shrink-0 flex-col items-center gap-1.5 border-r border-line bg-app py-4 md:flex">
          <NavLink to="/chats" aria-label="chatZ home" className="mb-3 rounded-xl">
            <Logo size={38} />
          </NavLink>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} title={n.label} aria-label={n.label} className={itemClass}>
              {n.icon}
              <Badge n={n.badge} />
            </NavLink>
          ))}
          <button type="button" onClick={() => setSwitcherOpen(true)} title={`Search (${MOD}+K)`} aria-label="Search" className="grid size-12 place-items-center rounded-2xl text-muted hover:bg-hover hover:text-fg">
            <MagnifyingGlass size={24} />
          </button>
          <div className="flex-1" />
          <NavLink to="/settings" title="Settings" aria-label="Settings" className={itemClass}>
            <GearSix size={24} />
          </NavLink>
          <NavLink to="/settings/profile" title={profile.fullName} aria-label="Your profile" className="mt-1 rounded-full">
            <Avatar name={profile.fullName} src={profile.avatarUrl} size={40} />
          </NavLink>
        </nav>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>

      {!inChat && (
        <nav aria-label="Main" className="pb-safe grid grid-cols-4 border-t border-line bg-panel md:hidden">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} aria-label={n.label} className={({ isActive }) => cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'text-accent-text' : 'text-muted')}>
              <span className="relative">
                {n.icon}
                <Badge n={n.badge} />
              </span>
              {n.label}
            </NavLink>
          ))}
          <button type="button" onClick={() => setSwitcherOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted" aria-label="Search">
            <MagnifyingGlass size={24} />
            Search
          </button>
          <NavLink to="/settings" aria-label="Settings" className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'text-accent-text' : 'text-muted')}>
            <GearSix size={24} />
            Settings
          </NavLink>
        </nav>
      )}

      <QuickSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
