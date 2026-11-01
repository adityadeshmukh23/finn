import { Component, type ErrorInfo, type ReactNode } from 'react'

/** A render error shows this instead of a blank page. Saved settings are the one thing a reload can't fix. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FINN render error', error, info.componentStack)
  }

  reset = () => {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('finn.')).forEach((k) => localStorage.removeItem(k))
    } catch { /* storage unavailable: nothing to clear */ }
    window.location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto max-w-xl px-4 pt-[max(2rem,env(safe-area-inset-top))]">
        <h1 className="text-title font-bold text-ink">Something went wrong on this screen</h1>
        <p className="mt-1 text-ink-2">Your data is untouched. Reloading usually fixes it.</p>
        <div className="mt-4 flex gap-2">
          <button onClick={() => window.location.reload()}
                  className="min-h-11 rounded-full bg-ink px-4 font-semibold text-bg">Reload</button>
          <button onClick={this.reset}
                  className="min-h-11 rounded-full border border-line px-4 text-ink-2">Clear saved settings</button>
        </div>
      </div>
    )
  }
}
