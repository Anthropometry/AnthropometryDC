/**
 * F5: measuring one consented participant (specs/F5-measurements.md).
 * About (sex, age, clothing) → "Before you start" → one screen per measurement → summary → Finish.
 * Every change is saved on the phone at once (MeasureStore) and sent later; the database checks it again.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEF,
  DOUBLE,
  INTIMATE,
  disagreements,
  needsThird,
  readingTenths,
  setFor,
  showCm,
  unusual,
  valueTenths,
  type Code,
  type Sex,
  type Unit,
} from '../lib/measurements'
import type { About, Clothing, Entry, HeightMethod, MeasureDraft, SkipReason } from '../lib/measureQueue'
import { BodyFigure } from '../components/BodyFigure'
import { ReadingPad } from '../components/ReadingPad'
import { Button, Choice, ErrorText, Field, ModeBanner, Page, Title } from '../components/ui'

export interface MeasureStore {
  about: (d: MeasureDraft, a: About) => Promise<MeasureDraft>
  entry: (d: MeasureDraft, e: Entry) => Promise<MeasureDraft>
  finish: (d: MeasureDraft) => Promise<MeasureDraft>
}

export interface MeasureFlowProps {
  draft: MeasureDraft
  /** The collector's tape (Settings). */
  unit: Unit
  store: MeasureStore
  onDone: () => void
  onBack: () => void
  now?: () => Date
}

const REASONS: { value: Exclude<SkipReason, 'declined_at_consent'>; label: string }[] = [
  { value: 'declined', label: 'Participant declined' },
  { value: 'could_not_measure', label: 'Could not measure (injury, cast, clothing)' },
  { value: 'other', label: 'Other' },
]
const REASON_TEXT: Record<SkipReason, string> = {
  declined: 'participant declined',
  could_not_measure: 'could not measure',
  other: 'other',
  declined_at_consent: 'declined at consent',
}

type Step = 'about' | 'intro' | 'measure' | 'summary'
type Prompt = { kind: 'unusual' | 'disagree'; text: string } | null

/** Value in tenths of a stored entry (null if skipped or incomplete). */
export function entryTenths(e: Entry | undefined): number | null {
  if (!e || e.skipped || !e.unit) return null
  const t = e.readingsTyped.map((r) => readingTenths(r, e.unit!))
  if (t.some((x) => x === null)) return null
  const add = e.heightMethod === 'wall_100' ? 1000 : 0
  return valueTenths(
    (t as number[]).map((x) => x + add),
    DOUBLE.has(e.code),
  )
}

function About_({ draft, onSaved }: { draft: MeasureDraft; onSaved: (a: About) => Promise<void> }) {
  const [sex, setSex] = useState<Sex | null>(draft.about?.sex ?? null)
  const [age, setAge] = useState(draft.about ? String(draft.about.ageYears) : '')
  const [clothing, setClothing] = useState<Clothing | null>(draft.about?.clothing ?? null)
  const [error, setError] = useState('')
  const n = Number(age)
  const child = draft.ageGroup === 'child'
  const ageOk = /^\d{1,3}$/.test(age) && (child ? n >= 8 && n <= 17 : n >= 18 && n <= 100)
  const tooYoung = child && /^\d{1,2}$/.test(age) && n < 8
  return (
    <>
      <Title>About the participant</Title>
      <p className="text-sm text-slate-600">Asked once. Sex and age choose which measurements to take.</p>
      <ErrorText>{error}</ErrorText>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Sex</legend>
        <div className="grid grid-cols-2 gap-2">
          <Choice chosen={sex === 'female'} onClick={() => setSex('female')}>
            Female
          </Choice>
          <Choice chosen={sex === 'male'} onClick={() => setSex('male')}>
            Male
          </Choice>
        </div>
      </fieldset>
      <Field
        label={child ? 'Age in years (8 to 17)' : 'Age in years (18 or older)'}
        inputMode="numeric"
        maxLength={3}
        value={age}
        onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))}
      />
      {tooYoung && (
        <p role="status" className="rounded-lg bg-amber-50 p-3">
          Children under 8 are not measured in this study. Their consent is kept; nothing else is needed.
        </p>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Clothing worn</legend>
        <div className="grid grid-cols-3 gap-2">
          {(['light', 'medium', 'heavy'] as const).map((c) => (
            <Choice key={c} chosen={clothing === c} onClick={() => setClothing(c)}>
              {c[0].toUpperCase() + c.slice(1)}
            </Choice>
          ))}
        </div>
      </fieldset>
      <Button
        disabled={!sex || !ageOk || !clothing}
        onClick={() => {
          setError('')
          onSaved({ sex: sex!, ageYears: n, clothing: clothing! }).catch(() => setError('Could not save on this phone. Try again.'))
        }}
      >
        Next
      </Button>
    </>
  )
}

