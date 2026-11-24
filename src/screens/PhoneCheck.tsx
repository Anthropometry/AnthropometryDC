/** F2: about 10 seconds to see that the camera, motion sensor and offline storage work. */
import { useState } from 'react'
import { fixFor, type PhoneCheckResult } from '../lib/phonecheck'
import { Button, ErrorText, Page, Title } from '../components/ui'

export interface PhoneCheckProps {
  run: () => Promise<PhoneCheckResult>
  /** Keeps the result on the phone and sends it; resolves false if it could not be sent yet. */
  save: (r: PhoneCheckResult) => Promise<boolean>
  onBack: () => void
}

function Row({ ok, label, detail, fix }: { ok: boolean; label: string; detail?: string | null; fix: string | null }) {
  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <p className="font-semibold">
        <span aria-hidden="true" className={ok ? 'text-emerald-700' : 'text-red-700'}>
          {ok ? '✓' : '✗'}
        </span>{' '}
        {label}: {ok ? 'OK' : 'Problem'}
        {detail ? <span className="font-normal text-slate-500"> · {detail}</span> : null}
      </p>
      {fix && <p className="mt-1 text-sm text-slate-700">{fix}</p>}
    </li>
  )
}

export function PhoneCheck({ run, save, onBack }: PhoneCheckProps) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [result, setResult] = useState<PhoneCheckResult | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  async function start() {
    setState('running')
    setError('')
    setNote('')
    try {
      const r = await run()
      setResult(r)
      setState('done')
      const sent = await save(r)
      setNote(sent ? 'Result saved.' : 'Result kept on this phone; it is sent when you are online.')
    } catch {
      setState('idle')
      setError('The check could not run. Try again.')
    }
  }

  return (
    <Page>
      <Title>Check this phone</Title>
      <p className="text-slate-600">
        About 10 seconds. The camera opens only to test it: no picture is taken or saved. Allow the camera and
        motion if asked.
      </p>
      <ErrorText>{error}</ErrorText>
      {state !== 'done' && (
        <Button onClick={() => void start()} disabled={state === 'running'}>
          {state === 'running' ? 'Checking…' : 'Start the check'}
        </Button>
      )}
      {result && (
        <>
          <p
            role="status"
            className={`rounded-xl p-4 text-center text-lg font-semibold ${result.passed ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}
          >
            {result.passed ? 'This phone is ready.' : 'This phone needs attention.'}
          </p>
          <ul className="flex flex-col gap-2">
            <Row ok={result.cameraOk} label="Camera" detail={result.cameraResolution} fix={fixFor('camera', result)} />
            <Row ok={result.motionOk} label="Motion sensor" fix={fixFor('motion', result)} />
            <Row ok={result.photosOk} label="Study photos (face blur)" fix={fixFor('photos', result)} />
            <Row
              ok={result.storageOk}
              label="Offline storage"
              detail={result.storageMb !== null ? `${result.storageMb.toLocaleString()} MB` : null}
              fix={fixFor('storage', result)}
            />
          </ul>
          <p className="text-sm text-slate-600">
            Phone: {[result.phoneModel, result.os, result.browser].filter(Boolean).join(' · ') || 'unknown'}
          </p>
          {note && <p className="text-sm">{note}</p>}
          <Button variant="secondary" onClick={() => void start()}>
            Check again
          </Button>
        </>
      )}
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </Page>
  )
}
