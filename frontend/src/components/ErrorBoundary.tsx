import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/** Last line of defence: a crash in one screen shows a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('chatZ crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid h-dvh place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-3xl font-semibold">Something broke</h1>
          <p className="mt-2 mb-5 text-muted">Reload the page to continue. Your messages are safe.</p>
          <button className="rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
