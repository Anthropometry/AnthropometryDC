/**
 * F4: new participant → consent (adult, or guardian + child assent) → receipt code.
 * Consent comes before any measurement or photo (POLICY §10). After saving, the name and signature
 * are never shown again; they go to the offline queue and leave the phone once the server confirms.
 */
import { useEffect, useState, type ComponentType } from 'react'
import { padLog } from '../lib/padLog'
import type { ConsentText } from '../lib/consentText'
import type { ConsentJob, SignatureSlot } from '../lib/consentQueue'
import type { AgeGroup } from '../lib/practice'
import { formatReceipt, newReceiptCode } from '../lib/receipt'
import { SignaturePad, type PadProps } from '../components/SignaturePad'
import { Button, Choice, ErrorText, Field, ModeBanner, Page, Title } from '../components/ui'

export interface ConsentFlowProps {
  isPractice: boolean
  text: ConsentText
  collectorId: string
  /** Keep the job on the phone (and try to send it). */
  onSave: (job: ConsentJob) => Promise<void>
  onDone: () => void
  onBack: () => void
  /** F5: start measuring this participant straight after consent. */
  onMeasure?: (m: { participantId: string; isPractice: boolean; ageGroup: AgeGroup; intimateOk: boolean }) => void
  Pad?: ComponentType<PadProps>
  newId?: () => string
  newReceipt?: () => string
  now?: () => Date
}

type Step = 'age' | 'consent' | 'assent' | 'receipt' | 'stopped'

interface Agreement {
  /** The participant's name (the child's, for under-18s). */
  name: string
  /** Under-18 only. */
  guardian: string
  data: boolean
  photos: boolean
  /** Optional (F5): the more personal measurements. */
  intimate: boolean
  signature: Uint8Array | null
}

const EMPTY: Agreement = { name: '', guardian: '', data: false, photos: false, intimate: false, signature: null }

