import { Modal } from '@/components/Modal'
import { SHORTCUTS } from './shortcuts'

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups = ['Navigate', 'Chat', 'Message box'] as const
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" size="md">
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g}>
            <h3 className="mb-2 text-[13px] font-medium text-muted">{g}</h3>
            <ul className="space-y-1.5">
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
                  <span>{s.label}</span>
                  <span className="flex shrink-0 gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="min-w-6 rounded-md border border-line bg-raised px-1.5 py-0.5 text-center font-mono text-xs">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
