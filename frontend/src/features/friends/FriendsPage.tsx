import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChatCircleText, Check, DotsThree, MagnifyingGlass, Prohibit, UserMinus, UserPlus, Users, X } from '@phosphor-icons/react'
import { CONNECT_CODE_LENGTH } from '@shared/constants'
import type { Conversation, PublicUser, UserCard } from '@shared/types'
import { api, apiMessage } from '@/lib/api'
import { cn } from '@/lib/format'
import { Avatar } from '@/components/Avatar'
import { Menu } from '@/components/Menu'
import { Button, EmptyState, Field, Skeleton } from '@/components/ui'
import { useProfile } from '@/features/auth/useProfile'
import { useDebounced } from '@/lib/useDebounced'
import { keys, useFriends, useRequests } from '@/features/chat/queries'
import { MyCodeCard } from './MyCodeCard'

type Tab = 'friends' | 'requests' | 'find'

function Row({ user, children, sub }: { user: Pick<PublicUser, 'fullName' | 'username' | 'avatarUrl'> & { online?: boolean }; sub?: string; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-hover">
      <Avatar name={user.fullName} src={user.avatarUrl} size={46} online={user.online} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{user.fullName}</p>
        <p className="truncate text-sm text-muted">{sub ?? `@${user.username}`}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </li>
  )
}

function useOpenChat() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  return async (userId: string) => {
    try {
      const r = await api.post<Conversation>('/conversations/direct', { userId })
      void qc.invalidateQueries({ queryKey: keys.conversations })
      void navigate(`/chats/${r.data.id}`)
    } catch (e) {
      toast.error(apiMessage(e))
    }
  }
}

