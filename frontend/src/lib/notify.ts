let ctx: AudioContext | null = null

/** A short two-note ping made with WebAudio, so no sound file has to be shipped. */
export function playPing() {
  try {
    ctx ??= new AudioContext()
    const audio = ctx
    if (audio.state === 'suspended') void audio.resume()
    const now = audio.currentTime
    ;[660, 880].forEach((freq, i) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.09)
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.09 + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.22)
      osc.connect(gain).connect(audio.destination)
      osc.start(now + i * 0.09)
      osc.stop(now + i * 0.09 + 0.25)
    })
  } catch {
    /* audio is optional */
  }
}

export const desktopSupported = () => typeof Notification !== 'undefined'
export const desktopPermission = (): NotificationPermission | 'unsupported' => (desktopSupported() ? Notification.permission : 'unsupported')

export async function requestDesktopPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!desktopSupported()) return 'unsupported'
  return Notification.requestPermission()
}

export function showDesktopNotification(title: string, body: string, onClick: () => void, tag: string) {
  if (!desktopSupported() || Notification.permission !== 'granted') return
  const n = new Notification(title, { body, tag, silent: true })
  n.onclick = () => {
    window.focus()
    onClick()
    n.close()
  }
}
