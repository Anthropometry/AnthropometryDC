import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { PadDiagnostics } from './PadDiagnostics'
import './index.css'

registerSW({ immediate: true })

// ?pad-test opens a diagnostic page for the signature box (no login, nothing saved). Preview only.
const diagnostics = new URLSearchParams(window.location.search).has('pad-test')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{diagnostics ? <PadDiagnostics /> : <App />}</StrictMode>,
)
