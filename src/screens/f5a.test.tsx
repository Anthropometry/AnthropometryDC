// @vitest-environment jsdom
/** F5 Amendment A screens: optional weight tick, weight screen after height, summary, Finish. */
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

const female30 = { sex: 'female' as const, ageYears: 30, clothing: 'light' as const }
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
  const store: MeasureStore = {
    about: vi.fn(async (d, a) => ({ ...d, about: a })),
    entry: vi.fn(async (d, e) => ({ ...d, entries: { ...d.entries, [e.code]: e } })),
    finish: vi.fn(async (d) => ({ ...d, finishedAt: 'now' })),
    weight: vi.fn(async (d, w) => {
      weights.push(w)
      return { ...d, weight: w }
    }),
  }
  return { store, weights }
}

const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const press = (...keys: string[]) =>
  keys.forEach((k) => fireEvent.click(screen.getByRole('button', { name: k === '.' ? 'Decimal point' : k })))

function measureHeight() {
  fireEvent.click(btn('Start measuring'))
  press('1', '6', '5', '.', '2')
  fireEvent.click(btn('Save reading, measure again'))
  press('1', '6', '5', '.', '4')
  fireEvent.click(btn('Next'))
}

describe('weight logic', () => {
  it('ranges by age; outside asks to check', () => {
    expect(weightRange(30)).toEqual([30, 200])
    expect(weightRange(15)).toEqual([30, 150])
    expect(weightRange(10)).toEqual([18, 80])
    expect(unusualWeight(724, 30)).toBeNull()
    expect(unusualWeight(150, 30)).toEqual([30, 200])
  })
})

describe('weight screen (only with the consent tick)', () => {
  it('comes right after height; needs a source; saved in kg with the source; then the next measurement', async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft()} unit="cm" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    screen.getByText(/Weight \(after height\)/) // the "Before you start" card mentions weighing
    measureHeight()
    await waitFor(() => screen.getByRole('heading', { name: 'Weight (optional)' }))
    press('7', '2', '.', '4')
    expect(screen.getByRole('status', { name: 'Reading' }).textContent).toMatch(/72\.4 kg/)
    expect(btn('Next').disabled).toBe(true) // no source yet
    fireEvent.click(btn('Weighed on a scale'))
    fireEvent.click(btn('Next'))
    await waitFor(() => screen.getByRole('heading', { name: 'Neck girth' }))
    expect(s.weights).toEqual([{ kg: 72.4, source: 'scale', confirmedUnusual: false }])
  })

  it('without the tick there is no weight screen', async () => {
    render(<MeasureFlow draft={draft({ weightOk: false })} unit="cm" store={fakeStore().store} onDone={vi.fn()} onBack={vi.fn()} />)
    expect(screen.queryByText(/Weight \(after height\)/)).toBeNull()
    measureHeight()
    await waitFor(() => screen.getByRole('heading', { name: 'Neck girth' }))
  })

  it('Skip weight stores "skipped" and moves on', async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft()} unit="in" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(btn('Start measuring'))
    fireEvent.click(btn('Steel tape'))
    // inches for height: 65 and 65 ⅛
    press('6', '5')
    fireEvent.click(btn('Save reading, measure again'))
    press('6', '5')
    fireEvent.click(screen.getByRole('button', { name: '⅛' }))
    fireEvent.click(btn('Next'))
    await waitFor(() => screen.getByRole('heading', { name: 'Weight (optional)' }))
    fireEvent.click(btn('Skip weight'))
    await waitFor(() => screen.getByRole('heading', { name: 'Neck girth' }))
    expect(s.weights).toEqual([{ kg: null, source: null, confirmedUnusual: false }])
  })

  it('an unusual weight asks to check; Keep stores it as checked', async () => {
    const s = fakeStore()
    render(<MeasureFlow draft={draft()} unit="cm" store={s.store} onDone={vi.fn()} onBack={vi.fn()} />)
    measureHeight()
    await waitFor(() => screen.getByRole('heading', { name: 'Weight (optional)' }))
    fireEvent.click(btn('Participant told me'))
    press('1', '5')
    fireEvent.click(btn('Next'))
    screen.getByText(/15\.0 kg is unusual \(expected 30–200 kg for adults\)/)
    fireEvent.click(btn('Keep 15.0 kg'))
    await waitFor(() => expect(s.weights).toEqual([{ kg: 15, source: 'told', confirmedUnusual: true }]))
  })
})

describe('summary', () => {
  it('shows the weight row; Finish does not wait for weight', async () => {
    const all: Partial<Record<Code, Entry>> = {}
    for (const c of setFor('male', 9))
      all[c] = { code: c, unit: null, readingsTyped: [], skipped: true, skipReason: 'other', skipNote: 'x', confirmedUnusual: false, heightMethod: null, hairAddsHeight: null, measuredAt: '' }
    const onDone = vi.fn()
    render(
      <MeasureFlow
        draft={draft({ ageGroup: 'child', about: { sex: 'male', ageYears: 9, clothing: 'light' }, entries: all })}
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
