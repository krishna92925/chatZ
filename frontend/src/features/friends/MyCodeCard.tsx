import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowsClockwise, Check, Copy, ShareNetwork } from '@phosphor-icons/react'
import type { MeResponse, Profile } from '@shared/types'
import { api, apiMessage } from '@/lib/api'
import { Button } from '@/components/ui'
import { Confirm } from '@/components/Confirm'
import { keys } from '@/features/chat/queries'

export function MyCodeCard({ profile }: { profile: Profile }) {
  const qc = useQueryClient()
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const link = `${window.location.origin}/friends?code=${profile.connectCode}`

  useEffect(() => {
    let alive = true
    void import('qrcode').then(({ default: QR }) =>
      QR.toDataURL(link, { margin: 1, width: 360, color: { dark: '#0f0f0f', light: '#fbfbfb' } }).then((url) => alive && setQr(url)),
    )
    return () => {
      alive = false
    }
  }, [link])

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(`${what} copied`)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy to the clipboard.')
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Add me on chatZ', text: `Add me on chatZ: @${profile.username}`, url: link })
      } catch {
        /* cancelled */
      }
      return
    }
    void copy(link, 'Link')
  }

  async function regenerate() {
    setBusy(true)
    try {
      const r = await api.post<Profile>('/me/connect-code/regenerate')
      qc.setQueryData<MeResponse>(keys.me, (m) => (m ? { ...m, profile: r.data } : m))
      setConfirm(false)
      toast.success('New connect code created. The old one no longer works.')
    } catch (e) {
      toast.error(apiMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-line bg-panel p-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="size-36 shrink-0 overflow-hidden rounded-2xl bg-[#fbfbfb] p-1.5">{qr ? <img src={qr} alt="QR code for your connect link" className="size-full" /> : <div className="skeleton size-full" />}</div>
      <div className="w-full min-w-0 text-center sm:text-left">
        <p className="text-[13px] text-muted">Your connect code</p>
        <p className="my-1 font-mono text-2xl tracking-[0.18em] select-all">{profile.connectCode}</p>
        <p className="mb-3 text-[13px] text-muted">Friends can enter it, scan the QR code or open your link to find you.</p>
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <Button size="sm" variant="subtle" onClick={() => void copy(profile.connectCode, 'Code')} icon={copied ? <Check size={15} /> : <Copy size={15} />}>
            Copy code
          </Button>
          <Button size="sm" variant="subtle" onClick={() => void share()} icon={<ShareNetwork size={15} />}>
            Share link
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} icon={<ArrowsClockwise size={15} />}>
            New code
          </Button>
        </div>
      </div>
      <Confirm open={confirm} title="Create a new connect code?" message="Your current code and QR code will stop working. People who are already your friends are not affected." confirmLabel="Create new code" busy={busy} onConfirm={() => void regenerate()} onClose={() => setConfirm(false)} />
    </div>
  )
}