function CardActions({ card }: { card: UserCard }) {
  const qc = useQueryClient()
  const open = useOpenChat()
  const [busy, setBusy] = useState(false)
  const refresh = () => {
    for (const k of [keys.requests, keys.friends, keys.conversations]) void qc.invalidateQueries({ queryKey: k })
    void qc.invalidateQueries({ queryKey: ['people'] })
    void qc.invalidateQueries({ queryKey: ['card'] })
  }
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true)
    try {
      await fn()
      if (ok) toast.success(ok)
      refresh()
    } catch (e) {
      toast.error(apiMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const message =
    card.canMessage || card.relation === 'friends' ? (
      <Button size="sm" variant="subtle" icon={<ChatCircleText size={16} />} onClick={() => void open(card.id)}>
        Message
      </Button>
    ) : null
  switch (card.relation) {
    case 'self':
      return <span className="text-sm text-muted">This is you</span>
    case 'friends':
      return message
    case 'request_sent':
      return (
        <Button size="sm" variant="ghost" loading={busy} onClick={() => void run(() => api.delete(`/friends/requests/${card.requestId}`), 'Request cancelled')}>
          Cancel request
        </Button>
      )
    case 'request_received':
      return (
        <Button size="sm" loading={busy} icon={<Check size={16} weight="bold" />} onClick={() => void run(() => api.post(`/friends/requests/${card.requestId}/accept`), `You and ${card.fullName} are now friends`)}>
          Accept
        </Button>
      )
    case 'blocked':
      return (
        <Button size="sm" variant="subtle" loading={busy} onClick={() => void run(() => api.delete(`/blocks/${card.id}`), `${card.fullName} unblocked`)}>
          Unblock
        </Button>
      )
    default:
      return (
        <>
          {message}
          <Button size="sm" loading={busy} icon={<UserPlus size={16} />} onClick={() => void run(() => api.post('/friends/requests', { userId: card.id }), `Request sent to ${card.fullName}`)}>
            Add friend
          </Button>
        </>
      )
  }
}

function FindTab() {
  const profile = useProfile()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [code, setCode] = useState(() => (params.get('code') ?? '').toUpperCase().slice(0, CONNECT_CODE_LENGTH))
  const term = useDebounced(q.trim().replace(/^@/, ''), 300)

  useEffect(() => {
    if (params.has('code')) {
      setParams(
        (p) => {
          p.delete('code')
          p.set('tab', 'find')
          return p
        },
        { replace: true },
      )
    }
  }, [params, setParams])

  const people = useQuery({ queryKey: ['people', term], enabled: term.length >= 2, queryFn: async () => (await api.get<UserCard[]>('/users/search', { params: { q: term } })).data })
  const byCode = useQuery({
    queryKey: ['card', 'code', code],
    enabled: code.length === CONNECT_CODE_LENGTH,
    retry: false,
    queryFn: async () => (await api.get<UserCard>(`/users/by-code/${code}`)).data,
  })

  return (
    <div className="space-y-7">
      <MyCodeCard profile={profile} />

      <section>
        <h2 className="mb-2 text-sm font-semibold">Find by name or username</h2>
        <div className="relative">
          <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" placeholder="Search people" autoCapitalize="none" className="h-11 w-full rounded-full border border-line bg-raised pr-4 pl-10 text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none" />
        </div>
        <ul className="mt-2">
          {term.length >= 2 && people.isFetching && (
            <li className="px-3 py-4">
              <Skeleton className="h-12" />
            </li>
          )}
          {term.length >= 2 && !people.isFetching && people.data?.length === 0 && <li className="px-3 py-4 text-sm text-muted">No one found for "{term}".</li>}
          {people.data?.map((u) => (
            <Row key={u.id} user={u}>
              <CardActions card={u} />
            </Row>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Have a connect code?</h2>
        <Field
          label="Connect code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CONNECT_CODE_LENGTH))}
          className="[&_input]:font-mono [&_input]:tracking-[0.2em]"
          placeholder="ABCDE12345"
          autoCapitalize="characters"
          spellCheck={false}
          error={byCode.isError ? apiMessage(byCode.error, 'No one has that code.') : null}
          hint={code.length < CONNECT_CODE_LENGTH ? `${CONNECT_CODE_LENGTH} characters` : undefined}
        />
        {byCode.data && (
          <ul className="mt-2">
            <Row user={byCode.data}>
              <CardActions card={byCode.data} />
            </Row>
          </ul>
        )}
      </section>
    </div>
  )
}

export function FriendsPage() {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const open = useOpenChat()
  const friends = useFriends()
  const requests = useRequests()
  const tab: Tab = params.get('tab') === 'requests' ? 'requests' : params.get('tab') === 'find' || params.has('code') ? 'find' : 'friends'
  const incoming = (requests.data ?? []).filter((r) => r.direction === 'incoming')
  const outgoing = (requests.data ?? []).filter((r) => r.direction === 'outgoing')

  const go = (t: Tab) => setParams(t === 'friends' ? {} : { tab: t })
  const done = () => {
    for (const k of [keys.requests, keys.friends, keys.conversations]) void qc.invalidateQueries({ queryKey: k })
  }
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) toast.success(ok)
      done()
    } catch (e) {
      toast.error(apiMessage(e))
    }
  }

  const tabs: Array<[Tab, string, number]> = [
    ['friends', 'Friends', friends.data?.length ?? 0],
    ['requests', 'Requests', incoming.length],
    ['find', 'Find people', 0],
  ]

  return (
    <div className="pt-safe min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <h1 className="mb-5 font-display text-3xl font-semibold tracking-tight">Friends</h1>
        <div className="mb-5 flex gap-1.5" role="tablist">
          {tabs.map(([id, label, n]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => go(id)} className={cn('flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors', tab === id ? 'bg-accent text-on-accent' : 'text-muted hover:bg-hover hover:text-fg')}>
              {label}
              {n > 0 && <span className={cn('rounded-full px-1.5 text-xs', tab === id ? 'bg-on-accent/15' : id === 'requests' ? 'bg-accent text-on-accent' : 'bg-raised')}>{n}</span>}
            </button>
          ))}
        </div>

        {tab === 'friends' && (
          <ul>
            {friends.isPending &&
              Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="px-3 py-2.5">
                  <Skeleton className="h-12" />
                </li>
              ))}
            {friends.data?.length === 0 && (
              <EmptyState icon={<Users size={28} weight="duotone" />} title="No friends yet" action={<Button onClick={() => go('find')} icon={<UserPlus size={16} />}>Find people</Button>}>
                Share your connect code or search for someone by username.
              </EmptyState>
            )}
            {friends.data?.map((u) => (
              <Row key={u.id} user={u} sub={u.online ? 'Online' : `@${u.username}`}>
                <Button size="sm" variant="subtle" icon={<ChatCircleText size={16} />} onClick={() => void open(u.id)}>
                  Message
                </Button>
                <Menu
                  label={`More for ${u.fullName}`}
                  trigger={
                    <span className="grid size-9 place-items-center rounded-full text-muted hover:bg-hover">
                      <DotsThree size={22} weight="bold" />
                    </span>
                  }
                  items={[
                    { label: 'Unfriend', icon: <UserMinus size={16} />, onSelect: () => void act(() => api.delete(`/friends/${u.id}`), `${u.fullName} removed from friends`) },
                    { label: 'Block', icon: <Prohibit size={16} />, danger: true, onSelect: () => void act(() => api.post(`/blocks/${u.id}`), `${u.fullName} blocked`) },
                  ]}
                />
              </Row>
            ))}
          </ul>
        )}

        {tab === 'requests' && (
          <div className="space-y-6">
            <section>
              <h2 className="mb-1 px-3 text-sm font-semibold">Received</h2>
              <ul>
                {incoming.length === 0 && <li className="px-3 py-3 text-sm text-muted">No new requests.</li>}
                {incoming.map((r) => (
                  <Row key={r.id} user={r.user}>
                    <Button size="sm" icon={<Check size={16} weight="bold" />} onClick={() => void act(() => api.post(`/friends/requests/${r.id}/accept`), `You and ${r.user.fullName} are now friends`)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" icon={<X size={16} />} onClick={() => void act(() => api.delete(`/friends/requests/${r.id}`))} aria-label={`Decline ${r.user.fullName}`}>
                      Decline
                    </Button>
                  </Row>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-1 px-3 text-sm font-semibold">Sent</h2>
              <ul>
                {outgoing.length === 0 && <li className="px-3 py-3 text-sm text-muted">You have no pending requests.</li>}
                {outgoing.map((r) => (
                  <Row key={r.id} user={r.user} sub="Waiting for a reply">
                    <Button size="sm" variant="ghost" onClick={() => void act(() => api.delete(`/friends/requests/${r.id}`), 'Request cancelled')}>
                      Cancel
                    </Button>
                  </Row>
                ))}
              </ul>
            </section>
          </div>
        )}

        {tab === 'find' && <FindTab />}
      </div>
    </div>
  )
}