function Tick({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: string }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border-2 p-3 ${checked ? 'border-brand bg-emerald-50' : 'border-slate-300'}`}>
      <input type="checkbox" className="mt-1 h-6 w-6 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

export function ConsentFlow(p: ConsentFlowProps) {
  const Pad = p.Pad ?? SignaturePad
  const [step, setStep] = useState<Step>('age')
  const [age, setAge] = useState<AgeGroup | null>(null)
  const [agree, setAgree] = useState<Agreement>(EMPTY)
  const [childMark, setChildMark] = useState<Uint8Array | null>(null)
  const [receipt] = useState(() => (p.newReceipt ?? newReceiptCode)())
  const [participantId] = useState(() => (p.newId ?? (() => crypto.randomUUID()))())
  const [busy, setBusy] = useState(false)
  const [savedIntimate, setSavedIntimate] = useState(false)
  const [error, setError] = useState('')
  const now = p.now ?? (() => new Date())

  const forChild = age === 'child'
  const name = agree.name.trim()
  const guardian = agree.guardian.trim()
  const okName = (n: string) => n.length >= 1 && n.length <= 200
  const missing = [
    !agree.data && 'tick the measurements box',
    !agree.photos && 'tick the photos box',
    !okName(name) && (forChild ? "type the child's name" : 'type the name'),
    forChild && !okName(guardian) && "type the parent or guardian's name",
    agree.signature === null && 'sign in the box',
  ].filter((m): m is string => typeof m === 'string')
  const ready = missing.length === 0

  useEffect(() => {
    padLog('consent screen created')
    return () => padLog('consent screen REMOVED')
  }, [])
  useEffect(() => padLog(`step ${step}`), [step])
  const missingKey = missing.join(', ')
  useEffect(() => {
    if (step === 'consent') padLog(missingKey ? `still needed: ${missingKey}` : 'ready: Save is on')
  }, [missingKey, step])

  async function save(rejected: boolean) {
    setBusy(true)
    setError('')
    const signatures: Partial<Record<SignatureSlot, Uint8Array>> = {}
    if (!rejected) {
      signatures[forChild ? 'guardian' : 'participant'] = agree.signature!
      if (forChild && childMark) signatures.assent = childMark
    }
    const at = now().toISOString()
    const job: ConsentJob = {
      participantId,
      collectorId: p.collectorId,
      createdAt: at,
      isPractice: p.isPractice,
      ageGroup: age!,
      receiptCode: receipt,
      rejected,
      consent: rejected
        ? null
        : {
            participantName: name,
            guardianName: forChild ? guardian : null,
            language: 'en',
            consentVersion: p.text.version,
            childAssent: forChild ? true : null,
            agreedIntimate: agree.intimate,
            signedAt: at,
          },
      signatures,
      done: { participant: false, consent: false, signatures: [] },
    }
    try {
      await p.onSave(job)
      setSavedIntimate(!rejected && agree.intimate)
      // Forget the name and signatures on this screen straight away.
      setAgree(EMPTY)
      setChildMark(null)
      setStep(rejected ? 'stopped' : 'receipt')
    } catch {
      setError('Could not save on this phone. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <ModeBanner real={!p.isPractice} />
      <ErrorText>{error}</ErrorText>

      {step === 'age' && (
        <>
          <Title>New participant</Title>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-lg font-semibold">Age group</legend>
            <Choice chosen={age === 'adult'} onClick={() => setAge('adult')}>
              Adult (18 or older)
            </Choice>
            <Choice chosen={age === 'child'} onClick={() => setAge('child')}>
              Under 18
            </Choice>
          </fieldset>
          <p className="text-sm text-slate-600">Consent is in English for now. French and Twi come once translated.</p>
          <Button disabled={!age} onClick={() => setStep('consent')}>
            Next: consent
          </Button>
          <Button variant="secondary" onClick={p.onBack}>
            Back to Home
          </Button>
        </>
      )}

      {step === 'consent' && (
        <>
          <Title>{forChild ? 'Consent from parent or guardian' : 'Consent'}</Title>
          <p className="text-sm text-slate-600">Read this out, or let them read it.</p>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 text-lg leading-relaxed">
            {p.text.body(forChild).map((para) => (
              <p key={para}>{para}</p>
            ))}
          </div>
          <Tick checked={agree.data} onChange={(v) => setAgree((a) => ({ ...a, data: v }))}>
            {p.text.tickData(forChild)}
          </Tick>
          <Tick checked={agree.photos} onChange={(v) => setAgree((a) => ({ ...a, photos: v }))}>
            {p.text.tickPhotos(forChild)}
          </Tick>
          <Tick checked={agree.intimate} onChange={(v) => setAgree((a) => ({ ...a, intimate: v }))}>
            {p.text.tickIntimate(forChild)}
          </Tick>
          <Field
            label={forChild ? "Child's name" : "Participant's name"}
            value={agree.name}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => setAgree((a) => ({ ...a, name: e.target.value }))}
          />
          {forChild && (
            <Field
              label="Parent or guardian's name"
              value={agree.guardian}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setAgree((a) => ({ ...a, guardian: e.target.value }))}
            />
          )}
          <Pad
            label={forChild ? "Parent or guardian's signature" : "Participant's signature"}
            onChange={(png) => setAgree((a) => ({ ...a, signature: png }))}
          />
          {!ready && (
            <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-950">
              Still needed: {missing.join(', ')}.
            </p>
          )}
          <Button disabled={!ready || busy} onClick={() => (forChild ? setStep('assent') : void save(false))}>
            {forChild ? 'Next: ask the child' : busy ? 'Saving…' : 'Save consent'}
          </Button>
          <Button variant="secondary" onClick={() => setStep('age')}>
            Back
          </Button>
        </>
      )}

      {step === 'assent' && (
        <>
          <Title>Ask the child</Title>
          <p className="text-sm text-slate-600">Read this to the child in simple words.</p>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 text-lg leading-relaxed">
            {p.text.assent.map((para) => (
              <p key={para}>{para}</p>
            ))}
          </div>
          <Pad label="Child's mark (optional)" onChange={setChildMark} />
          <Button disabled={busy} onClick={() => void save(false)}>
            Yes, the child agrees
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void save(true)}>
            No, the child does not agree
          </Button>
        </>
      )}

      {step === 'receipt' && (
        <>
          <Title>Consent saved</Title>
          <div role="status" className="rounded-xl bg-emerald-50 p-4 text-center">
            <p>Receipt code</p>
            <p className="mt-1 font-mono text-4xl font-bold tracking-widest">{formatReceipt(receipt)}</p>
          </div>
          <p>
            Write this code on a slip for the participant. They give it to the project lead to see or withdraw their
            data at any time.
          </p>
          {p.onMeasure ? (
            <Button
              onClick={() =>
                p.onMeasure!({ participantId, isPractice: p.isPractice, ageGroup: age!, intimateOk: savedIntimate })
              }
            >
              Start measurements
            </Button>
          ) : null}
          <Button variant={p.onMeasure ? 'secondary' : 'primary'} onClick={p.onDone}>
            {p.onMeasure ? 'Measure later' : 'Done'}
          </Button>
        </>
      )}

      {step === 'stopped' && (
        <>
          <Title>Stopped</Title>
          <p role="status" className="rounded-xl bg-amber-50 p-4 text-lg">
            Thank the child. Nothing about them was recorded.
          </p>
          <Button onClick={p.onDone}>Back to Home</Button>
        </>
      )}
    </Page>
  )
}
