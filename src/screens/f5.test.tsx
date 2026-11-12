// @vitest-environment jsdom
/** F5 screens: about, number pad (cm and inches), ×2, warnings, skip, intimate, summary, consent tick, list. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MeasureFlow, type MeasureStore } from './Measure'
import { ConsentFlow } from './Consent'
import { PracticeList, stateOf } from './Practice'
import { consentText } from '../lib/consentText'
import { DEF, setFor, type AgeRange, type Code } from '../lib/measurements'
import type { Entry, MeasureDraft } from '../lib/measureQueue'
import type { ConsentJob } from '../lib/consentQueue'
import type { PadProps } from '../components/SignaturePad'
import type { PracticeRow } from '../lib/practice'

afterEach(cleanup)

const draft = (over: Partial<MeasureDraft> = {}): MeasureDraft => ({
  participantId: 'p1',
  collectorId: 'me',
  isPractice: true,
  ageGroup: 'adult',
  intimateOk: true,
  about: null,
  entries: {},
  finishedAt: null,
  toldHeight: { typed: null, unit: null }, // stated height asked already (Amendment B tests are in f5a)
  ...over,
})

function fakeStore() {
  const entries: Entry[] = []
  const store: MeasureStore = {
    about: vi.fn(async (d, a) => ({ ...d, about: a })),
    entry: vi.fn(async (d, e) => {
      entries.push(e)
      return { ...d, entries: { ...d.entries, [e.code]: e } }
    }),
    finish: vi.fn(async (d) => ({ ...d, finishedAt: 'now' })),
    weight: vi.fn(async (d, w) => ({ ...d, weight: w })),
    toldHeight: vi.fn(async (d, typed, unit) => ({ ...d, toldHeight: { typed, unit } })),
    toldWeight: vi.fn(async (d, kg) => ({ ...d, weightToldKg: kg })),
  }
  return { store, entries }
}

const press = (...keys: string[]) =>
  keys.forEach((k) => fireEvent.click(screen.getByRole('button', { name: k === '.' ? 'Decimal point' : k })))
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const female30 = { sex: 'female' as const, ageRange: '25-34' as const, clothing: 'light' as const }

function startAt(code: Code, over: Partial<MeasureDraft> = {}, unit: 'cm' | 'in' = 'cm') {
  const s = fakeStore()
  const d = draft({ about: female30, ...over })
  render(<MeasureFlow draft={d} unit={unit} store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
  if (Object.keys(d.entries).length === 0) {
    // Nothing measured yet: the flow starts at "Before you start", then the first measurement.
    fireEvent.click(btn('Start measuring'))
  } else {
    // Resuming: the flow opens on the summary; tap the measurement to open it.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${DEF[code].label}`) }))
  }
  screen.getByRole('heading', { name: DEF[code].label })
  return s
}

/** Every code before `code` already saved, so the flow can jump straight to it. */
function savedBefore(code: Code, sex: 'female' | 'male' = 'female', age: AgeRange = '25-34'): Partial<Record<Code, Entry>> {
  const out: Partial<Record<Code, Entry>> = {}
  for (const c of setFor(sex, age)) {
    if (c === code) break
    out[c] = { code: c, unit: null, readingsTyped: [], skipped: true, skipReason: 'other', skipNote: 'x', confirmedUnusual: false, heightMethod: null, hairAddsHeight: null, measuredAt: '' }
  }
  return out
}

