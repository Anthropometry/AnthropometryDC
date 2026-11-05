import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from './lib/supabase'

type Health = 'checking' | 'ok' | 'offline'

export default function App() {
  const [health, setHealth] = useState<Health>('checking')
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    fetch('/api/health')
      .then((r) => setHealth(r.ok ? 'ok' : 'offline'))
      .catch(() => setHealth('offline'))
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 py-8 text-slate-900">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium uppercase tracking-wide text-brand">
          Ashesi University · Student research project
        </p>
        <h1 className="text-3xl font-bold">Anthro Collect</h1>
        <p className="text-slate-600">
          Recording consent, tape measurements and face-blurred photos for a student research
          project at Ashesi University.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 p-4">
        <h2 className="mb-2 font-semibold">Setup status</h2>
        <ul className="space-y-1 text-sm">
          <li>Network: {online ? 'online' : 'offline'}</li>
          <li>Server: {health}</li>
          <li>Login service: {isSupabaseConfigured ? 'configured' : 'not configured yet'}</li>
        </ul>
      </section>

      <p className="text-sm text-slate-500">
        Collectors sign in with their phone number and 6-digit PIN (coming in F1). To install,
        open this link in Chrome (Android) or Safari (iPhone) and choose Add to Home Screen.
      </p>
    </main>
  )
}
