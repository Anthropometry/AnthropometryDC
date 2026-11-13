import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { setUpdateReady } from './lib/update'
import './index.css'

// F7: a new version waits; it is never loaded in the middle of a participant (src/lib/update.ts).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    setUpdateReady(() => updateSW(true))
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