describe('About the participant', () => {
  it('needs sex, an age group and clothing; only adult groups for an adult; no exact age asked', async () => {
    const { store } = fakeStore()
    render(<MeasureFlow draft={draft()} unit="cm" store={store} onDone={vi.fn()} onBack={vi.fn()} />)
    expect(btn('Next').disabled).toBe(true)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: '15–17' })).toBeNull()
    for (const r of ['18–24', '25–34', '35–44', '45–54', '55–64', '65+']) btn(r)
    fireEvent.click(btn('Female'))
    fireEvent.click(btn('Light'))
    expect(btn('Next').disabled).toBe(true) // no age group yet
    fireEvent.click(btn('25–34'))
    fireEvent.click(btn('Next'))
    await waitFor(() => screen.getByText('Before you start'))
    expect(store.about).toHaveBeenCalledWith(expect.anything(), female30)
    screen.getByText(/24 measurements/)
  })

  it('a child gets only the children’s groups (none under 8); 10–12 gets the core set', async () => {
    const { store } = fakeStore()
    render(<MeasureFlow draft={draft({ ageGroup: 'child' })} unit="cm" store={store} onDone={vi.fn()} onBack={vi.fn()} />)
    for (const r of ['8–9', '10–12', '13–14', '15–17']) btn(r)
    expect(screen.queryByRole('button', { name: '25–34' })).toBeNull()
    screen.getByText(/Children under 8 do not take part/)
    fireEvent.click(btn('Male'))
    fireEvent.click(btn('Light'))
    fireEvent.click(btn('10–12'))
    fireEvent.click(btn('Next'))
    await waitFor(() => screen.getByText('Before you start'))
    expect(store.about).toHaveBeenCalledWith(expect.anything(), { sex: 'male', ageRange: '10-12', clothing: 'light' })
    screen.getByText(/9 measurements/)
  })
})