export function MeasureFlow({ draft: initial, unit, store, onDone, onBack, now = () => new Date() }: MeasureFlowProps) {
  const [draft, setDraft] = useState(initial)
  const started = Object.keys(initial.entries).length > 0
  const [step, setStep] = useState<Step>(!initial.about ? 'about' : started ? 'summary' : 'intro')
  const [error, setError] = useState('')

  const codes = useMemo(() => (draft.about ? setFor(draft.about.sex, draft.about.ageYears) : []), [draft.about])
  const declined = (c: Code) => INTIMATE.has(c) && !draft.intimateOk
  const screens = codes.filter((c) => !declined(c))

  // Without the intimate tick, those measurements are recorded as skipped ("declined at consent").
  const missingDeclines = codes.filter((c) => declined(c) && !draft.entries[c])
  useEffect(() => {
    if (step !== 'measure' && step !== 'summary') return
    if (missingDeclines.length === 0) return
    let d = draft
    void (async () => {
      for (const c of missingDeclines) {
        d = await store.entry(d, {
          code: c,
          unit: null,
          readingsTyped: [],
          skipped: true,
          skipReason: 'declined_at_consent',
          skipNote: null,
          confirmedUnusual: false,
          heightMethod: null,
          hairAddsHeight: null,
          measuredAt: now().toISOString(),
        })
      }
      setDraft(d)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when entering measuring
  }, [step, missingDeclines.join(',')])

  const [index, setIndex] = useState(0)
  const code = screens[index]

  // Per-screen state
  const [readings, setReadingsState] = useState<string[]>([])
  const [pad, setPadState] = useState('')
  // The latest values even before the screen redraws (fast taps): Save reads these, not the last drawing.
  const padNow = useRef('')
  const readingsNow = useRef<string[]>([])
  const setPad = (v: string) => {
    padNow.current = v
    setPadState(v)
  }
  const setReadings = (v: string[]) => {
    readingsNow.current = v
    setReadingsState(v)
  }
  const [method, setMethod] = useState<HeightMethod>('steel_tape')
  const [hair, setHair] = useState(false)
  const [prompt, setPrompt] = useState<Prompt>(null)
  const [pendingEntry, setPendingEntry] = useState<Entry | null>(null)
  const [skipping, setSkipping] = useState(false)
  const [reason, setReason] = useState<Exclude<SkipReason, 'declined_at_consent'> | null>(null)
  const [note, setNote] = useState('')

  function open(i: number) {
    const c = screens[i]
    const e = draft.entries[c]
    setIndex(i)
    setReadings([])
    setPad('')
    setMethod(e?.heightMethod ?? 'steel_tape')
    setHair(e?.hairAddsHeight ?? false)
    setPrompt(null)
    setPendingEntry(null)
    setSkipping(false)
    setReason(null)
    setNote('')
    setError('')
    setStep('measure')
  }

  async function save(e: Entry) {
    try {
      const d = await store.entry(draft, e)
      setDraft(d)
      if (index + 1 < screens.length) open(index + 1)
      else setStep('summary')
    } catch {
      setError('Could not save on this phone. Try again.')
    }
  }

  const unitHere: Unit = code === 'height' && method === 'wall_100' ? 'cm' : unit
  const add = code === 'height' && method === 'wall_100' ? 1000 : 0
  const double = code ? DOUBLE.has(code) : false
  const needed = double ? (readings.length >= 2 && needsThird(readings.map((r) => readingTenths(r, unitHere)! + add)) ? 3 : 2) : 1

  function addReading() {
    const pad = padNow.current
    const readings = readingsNow.current
    const t = readingTenths(pad, unitHere)
    if (t === null) {
      setError(unitHere === 'cm' ? 'Type a reading like 87.3 (one decimal at most).' : 'Type whole inches, then choose the eighths.')
      return
    }
    setError('')
    const next = [...readings, pad]
    setPad('')
    const tenths = next.map((r) => readingTenths(r, unitHere)! + add)
    const needNow = double ? (next.length >= 2 && needsThird(tenths.slice(0, 2)) ? 3 : 2) : 1
    if (next.length < needNow) {
      setReadings(next)
      return
    }
    setReadings(next)
    const value = valueTenths(tenths, double)!
    const entry: Entry = {
      code,
      unit: unitHere,
      readingsTyped: next,
      skipped: false,
      skipReason: null,
      skipNote: null,
      confirmedUnusual: false,
      heightMethod: code === 'height' ? method : null,
      hairAddsHeight: code === 'height' ? hair : null,
      measuredAt: now().toISOString(),
    }
    const range = unusual(code, value, draft.about!.sex, draft.about!.ageYears)
    if (range) {
      setPendingEntry(entry)
      setPrompt({
        kind: 'unusual',
        text: `${showCm(value)} is unusual for ${DEF[code].label.toLowerCase()} (expected ${range[0]}–${range[1]} cm${draft.about!.ageYears < 18 ? ' at this age' : ' for adults'}). Check the tape.`,
      })
      return
    }
    checkAgreement(entry, value)
  }

  function checkAgreement(entry: Entry, value: number) {
    const values: Partial<Record<Code, number>> = {}
    for (const c of codes) {
      const t = c === code ? value : entryTenths(draft.entries[c])
      if (t !== null) values[c] = t / 10
    }
    const d = disagreements(code, values)
    if (d.length) {
      setPendingEntry(entry)
      setPrompt({ kind: 'disagree', text: d.map((x) => x.message).join(' ') })
      return
    }
    void save(entry)
  }

  function keep() {
    if (!pendingEntry) return
    const e = { ...pendingEntry, confirmedUnusual: true }
    const value = entryTenths(e)!
    setPrompt(null)
    if (prompt?.kind === 'unusual') checkAgreement(e, value)
    else void save(e)
  }

  function again() {
    setPrompt(null)
    setPendingEntry(null)
    setReadings([])
    setPad('')
  }

  const firstIntimate = screens.find((c) => INTIMATE.has(c))
  const done = codes.every((c) => draft.entries[c])

  return (
    <Page>
      <ModeBanner real={!draft.isPractice} />
      <ErrorText>{error}</ErrorText>

      {step === 'about' && (
        <About_
          draft={draft}
          onSaved={async (a) => {
            setDraft(await store.about(draft, a))
            setStep('intro')
          }}
        />
      )}

      {step === 'intro' && draft.about && (
        <>
          <Title>Before you start</Title>
          <ul className="list-disc space-y-1 pl-5">
            <li>Shoes off; headwear off if possible. Light clothing.</li>
            <li>Participant stands straight, relaxed, arms down, looking ahead.</li>
            <li>Tape snug on the body, not tight; read it at eye level.</li>
            <li>Height: steel tape from the floor against the wall; a straight edge flat on the head.</li>
            <li>Explain each step before touching. Wipe the tape between participants.</li>
          </ul>
          <p className="text-sm text-slate-600">
            {screens.length} measurements{codes.length > screens.length ? ` (${codes.length - screens.length} declined at consent)` : ''}.
          </p>
          <Button onClick={() => open(0)}>Start measuring</Button>
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        </>
      )}

      {step === 'measure' && code && draft.about && (
        <>
          <p className="text-sm font-semibold text-slate-600">
            {index + 1} of {screens.length}
          </p>
          <Title>{DEF[code].label}</Title>
          {code === firstIntimate && draft.about.sex === 'female' && (
            <p role="note" className="rounded-lg bg-sky-50 p-3">
              Ask if she would prefer a woman to take these measurements.
            </p>
          )}
          <BodyFigure code={code} sex={draft.about.sex} label={DEF[code].label} />
          <p>{DEF[code].how}</p>
          {draft.entries[code] && readings.length === 0 && !prompt && (
            <p className="text-sm text-slate-600">
              Saved: {draft.entries[code]!.skipped ? `skipped (${REASON_TEXT[draft.entries[code]!.skipReason!]})` : showCm(entryTenths(draft.entries[code])!)}. Measure again to change it.
            </p>
          )}

          {code === 'height' && readings.length === 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">How</legend>
              <div className="grid grid-cols-2 gap-2">
                <Choice chosen={method === 'steel_tape'} onClick={() => setMethod('steel_tape')}>
                  Steel tape
                </Choice>
                <Choice chosen={method === 'wall_100'} onClick={() => setMethod('wall_100')}>
                  100 cm wall mark
                </Choice>
              </div>
              {method === 'wall_100' && <p className="text-sm text-slate-600">Measure from the 100 cm mark up to the head, in cm. The app adds 100.</p>}
              <label className="flex items-center gap-3">
                <input type="checkbox" className="h-5 w-5" checked={hair} onChange={(e) => setHair(e.target.checked)} />
                Hair or headwear may add height
              </label>
            </fieldset>
          )}

          {prompt ? (
            <div role="alertdialog" aria-label="Check the measurement" className="flex flex-col gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
              <p>{prompt.text}</p>
              <Button onClick={again}>Type again</Button>
              <Button variant="secondary" onClick={keep}>
                Keep {showCm(entryTenths(pendingEntry ?? undefined) ?? 0)}
              </Button>
            </div>
          ) : skipping ? (
            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4">
              <p className="font-semibold">Why skip {DEF[code].label.toLowerCase()}?</p>
              {REASONS.map((r) => (
                <Choice key={r.value} chosen={reason === r.value} onClick={() => setReason(r.value)}>
                  {r.label}
                </Choice>
              ))}
              {reason === 'other' && <Field label="Short note (no names)" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} />}
              <Button
                disabled={!reason || (reason === 'other' && note.trim() === '')}
                onClick={() =>
                  void save({
                    code,
                    unit: null,
                    readingsTyped: [],
                    skipped: true,
                    skipReason: reason,
                    skipNote: reason === 'other' ? note.trim() : null,
                    confirmedUnusual: false,
                    heightMethod: null,
                    hairAddsHeight: null,
                    measuredAt: now().toISOString(),
                  })
                }
              >
                Skip this measurement
              </Button>
              <Button variant="secondary" onClick={() => setSkipping(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              {double && (
                <p className="font-semibold">
                  Reading {readings.length + 1} of {needed}
                  {readings.length > 0 && <span className="font-normal text-slate-600"> · so far {readings.map((r) => showCm(readingTenths(r, unitHere)! + add)).join(', ')}</span>}
                </p>
              )}
              {double && readings.length === 2 && needed === 3 && (
                <p role="status" className="rounded-lg bg-amber-50 p-3">
                  The two readings differ by more than 1 cm. Take a third reading.
                </p>
              )}
              <ReadingPad unit={unitHere} value={pad} onChange={setPad} addCm={add / 10} />
              <Button disabled={!pad} onClick={addReading}>
                {double && readings.length + 1 < needed ? 'Save reading, measure again' : 'Next'}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => (index > 0 ? open(index - 1) : setStep('intro'))}>
                  Back
                </Button>
                <Button variant="secondary" onClick={() => setSkipping(true)}>
                  Skip
                </Button>
              </div>
              {draft.entries[code] && readings.length === 0 && (
                <Button variant="secondary" onClick={() => (index + 1 < screens.length ? open(index + 1) : setStep('summary'))}>
                  Keep saved value
                </Button>
              )}
            </>
          )}
        </>
      )}

      {step === 'summary' && draft.about && (
        <>
          <Title>Summary</Title>
          <p className="text-sm text-slate-600">
            {draft.about.sex === 'female' ? 'Female' : 'Male'}, {draft.about.ageYears} years, {draft.about.clothing} clothing. Tap a measurement to
            change it.
          </p>
          <ul className="flex flex-col gap-1">
            {codes.map((c) => {
              const e = draft.entries[c]
              const i = screens.indexOf(c)
              return (
                <li key={c}>
                  <button
                    type="button"
                    disabled={i < 0}
                    onClick={() => open(i)}
                    className="flex w-full justify-between rounded-lg border border-slate-200 bg-white p-3 text-left disabled:opacity-70"
                  >
                    <span>{DEF[c].label}</span>
                    <span className={e ? 'font-semibold' : 'text-red-700'}>
                      {!e ? 'not yet' : e.skipped ? `skipped (${REASON_TEXT[e.skipReason!]})` : `${showCm(entryTenths(e)!)}${e.confirmedUnusual ? ' ✓ checked' : ''}`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {draft.finishedAt ? (
            <p role="status" className="rounded-lg bg-emerald-50 p-3">
              Finished. Changes are still saved and sent.
            </p>
          ) : (
            <Button
              disabled={!done}
              onClick={() =>
                void store.finish(draft).then(
                  (d) => {
                    setDraft(d)
                    onDone()
                  },
                  () => setError('Could not save on this phone. Try again.'),
                )
              }
            >
              Finish
            </Button>
          )}
          {!done && <p className="text-sm text-slate-600">Every measurement must be taken or skipped with a reason before Finish.</p>}
          <Button variant="secondary" onClick={onBack}>
            Back to list
          </Button>
        </>
      )}
    </Page>
  )
}
