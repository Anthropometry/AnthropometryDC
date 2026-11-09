import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { PadAB } from './diagnostics/PadAB'
import './index.css'

// ?pad-ab: temporary side-by-side test of the old and new signature box (no login, nothing saved).
// It keeps no offline copy, so a phone always gets the latest version of the test.
const padAB = new URLSearchParams(window.location.search).has('pad-ab')
if (padAB) {
  void navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()))
} else {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')!).render(<StrictMode>{padAB ? <PadAB /> : <App />}</StrictMode>)
