import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'dark' | 'light' | 'system'

interface UiState {
  theme: Theme
  sound: boolean
  desktopNotifications: boolean
  setTheme: (t: Theme) => void
  setSound: (v: boolean) => void
  setDesktopNotifications: (v: boolean) => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      sound: true,
      desktopNotifications: false,
      setTheme: (theme) => set({ theme }),
      setSound: (sound) => set({ sound }),
      setDesktopNotifications: (desktopNotifications) => set({ desktopNotifications }),
    }),
    { name: 'chatz-ui', version: 1 },
  ),
)

export function resolveTheme(t: Theme): 'dark' | 'light' {
  if (t !== 'system') return t
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(t: Theme) {
  const resolved = resolveTheme(t)
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0f0f0f' : '#fbfbfb')
}
