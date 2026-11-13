/** Install help (specs/F1-login.md, screen 5). Hidden once the app runs installed. */
import { useEffect, useState } from 'react'
import { installMode, type InstallMode } from '../lib/install'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Chrome can fire this before React mounts, so capture it as early as the module loads.
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
}

export function useInstallMode(): { mode: InstallMode; install: () => Promise<void> } {
  const [, setTick] = useState(0)
  useEffect(() => {
    const l = () => setTick((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  const mode = installMode({
    userAgent: navigator.userAgent,
    standalone: isStandalone(),
    hasPrompt: deferred !== null,
    maxTouchPoints: navigator.maxTouchPoints,
  })
  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    deferred = null
    listeners.forEach((l) => l())
  }
  return { mode, install }
}

export function InstallHelp({ mode, onInstall }: { mode: InstallMode; onInstall: () => void }) {
  if (mode === 'installed') return null
  return (
    <section className="rounded-xl border border-slate-200 p-4" aria-label="Install the app">
      <h2 className="mb-2 font-semibold">Install the app</h2>
      {(mode === 'ios-safari' || mode === 'ios-other-browser') && (
        <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-900">
          On iPhone, add the app to your Home Screen: otherwise the phone may clear the data saved on it after about a week unused.
        </p>
      )}
      {mode === 'android-button' && (
        <button type="button" onClick={onInstall} className="w-full rounded-xl bg-brand py-4 text-lg font-semibold text-white">
          Install app
        </button>
      )}
      {mode === 'android-menu' && <p>In Chrome, tap the ⋮ menu (top right), then <b>Add to Home screen</b>.</p>}
      {mode === 'ios-safari' && (
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Tap <b>Share</b> <span aria-hidden="true">(square with an arrow ⬆)</span> at the bottom of Safari. Newer
            iPhones: tap <b>•••</b> (bottom right) first, then Share.
          </li>
          <li>
            Scroll down and tap <b>Add to Home Screen</b> <span aria-hidden="true">(⊞)</span>.
          </li>
          <li>
            Tap <b>Add</b> (leave <b>Open as Web App</b> on if you see it). Open Anthro Collect from your Home Screen.
          </li>
        </ol>
      )}
      {mode === 'ios-other-browser' && (
        <p>
          To install on iPhone, open this link in <b>Safari</b>, then use Share (or ••• → Share) → <b>Add to Home Screen</b>.
        </p>
      )}
      {mode === 'other' && <p>Open this link on your phone: Chrome on Android or Safari on iPhone.</p>}
    </section>
  )
}

export function InstallArea() {
  const { mode, install } = useInstallMode()
  return <InstallHelp mode={mode} onInstall={() => void install()} />
}