describe('Measuring', () => {
  it('cm: one reading, number pad, saved exactly as typed', async () => {
    const s = startAt('neck_girth', { entries: savedBefore('neck_girth') })
    screen.getByRole('img', { name: 'Where to measure: Neck girth' })
    press('3', '4', '.', '5', '6') // the second decimal is ignored
    expect(screen.getByRole('status', { name: 'Reading' }).textContent).toMatch(/34\.5 cm/)
    fireEvent.click(btn('Next'))
    await waitFor(() => expect(s.entries).toHaveLength(1))
    expect(s.entries[0]).toMatchObject({ code: 'neck_girth', unit: 'cm', readingsTyped: ['34.5'], skipped: false })
  })

  it('inches: whole inches + eighths, shown in cm, stored in lowest terms', async () => {
    const s = startAt('neck_girth', { entries: savedBefore('neck_girth') }, 'in')
    press('1', '3')
    fireEvent.click(within(screen.getByLabelText('Eighths of an inch')).getByRole('button', { name: '⅝' }))
    expect(screen.getByRole('status', { name: 'Reading' }).textContent).toMatch(/13 ⅝ in= 34\.6 cm/)
    fireEvent.click(btn('Next'))
    await waitFor(() => expect(s.entries[0]?.readingsTyped).toEqual(['13 5/8']))
  })

  it('×2: two readings; >1 cm apart asks for a third; all three stored', async () => {
    const s = startAt('waist_girth', { entries: savedBefore('waist_girth') })
    screen.getByText(/Reading 1 of 2/)
    press('7', '8')
    fireEvent.click(btn('Save reading, measure again'))
    press('7', '9', '.', '5')
    fireEvent.click(btn('Next'))
    screen.getByText(/differ by more than 1 cm/)
    screen.getByText(/Reading 3 of 3/)
    press('7', '8', '.', '3')
    fireEvent.click(btn('Next'))
    await waitFor(() => expect(s.entries[0]?.readingsTyped).toEqual(['78', '79.5', '78.3']))
  })

  it('unusual value: Type again clears; Keep stores it as checked', async () => {
    const s = startAt('neck_girth', { entries: savedBefore('neck_girth') })
    press('1', '5')
    fireEvent.click(btn('Next'))
    screen.getByRole('alertdialog', { name: 'Check the measurement' })
    screen.getByText(/15\.0 cm is unusual for neck girth \(expected 28–55 cm for adults\)/)
    fireEvent.click(btn('Type again'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    press('8', '5')
    fireEvent.click(btn('Next'))
    fireEvent.click(btn('Keep 85.0 cm'))
    await waitFor(() => expect(s.entries[0]).toMatchObject({ readingsTyped: ['85'], confirmedUnusual: true }))
  })

  it('disagreement between measurements warns (under-bust larger than bust)', async () => {
    const entries = savedBefore('underbust_girth')
    entries.bust_girth = { code: 'bust_girth', unit: 'cm', readingsTyped: ['82', '82.4'], skipped: false, skipReason: null, skipNote: null, confirmedUnusual: false, heightMethod: null, hairAddsHeight: null, measuredAt: '' }
    startAt('underbust_girth', { entries })
    press('9', '5')
    fireEvent.click(btn('Next'))
    screen.getByText(/Under-bust is not smaller than bust/)
  })

  it('skip needs a reason; "Other" needs a short note', async () => {
    const s = startAt('neck_girth', { entries: savedBefore('neck_girth') })
    fireEvent.click(btn('Skip'))
    expect(btn('Skip this measurement').disabled).toBe(true)
    fireEvent.click(btn('Other'))
    expect(btn('Skip this measurement').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Short note (no names)'), { target: { value: 'tape broke' } })
    fireEvent.click(btn('Skip this measurement'))
    await waitFor(() => expect(s.entries[0]).toMatchObject({ skipped: true, skipReason: 'other', skipNote: 'tape broke', readingsTyped: [] }))
  })

  it('height: 100 cm wall mark adds 100 (cm only) and the hair flag is stored', async () => {
    const s = startAt('height', {}, 'in')
    fireEvent.click(btn('100 cm wall mark'))
    fireEvent.click(screen.getByLabelText('Hair or headwear may add height'))
    press('6', '5', '.', '2')
    expect(screen.getByRole('status', { name: 'Reading' }).textContent).toMatch(/= 165\.2 cm/)
    fireEvent.click(btn('Save reading, measure again'))
    press('6', '5', '.', '4')
    fireEvent.click(btn('Next'))
    await waitFor(() =>
      expect(s.entries[0]).toMatchObject({ code: 'height', unit: 'cm', readingsTyped: ['65.2', '65.4'], heightMethod: 'wall_100', hairAddsHeight: true }),
    )
  })

  it('women: the woman-collector prompt shows before the first intimate measurement', () => {
    startAt('bust_girth', { entries: savedBefore('bust_girth') })
    screen.getByText('Ask if she would prefer a woman to take these measurements.')
  })
})

describe('Intimate measurements without the tick', () => {
  it('are skipped automatically ("declined at consent") and never shown', async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft({ about: female30, intimateOk: false })} unit="cm" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    screen.getByText(/19 measurements \(5 declined at consent\)/)
    fireEvent.click(btn('Start measuring'))
    await waitFor(() => expect(s.entries).toHaveLength(5))
    expect(s.entries.every((e) => e.skipped && e.skipReason === 'declined_at_consent')).toBe(true)
    expect(s.entries.map((e) => e.code).sort()).toEqual(['bust_girth', 'bust_point_distance', 'inseam', 'shoulder_to_bust_point', 'underbust_girth'])
  })
})

describe('Summary and Finish', () => {
  it('Finish only when every measurement is taken or skipped', async () => {
    const all = savedBefore('height', 'male', '8-9')
    for (const c of setFor('male', '8-9')) all[c] = { code: c, unit: 'cm', readingsTyped: c === 'height' ? ['130', '130.2'] : ['30'], skipped: false, skipReason: null, skipNote: null, confirmedUnusual: false, heightMethod: c === 'height' ? 'steel_tape' : null, hairAddsHeight: null, measuredAt: '' }
    for (const dbl of ['chest_girth', 'waist_girth', 'hip_girth'] as Code[]) all[dbl]!.readingsTyped = ['60', '60.2']
    const missing = { ...all }
    delete missing.inseam
    const s = fakeStore()
    const onDone = vi.fn()
    const { unmount } = render(
      <MeasureFlow draft={draft({ ageGroup: 'child', about: { sex: 'male', ageRange: '8-9', clothing: 'light' }, entries: missing })} unit="cm" store={s.store} onDone={onDone} onBack={vi.fn()} />,
    )
    screen.getByText('Summary')
    expect(btn('Finish').disabled).toBe(true)
    screen.getByText('not yet')
    unmount()
    render(<MeasureFlow draft={draft({ ageGroup: 'child', about: { sex: 'male', ageRange: '8-9', clothing: 'light' }, entries: all })} unit="cm" store={s.store} onDone={onDone} onBack={vi.fn()} />)
    screen.getByText('130.1 cm')
    fireEvent.click(btn('Finish'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(s.store.finish).toHaveBeenCalled()
  })
})

describe('F4 amendment: optional third consent tick', () => {
  function FakePad({ label, onChange }: PadProps) {
    return (
      <button type="button" onClick={() => onChange(new Uint8Array([1]))}>
        Sign: {label}
      </button>
    )
  }

  it('optional; its answer is stored and passed to measuring', async () => {
    const onSave = vi.fn<(job: ConsentJob) => Promise<void>>(async () => {})
    const onMeasure = vi.fn()
    render(
      <ConsentFlow isPractice text={consentText('practice')!} collectorId="me" onSave={onSave} onDone={vi.fn()} onBack={vi.fn()} onMeasure={onMeasure} Pad={FakePad} newId={() => 'p1'} newReceipt={() => 'R7K2MPQ'} />,
    )
    fireEvent.click(btn('Adult (18 or older)'))
    fireEvent.click(btn('Next: consent'))
    fireEvent.click(screen.getByLabelText(/my body measurements/))
    fireEvent.click(screen.getByLabelText(/photos of my body/))
    fireEvent.change(screen.getByLabelText("Participant's name"), { target: { value: 'Ama' } })
    fireEvent.click(btn(/Sign:/))
    expect(btn('Save consent').disabled).toBe(false) // the third tick is optional
    fireEvent.click(screen.getByLabelText(/more personal measurements/))
    fireEvent.click(btn('Save consent'))
    await waitFor(() => screen.getByText('R7K-2MPQ'))
    expect(onSave.mock.calls[0][0].consent?.agreedIntimate).toBe(true)
    fireEvent.click(btn('Start measurements'))
    expect(onMeasure).toHaveBeenCalledWith({ participantId: 'p1', isPractice: true, ageGroup: 'adult', intimateOk: true, weightOk: false })
  })
})

describe('Practice list (F5)', () => {
  const row = (over: Partial<PracticeRow>): PracticeRow => ({ id: 'a', practiceNo: 1, ageGroup: 'adult', status: 'draft', createdAt: '2026-11-09T09:00:00Z', waiting: false, ...over })

  it('Measure for consented, View once measured; none without consent', async () => {
    const onMeasure = vi.fn()
    render(
      <PracticeList
        load={async () => [row({ id: 'a', practiceNo: 1, hasConsent: true }), row({ id: 'b', practiceNo: 2, hasConsent: true, measured: true }), row({ id: 'c', practiceNo: 3 })]}
        remove={vi.fn()}
        onNew={vi.fn()}
        onBack={vi.fn()}
        onMeasure={onMeasure}
      />,
    )
    const a = await waitFor(() => screen.getByRole('listitem', { name: 'Practice P-0001' }))
    fireEvent.click(within(a).getByRole('button', { name: 'Measure' }))
    expect(onMeasure).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
    within(screen.getByRole('listitem', { name: 'Practice P-0002' })).getByRole('button', { name: 'View' })
    expect(within(screen.getByRole('listitem', { name: 'Practice P-0003' })).queryByRole('button', { name: 'Measure' })).toBeNull()
    expect(stateOf(row({ hasConsent: true, measured: true }))).toBe('Measured · photos needed')
    expect(stateOf(row({ hasConsent: true, measured: true, photosDone: true }))).toBe('Complete')
  })
})
