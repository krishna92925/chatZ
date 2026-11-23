import { useEffect } from 'react'
import { RouterProvider } from 'react-router'
import { LazyMotion, domAnimation } from 'motion/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import axios from 'axios'
import { isConfigured } from '@/lib/env'
import { applyTheme, useUi } from '@/stores/ui'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { router } from './routes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(axios.isAxiosError(err) && err.response && err.response.status < 500) && count < 2,
    },
  },
})

function ConfigError() {
  return (
    <div className="grid h-dvh place-items-center px-6">
      <div className="max-w-md">
        <h1 className="font-display text-3xl font-semibold">chatZ is not configured</h1>
        <p className="mt-3 text-muted">
          Set <code className="font-mono text-fg">VITE_SUPABASE_URL</code> and <code className="font-mono text-fg">VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code className="font-mono text-fg">frontend/.env</code> (or in your host's environment settings), then restart the dev server or rebuild.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const theme = useUi((s) => s.theme)
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])

  if (!isConfigured) return <ConfigError />
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domAnimation} strict>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
        <Toaster
          position="top-center"
          theme={theme === 'system' ? 'system' : theme}
          toastOptions={{ style: { background: 'var(--c-panel)', color: 'var(--c-fg)', border: '1px solid var(--c-line)', borderRadius: '16px', fontFamily: 'var(--font-sans)' } }}
        />
      </LazyMotion>
    </QueryClientProvider>
    </ErrorBoundary>
  )
}
