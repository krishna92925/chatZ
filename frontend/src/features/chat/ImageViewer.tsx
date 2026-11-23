import { useEffect } from 'react'
import { CaretLeft, CaretRight, DownloadSimple, X } from '@phosphor-icons/react'
import type { Attachment } from '@shared/types'
import { absUrl } from '@/lib/api'
import { IconButton } from '@/components/ui'
import { Modal } from '@/components/Modal'

export function ImageViewer({ images, index, onIndex, onClose }: { images: Attachment[]; index: number | null; onIndex: (i: number) => void; onClose: () => void }) {
  const open = index !== null && images[index] !== undefined
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index! > 0) onIndex(index! - 1)
      if (e.key === 'ArrowRight' && index! < images.length - 1) onIndex(index! + 1)
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [open, index, images.length, onIndex])

  const img = open ? images[index!]! : null
  return (
    <Modal open={open} onClose={onClose} bare size="lg">
      {img && (
        <div className="relative bg-black">
          <img src={absUrl(img.url)} alt={img.name} className="mx-auto max-h-[80dvh] w-auto max-w-full object-contain" />
          <div className="absolute top-2 right-2 flex gap-1 rounded-full bg-black/55 p-1 text-white">
            <a href={absUrl(img.url)} download={img.name} target="_blank" rel="noopener noreferrer" aria-label="Download" className="grid size-9 place-items-center rounded-full hover:bg-white/15">
              <DownloadSimple size={18} />
            </a>
            <IconButton label="Close" onClick={onClose} size={36} className="text-white hover:bg-white/15 hover:text-white">
              <X size={18} />
            </IconButton>
          </div>
          {index! > 0 && (
            <button type="button" aria-label="Previous image" onClick={() => onIndex(index! - 1)} className="absolute top-1/2 left-2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75">
              <CaretLeft size={20} />
            </button>
          )}
          {index! < images.length - 1 && (
            <button type="button" aria-label="Next image" onClick={() => onIndex(index! + 1)} className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75">
              <CaretRight size={20} />
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}
