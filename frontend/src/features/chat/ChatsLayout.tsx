import { Outlet, useMatch } from 'react-router'
import { ChatsCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/format'
import { useChat } from '@/stores/chat'
import { useProfile } from '@/features/auth/useProfile'
import { ConversationList } from './ConversationList'

/** List on the left, open chat on the right. On phones only one of the two is shown at a time. */
export function ChatsLayout() {
  const open = useMatch('/chats/:id')
  const profile = useProfile()
  const setSwitcherOpen = useChat((s) => s.setSwitcherOpen)
  return (
    <div className="flex min-h-0 flex-1">
      <aside className={cn('w-full shrink-0 flex-col border-r border-line bg-panel md:flex md:w-[22rem] lg:w-[25rem]', open ? 'hidden' : 'flex')}>
        <ConversationList meId={profile.id} onNew={() => setSwitcherOpen(true)} />
      </aside>
      <div className={cn('min-w-0 flex-1 flex-col md:flex', open ? 'flex' : 'hidden')}>
        {open ? (
          <Outlet />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-center md:flex">
            <ChatsCircle size={56} weight="duotone" className="text-accent-text" />
            <h2 className="font-display text-2xl font-semibold">Pick a chat to start</h2>
            <p className="max-w-xs text-muted">Press Ctrl+K to search for people and conversations.</p>
          </div>
        )}
      </div>
    </div>
  )
}
