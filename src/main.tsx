import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { PadDiagnostics } from './PadDiagnostics'
import './index.css'

// ?pad-test opens a diagnostic page for the signature box (no login, nothing saved). Preview only.
const diagnostics = new URLSearchParams(window.location.search).has('pad-test')

if (diagnostics) {
  // No offline copy on the test page: always the latest version, never a stale one.
  void navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()))
} else {
  registerSW({ immediate: true })
}

/** Diagnostic only: show a render crash on screen instead of a blank page. */
class ShowErrors extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e) }
  }
  componentDidCatch(_e: unknown, info: ErrorInfo) {
    this.setState((s) => ({ error: `${s.error ?? ''}\n--- where ---${info.componentStack ?? ''}` }))
  }
  render() {
    return this.state.error ? (
      <pre style={{ whiteSpace: 'pre-wrap', font: '12px monospace', background: '#fee2e2', color: '#7f1d1d', padding: 8 }}>
        {'RENDER ERROR (please screenshot):\n'}
        {this.state.error}
      </pre>
    ) : (
      this.props.children
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {diagnostics ? (
      <ShowErrors>
        <PadDiagnostics />
      </ShowErrors>
    ) : (
      <App />
    )}
  </StrictMode>,
)
