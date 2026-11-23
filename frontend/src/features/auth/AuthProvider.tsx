import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/auth-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { disconnectSocket } from '@/lib/socket'
import { useChat } from '@/stores/chat'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'SIGNED_OUT') {
        // nothing of the previous person may survive: caches, drafts, open chat, socket
        disconnectSocket()
        qc.clear()
        useChat.getState().reset()
      }
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [qc])

  const value = useMemo(() => ({ session, loading }), [session, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
