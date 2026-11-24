/**
 * F7 "Waiting to send" (specs/F7-sync.md): what is still on this phone, how much there is to send,
 * when the last send worked, Send now, and anything that needs attention with a plain reason.
 * Never a name: participants show as their practice number (or a short id).
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, OfflineBanner, Page, Title } from '../components/ui'
import type { SyncKind, SyncSummary } from '../lib/sync'

export interface SyncScreenProps {
  online: boolean
  load: () => Promise<{ summary: SyncSummary; labels: Record<string, string> }>
  lastSentAt: string | null
  sendNow: () => Promise<void>
  onBack: () => void
}

const KIND: Record<SyncKind, string> = { consent: 'consent', measurement: 'measurements', photo: 'photos' }

export const showMb = (bytes: number) => (bytes < 100_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`)

function when(iso: string | null): string {
  if (!iso) return 'not yet'
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return today ? `today ${time}` : `${d.toLocaleDateString()} ${time}`
}

export function SyncScreen({ online, load, lastSentAt, sendNow, onBack }: SyncScreenProps) {
  const [data, setData] = useState<{ summary: SyncSummary; labels: Record<string, string> } | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    void load()
      .then(setData)
      .catch(() => undefined)
  }, [load])
  useEffect(reload, [reload])

  const s = data?.summary
  const total = s ? s.consents + s.measurements + s.photos : 0
  return (
    <Page>
      <OfflineBanner online={online} />
      <Title>Waiting to send</Title>
      {!s ? (
        <p className="text-slate-600">Checking this phone…</p>
      ) : total === 0 ? (
        <p role="status" className="rounded-xl bg-emerald-50 p-4 text-center font-semibold text-emerald-900">
          All saved. Nothing is waiting on this phone.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1 rounded-xl border border-slate-200 p-4" aria-label="Waiting">
            <li>Consents: {s.consents}</li>
            <li>Measurement changes: {s.measurements}</li>
            <li>Photos: {s.photos}</li>
            <li className="text-sm text-slate-600">About {showMb(s.bytes)} still to send.</li>
          </ul>
          {s.stuck > 0 && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-900">
              {s.stuck} participant{s.stuck > 1 ? 's need' : ' needs'} attention. Nothing is deleted.
            </p>
          )}
          <ul className="flex flex-col gap-2" aria-label="Participants waiting">
            {s.participants.map((p) => (
              <li key={p.participantId} className={`rounded-xl border p-3 ${p.stuck ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
                <p className="font-mono font-semibold">{data.labels[p.participantId] ?? `ID ${p.participantId.slice(0, 4).toUpperCase()}`}</p>
                <p className="text-sm text-slate-700">Waiting: {p.kinds.map((k) => KIND[k]).join(', ')}</p>
                {p.reason && <p className="text-sm font-semibold text-red-800">{p.reason}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-sm text-slate-600">Last sent: {when(lastSentAt)}. While the app is open and there is signal, it keeps trying by itself.</p>
      <Button
        disabled={!online || busy || total === 0}
        onClick={() => {
          setBusy(true)
          void sendNow().finally(() => {
            setBusy(false)
            reload()
          })
        }}
      >
        {busy ? 'Sending…' : online ? 'Send now' : 'Send now (no signal)'}
      </Button>
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </Page>
  )
}
