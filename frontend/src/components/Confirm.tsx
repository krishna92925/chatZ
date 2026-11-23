import { Button } from './ui'
import { Modal } from './Modal'

export function Confirm({ open, title, message, confirmLabel, danger, busy, onConfirm, onClose }: { open: boolean; title: string; message: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="mb-5 text-muted">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} className={danger ? 'bg-[color-mix(in_srgb,var(--c-danger)_16%,transparent)] font-semibold' : ''} onClick={onConfirm} loading={busy} data-autofocus>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
