import { useEffect, useRef, useState } from 'react'

const GROUPS: Record<string, string[]> = {
  '😀': ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😜', '🤪', '😎', '🤓', '🥳', '😏', '😒', '😔', '😢', '😭', '😤', '😡', '🤯', '😱', '😴', '🤔', '🤗', '🙄', '😬', '🥺', '😌', '😮', '🤐'],
  '👍': ['👍', '👎', '👏', '🙌', '🙏', '🤝', '💪', '👌', '✌️', '🤞', '🤟', '🤘', '👋', '🤙', '👀', '🧠', '🫶', '🫡', '🤌', '☝️', '👆', '👇', '👉', '👈'],
  '❤️': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💖', '💗', '💓', '💕', '✨', '🔥', '💯', '🎉', '🎊', '🎁', '⭐', '🌟', '💫', '⚡'],
  '🍕': ['🍕', '🍔', '🍟', '🌮', '🍜', '🍣', '🍩', '🍪', '🎂', '🍫', '🍿', '☕', '🍵', '🍺', '🍷', '🥂', '🍎', '🍌', '🍓', '🥑', '🥗', '🍞', '🧀', '🍦'],
  '🐶': ['🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐔', '🐧', '🦄', '🐝', '🦋', '🌸', '🌹', '🌻', '🌈', '☀️', '🌙', '⛅'],
  '⚽': ['⚽', '🏀', '🏏', '🎾', '🏐', '🎮', '🎧', '🎬', '🎵', '📚', '✈️', '🚗', '🏠', '💻', '📱', '📸', '🎯', '🏆', '⏰', '💡', '🔒', '🎈', '🧿', '🪔'],
}

export function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState(Object.keys(GROUPS)[0]!)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const down = (e: MouseEvent) => !root.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])

  return (
    <div ref={root} role="dialog" aria-label="Emoji picker" className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-2xl border border-line bg-panel shadow-xl">
      <div className="flex border-b border-line px-1.5 pt-1.5">
        {Object.keys(GROUPS).map((g) => (
          <button key={g} type="button" onClick={() => setTab(g)} aria-label={`Emoji group ${g}`} aria-pressed={tab === g} className={`flex-1 rounded-t-lg py-1.5 text-lg ${tab === g ? 'bg-raised' : 'hover:bg-hover'}`}>
            {g}
          </button>
        ))}
      </div>
      <div className="grid h-52 grid-cols-8 content-start gap-0.5 overflow-y-auto p-2">
        {GROUPS[tab]!.map((e) => (
          <button key={e} type="button" onClick={() => onPick(e)} className="grid aspect-square place-items-center rounded-lg text-xl hover:bg-hover">
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
