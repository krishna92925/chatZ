/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react'
import { Link, Navigate, Outlet, createBrowserRouter } from 'react-router'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { useMe } from '@/features/chat/queries'

const AuthPage = lazy(() => import('@/features/auth/AuthPage').then((m) => ({ default: m.AuthPage })))
const Onboarding = lazy(() => import('@/features/onboarding/Onboarding').then((m) => ({ default: m.Onboarding })))
const AppShell = lazy(() => import('@/features/shell/AppShell').then((m) => ({ default: m.AppShell })))
const ChatsLayout = lazy(() => import('@/features/chat/ChatsLayout').then((m) => ({ default: m.ChatsLayout })))
const ChatView = lazy(() => import('@/features/chat/ChatView').then((m) => ({ default: m.ChatView })))
const FriendsPage = lazy(() => import('@/features/friends/FriendsPage').then((m) => ({ default: m.FriendsPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function Splash() {
  return (
    <div className="grid h-dvh place-items-center bg-app" role="status" aria-label="Loading">
      <Logo size={64} animate />
    </div>
  )
}

function GuestRoute() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}

function SessionRoute() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/auth" replace />
  return <Outlet />
}

function ProfileRoute() {
  const me = useMe()
  if (me.isPending) return <Splash />
  if (me.isError) {
    return (
      <div className="grid h-dvh place-items-center px-6 text-center">
        <div>
          <Logo size={48} className="mx-auto mb-5" />
          <h1 className="font-display text-2xl font-semibold">We could not reach chatZ</h1>
          <p className="mt-1.5 mb-5 text-muted">Check your connection and try again.</p>
          <Button onClick={() => void me.refetch()}>Try again</Button>
        </div>
      </div>
    )
  }
  if (!me.data.profile) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

function NotFound() {
  return (
    <div className="grid flex-1 place-items-center px-6 text-center">
      <div>
        <h1 className="font-display text-5xl font-semibold">404</h1>
        <p className="mt-2 mb-5 text-muted">That page does not exist.</p>
        <Link to="/chats" className="font-semibold text-accent-text">
          Back to chats
        </Link>
      </div>
    </div>
  )
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Splash />}>{children}</Suspense>
}

export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [{ path: '/auth', element: <Lazy><AuthPage /></Lazy> }],
  },
  {
    element: <SessionRoute />,
    children: [
      { path: '/onboarding', element: <Lazy><Onboarding /></Lazy> },
      {
        element: <ProfileRoute />,
        children: [
          {
            element: <Lazy><AppShell /></Lazy>,
            children: [
              { index: true, element: <Navigate to="/chats" replace /> },
              {
                path: 'chats',
                element: <Lazy><ChatsLayout /></Lazy>,
                children: [{ path: ':id', element: <Lazy><ChatView /></Lazy> }],
              },
              { path: 'friends', element: <Lazy><FriendsPage /></Lazy> },
              { path: 'settings/:section?', element: <Lazy><SettingsPage /></Lazy> },
              { path: '*', element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
])
