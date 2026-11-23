import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
  document.addEventListener('visibilitychange', cb)
  window.addEventListener('focus', cb)
  window.addEventListener('blur', cb)
  return () => {
    document.removeEventListener('visibilitychange', cb)
    window.removeEventListener('focus', cb)
    window.removeEventListener('blur', cb)
  }
}

/** True while the tab is visible and focused: the only time incoming messages count as read. */
export const usePageActive = () => useSyncExternalStore(subscribe, () => document.visibilityState === 'visible' && document.hasFocus())
