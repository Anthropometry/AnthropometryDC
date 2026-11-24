// @vitest-environment jsdom
/** F5 Amendments A and B: optional weight tick; stated height before the tape; stated weight, then the scale; summary. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MeasureFlow, type MeasureStore } from './Measure'
import { ConsentFlow } from './Consent'
import { consentText } from '../lib/consentText'
import { setFor, unusualWeight, weightRange, type Code } from '../lib/measurements'
import type { Entry, MeasureDraft, Weight } from '../lib/measureQueue'
import type { ConsentJob } from '../lib/consentQueue'
import type { PadProps } from '../components/SignaturePad'

afterEach(cleanup)

const female30 = { sex: 'female' as const, ageRange: '25-34' as const, clothing: 'light' as const }
const draft = (over: Partial<MeasureDraft> = {}): MeasureDraft => ({
  participantId: 'p1',
  collectorId: 'me',
  isPractice: true,
  ageGroup: 'adult',
  intimateOk: true,
  weightOk: true,
  about: female30,
  entries: {},
  finishedAt: null,
  ...over,
})

function fakeStore() {
  const weights: Weight[] = []
  const told: unknown[] = []
  const store: MeasureStore = {
    about: vi.fn(async (d, a) => ({ ...d, about: a })),
    entry: vi.fn(async (d, e) => ({ ...d, entries: { ...d.entries, [e.code]: e } })),
    finish: vi.fn(async (d) => ({ ...d, finishedAt: 'now' })),
    weight: vi.fn(async (d, w) => {
      weights.push(w)
      return { ...d, weight: w }
    }),
    toldHeight: vi.fn(async (d, typed, unit) => {
      told.push(['height', typed, unit])
      return { ...d, toldHeight: { typed, unit } }
    }),
    toldWeight: vi.fn(async (d, kg) => {
      told.push(['weight', kg])
      return { ...d, weightToldKg: kg }
    }),
  }
  return { store, weights, told }
}

const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const press = (...keys: string[]) =>
  keys.forEach((k) => fireEvent.click(screen.getByRole('button', { name: k === '.' ? 'Decimal point' : k })))

async function measureHeight() {
  fireEvent.click(btn('Start measuring'))
  await waitFor(() => screen.getByRole('heading', { name: 'What do you think your height is?' }))
  fireEvent.click(btn("Doesn't know"))
  await waitFor(() => screen.getByRole('heading', { name: 'Height' }))
  press('1', '6', '5', '.', '2')
  fireEvent.click(btn('Save reading, measure again'))
  press('1', '6', '5', '.', '4')
  fireEvent.click(btn('Next'))
}

describe('weight logic', () => {
  it('ranges by age; outside asks to check', () => {
    expect(weightRange('25-34')).toEqual([30, 200])
    expect(weightRange('15-17')).toEqual([30, 150])
    expect(weightRange('10-12')).toEqual([18, 80])
    expect(unusualWeight(724, '25-34')).toBeNull()
    expect(unusualWeight(150, '25-34')).toEqual([30, 200])
  })
})

describe('stated height before the tape (Amendment B)', () => {
  it('cm: typed as said, saved before the tape, then the height screen', async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft()} unit="cm" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(btn('Start measuring'))
    await waitFor(() => screen.getByRole('heading', { name: 'What do you think your height is?' }))
    press('1', '7', '0')
    fireEvent.click(btn('Next'))
    await waitFor(() => screen.getByRole('heading', { name: 'Height' }))
    expect(s.told).toEqual([['height', '170', 'cm']])
  })

  it('feet + inches: needs the feet; shows the cm; stored as "5 7 1/2"', async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft()} unit="in" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(btn('Start measuring'))
    await waitFor(() => screen.getByRole('heading', { name: 'What do you think your height is?' }))
    press('7')
    fireEvent.click(screen.getByRole('button', { name: '½' }))
    expect(btn('Next').disabled).toBe(true) // feet not chosen
    fireEvent.click(btn('5 ft'))
    expect(screen.getByRole('status', { name: 'Reading' }).textContent).toMatch(/5 ft 7 ½ in.*171\.5 cm/)
    fireEvent.click(btn('Next'))
    await waitFor(() => expect(s.told).toEqual([['height', '5 7 1/2', 'ftin']]))
  })

  it('DENY: 12 inches is refused with a message; nothing saved', async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft()} unit="in" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(btn('Start measuring'))
    await waitFor(() => screen.getByRole('heading', { name: 'What do you think your height is?' }))
    fireEvent.click(btn('5 ft'))
    press('1', '2')
    fireEvent.click(btn('Next'))
    screen.getByText(/Choose the feet, then type the inches/)
    expect(s.told).toEqual([])
  })

  it('already asked: Start measuring goes straight to the tape', async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft({ toldHeight: { typed: null, unit: null } })} unit="cm" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(btn('Start measuring'))
    await waitFor(() => screen.getByRole('heading', { name: 'Height' }))
    expect(s.told).toEqual([])
  })
})

describe('weight (only with the consent tick): asked first, then the scale', () => {
  it('after height: "Do you know your weight?", then the scale; both stored; then the next measurement', async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft()} unit="cm" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    screen.getByText(/Weight \(after height\)/) // the "Before you start" card mentions weighing
    await measureHeight()
    await waitFor(() => screen.getByRole('heading', { name: 'Do you know your weight?' }))
    press('7', '0')
    fireEvent.click(btn('Next'))
    await waitFor(() => screen.getByRole('heading', { name: 'Weigh on the scale' }))
    press('7', '2', '.', '4')
    expect(screen.getByRole('status', { name: 'Reading' }).textContent).toMatch(/72\.4 kg/)
    fireEvent.click(btn('Next'))
    await waitFor(() => screen.getByRole('heading', { name: 'Neck girth' }))
    expect(s.told).toEqual([
      ['height', null, null],
      ['weight', 70],
    ])
    expect(s.weights).toEqual([{ kg: 72.4, source: 'scale', confirmedUnusual: false }])
  })

  it('without the tick there is no weight screen', async () => {
    render(<MeasureFlow draft={draft({ weightOk: false })} unit="cm" store={fakeStore().store} onDone={vi.fn()} onBack={vi.fn()} />)
    expect(screen.queryByText(/Weight \(after height\)/)).toBeNull()
    await measureHeight()
    await waitFor(() => screen.getByRole('heading', { name: 'Neck girth' }))
  })

  it('No scale here: the stated weight becomes the weight, source "told"', async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft()} unit="cm" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    await measureHeight()
    await waitFor(() => screen.getByRole('heading', { name: 'Do you know your weight?' }))
    press('6', '8', '.', '5')
    fireEvent.click(btn('Next'))
    await waitFor(() => screen.getByRole('heading', { name: 'Weigh on the scale' }))
    fireEvent.click(btn('No scale here'))
    await waitFor(() => screen.getByRole('heading', { name: 'Neck girth' }))
    expect(s.weights).toEqual([{ kg: 68.5, source: 'told', confirmedUnusual: false }])
  })

  it("Doesn't know + no scale: weight stored as skipped", async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft()} unit="cm" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    await measureHeight()
    await waitFor(() => screen.getByRole('heading', { name: 'Do you know your weight?' }))
    fireEvent.click(btn("Doesn't know"))
    await waitFor(() => screen.getByRole('heading', { name: 'Weigh on the scale' }))
    fireEvent.click(btn('No scale here'))
    await waitFor(() => screen.getByRole('heading', { name: 'Neck girth' }))
    expect(s.told).toContainEqual(['weight', null])
    expect(s.weights).toEqual([{ kg: null, source: null, confirmedUnusual: false }])
  })

  it('an unusual scale weight asks to check; Keep stores it as checked', async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft()} unit="cm" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    await measureHeight()
    await waitFor(() => screen.getByRole('heading', { name: 'Do you know your weight?' }))
    fireEvent.click(btn("Doesn't know"))
    await waitFor(() => screen.getByRole('heading', { name: 'Weigh on the scale' }))
    press('1', '5')
    fireEvent.click(btn('Next'))
    screen.getByText(/15\.0 kg is unusual \(expected 30–200 kg for adults\)/)
    fireEvent.click(btn('Keep 15.0 kg'))
    await waitFor(() => expect(s.weights).toEqual([{ kg: 15, source: 'scale', confirmedUnusual: true }]))
  })
})

describe('summary', () => {
  it('shows the weight row; Finish does not wait for weight', async () => {
    const all: Partial<Record<Code, Entry>> = {}
    for (const c of setFor('male', '8-9'))
      all[c] = { code: c, unit: null, readingsTyped: [], skipped: true, skipReason: 'other', skipNote: 'x', confirmedUnusual: false, heightMethod: null, hairAddsHeight: null, measuredAt: '' }
    const onDone = vi.fn()
    render(
      <MeasureFlow
        draft={draft({ ageGroup: 'child', about: { sex: 'male', ageRange: '8-9', clothing: 'light' }, entries: all })}
        unit="cm"
        store={fakeStore().store}
        onDone={onDone}
        onBack={vi.fn()}
      />,
    )
    screen.getByText('Weight (optional)')
    screen.getByText('not yet')
    fireEvent.click(btn('Finish'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('shows a saved weight with its source', () => {
    render(<MeasureFlow draft={draft({ entries: { height: { code: 'height', unit: 'cm', readingsTyped: ['165.2', '165.4'], skipped: false, skipReason: null, skipNote: null, confirmedUnusual: false, heightMethod: 'steel_tape', hairAddsHeight: false, measuredAt: '' } }, weight: { kg: 72.4, source: 'told', confirmedUnusual: false } })} unit="cm" store={fakeStore().store} onDone={vi.fn()} onBack={vi.fn()} />)
    screen.getByText('72.4 kg, told')
  })

  it('shows the stated height and the stated weight next to the scale value', () => {
    const all: Partial<Record<Code, Entry>> = {}
    for (const c of setFor('male', '8-9'))
      all[c] = { code: c, unit: null, readingsTyped: [], skipped: true, skipReason: 'other', skipNote: 'x', confirmedUnusual: false, heightMethod: null, hairAddsHeight: null, measuredAt: '' }
    const d = draft({ ageGroup: 'child', about: { sex: 'male', ageRange: '8-9', clothing: 'light' }, entries: all })
    render(<MeasureFlow draft={{ ...d, toldHeight: { typed: '5 7 1/2', unit: 'ftin' }, weightToldKg: 70, weight: { kg: 72.4, source: 'scale', confirmedUnusual: false } }} unit="cm" store={fakeStore().store} onDone={vi.fn()} onBack={vi.fn()} />)
    screen.getByText('171.5 cm (said 5 7 1/2)')
    screen.getByText('72.4 kg, scale · said 70.0')
  })
})

describe('consent: optional weight tick', () => {
  function FakePad({ label, onChange }: PadProps) {
    return (
      <button type="button" onClick={() => onChange(new Uint8Array([1]))}>
        Sign: {label}
      </button>
    )
  }

  it('optional; stored; passed to measuring', async () => {
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
    expect(btn('Save consent').disabled).toBe(false)
    fireEvent.click(screen.getByLabelText(/my weight being recorded/))
    fireEvent.click(btn('Save consent'))
    await waitFor(() => screen.getByText('R7K-2MPQ'))
    expect(onSave.mock.calls[0][0].consent).toMatchObject({ agreedWeight: true, agreedIntimate: false })
    fireEvent.click(btn('Start measurements'))
    expect(onMeasure).toHaveBeenCalledWith(expect.objectContaining({ weightOk: true, intimateOk: false }))
  })
})
