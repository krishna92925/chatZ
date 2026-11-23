import { useEffect } from 'react'

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? '⌘' : 'Ctrl'

export interface ShortcutDoc {
  keys: string[]
  label: string
  group: 'Navigate' | 'Chat' | 'Message box'
}

export const SHORTCUTS: ShortcutDoc[] = [
  { keys: [MOD, 'K'], label: 'Search people, chats and messages', group: 'Navigate' },
  { keys: ['Alt', '↑'], label: 'Previous conversation', group: 'Navigate' },
  { keys: ['Alt', '↓'], label: 'Next conversation', group: 'Navigate' },
  { keys: [MOD, 'Shift', 'O'], label: 'Go to all chats', group: 'Navigate' },
  { keys: [MOD, 'Shift', 'U'], label: 'Go to friends', group: 'Navigate' },
  { keys: [MOD, ','], label: 'Open settings', group: 'Navigate' },
  { keys: ['?'], label: 'Show this list', group: 'Navigate' },
  { keys: [MOD, 'Shift', 'F'], label: 'Search in the open chat', group: 'Chat' },
  { keys: ['Esc'], label: 'Close a window, cancel reply or edit', group: 'Chat' },
  { keys: ['Enter'], label: 'Send message', group: 'Message box' },
  { keys: ['Shift', 'Enter'], label: 'New line', group: 'Message box' },
  { keys: ['↑'], label: 'Edit your last message (empty box)', group: 'Message box' },
]

function describe(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey && e.key.length > 1) parts.push('shift')
  else if (e.shiftKey && (e.ctrlKey || e.metaKey)) parts.push('shift')
  parts.push(e.key.toLowerCase())
  return parts.join('+')
}

const editable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
}

/** Global shortcuts. Keys without a modifier (like "?") are ignored while typing. */
export function useShortcuts(map: Record<string, (e: KeyboardEvent) => void>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      const combo = describe(e)
      const fn = map[combo]
      if (!fn) return
      const hasModifier = combo.includes('mod') || combo.includes('alt')
      if (!hasModifier && editable(e.target)) return
      e.preventDefault()
      fn(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [map])
}
