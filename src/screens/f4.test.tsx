// @vitest-environment jsdom
/** F4 screens: consent flow (adult, child yes/no), receipt, practice list states, admin withdrawal. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { consentText } from '../lib/consentText'
import type { ConsentJob } from '../lib/consentQueue'
import type { PadProps } from '../components/SignaturePad'
import type { PracticeRow } from '../lib/practice'
import { ConsentFlow } from './Consent'
import { stateOf } from './Practice'
import { WithdrawSection } from './Admin'

afterEach(cleanup)

/** Stands in for the canvas: a button that "signs". */
function FakePad({ label, onChange }: PadProps) {
  return (
    <button type="button" onClick={() => onChange(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))}>
      Sign: {label}
    </button>
  )
}

const ID = '00000000-0000-4000-8000-000000000001'

function renderFlow(over: Partial<Parameters<typeof ConsentFlow>[0]> = {}) {
  const onSave = vi.fn<(job: ConsentJob) => Promise<void>>(async () => {})
  const onDone = vi.fn()
  render(
    <ConsentFlow
      isPractice
      text={consentText('practice')!}
      collectorId="me"
      onSave={onSave}
      onDone={onDone}
      onBack={vi.fn()}
      Pad={FakePad}
      newId={() => ID}
      newReceipt={() => 'R7K2MPQ'}
      now={() => new Date('2026-11-07T09:00:00Z')}
      {...over}
    />,
  )
  return { onSave, onDone }
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const nextBtn = (name: RegExp | string) => screen.getByRole('button', { name }) as HTMLButtonElement

describe('F4 consent: adult', () => {
  it('Save stays off until both ticks, a name and a signature; then saves and shows the receipt', async () => {
    const { onSave } = renderFlow()
    screen.getByText('PRACTICE · not real data')
    fireEvent.click(screen.getByRole('button', { name: 'Adult (18 or older)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next: consent' }))
    screen.getByText(/student research project at Ashesi University/)

    expect(nextBtn('Save consent').disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(/my body measurements/))
    expect(nextBtn('Save consent').disabled).toBe(true) // one tick only
    fireEvent.click(screen.getByLabelText(/photos of my body/))
    type("Participant's name", 'Ama Mensah')
    expect(nextBtn('Save consent').disabled).toBe(true) // no signature yet
    fireEvent.click(screen.getByRole('button', { name: /Sign: Participant/ }))
    fireEvent.click(nextBtn('Save consent'))

    await waitFor(() => screen.getByText('R7K-2MPQ'))
    const job = onSave.mock.calls[0][0]
    expect(job).toMatchObject({
      participantId: ID,
      collectorId: 'me',
      isPractice: true,
      ageGroup: 'adult',
      receiptCode: 'R7K2MPQ',
      rejected: false,
      consent: { participantName: 'Ama Mensah', guardianName: null, language: 'en', consentVersion: 'practice', childAssent: null },
    })
    expect(Object.keys(job.signatures)).toEqual(['participant'])
  })

  it('DENY: after saving, the name is never shown again', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: 'Adult (18 or older)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next: consent' }))
    fireEvent.click(screen.getByLabelText(/my body measurements/))
    fireEvent.click(screen.getByLabelText(/photos of my body/))
    type("Participant's name", 'Ama Mensah')
    fireEvent.click(screen.getByRole('button', { name: /Sign:/ }))
    fireEvent.click(nextBtn('Save consent'))
    await waitFor(() => screen.getByText('Consent saved'))
    expect(document.body.textContent).not.toContain('Ama Mensah')
  })

  it('a save failure keeps the form and shows a message', async () => {
    renderFlow({ onSave: async () => Promise.reject(new Error('disk')) })
    fireEvent.click(screen.getByRole('button', { name: 'Adult (18 or older)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next: consent' }))
    fireEvent.click(screen.getByLabelText(/my body measurements/))
    fireEvent.click(screen.getByLabelText(/photos of my body/))
    type("Participant's name", 'Ama')
    fireEvent.click(screen.getByRole('button', { name: /Sign:/ }))
    fireEvent.click(nextBtn('Save consent'))
    await waitFor(() => screen.getByRole('alert'))
    expect(screen.getByLabelText<HTMLInputElement>("Participant's name").value).toBe('Ama')
  })
})

function childConsent() {
  fireEvent.click(screen.getByRole('button', { name: 'Under 18' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next: consent' }))
  screen.getByText('Consent from parent or guardian')
  fireEvent.click(screen.getByLabelText(/my child's body measurements/))
  fireEvent.click(screen.getByLabelText(/photos of my child's body/))
  type("Child's name", 'Kofi Junior')
  expect(nextBtn('Next: ask the child').disabled).toBe(true) // guardian name missing
  type("Parent or guardian's name", 'Akua Mensah')
  fireEvent.click(screen.getByRole('button', { name: /Sign: Parent/ }))
  fireEvent.click(nextBtn('Next: ask the child'))
  screen.getByText(/You can say no/)
}

describe('F4 consent: under 18', () => {
  it('guardian consent, then the child says Yes (with an optional mark)', async () => {
    const { onSave } = renderFlow()
    childConsent()
    fireEvent.click(screen.getByRole('button', { name: /Sign: Child/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, the child agrees' }))
    await waitFor(() => screen.getByText('R7K-2MPQ'))
    const job = onSave.mock.calls[0][0]
    expect(job.consent).toMatchObject({ participantName: 'Kofi Junior', guardianName: 'Akua Mensah', childAssent: true })
    expect(Object.keys(job.signatures).sort()).toEqual(['assent', 'guardian'])
  })

  it('the child says Yes without a mark: guardian signature only', async () => {
    const { onSave } = renderFlow()
    childConsent()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, the child agrees' }))
    await waitFor(() => screen.getByText('R7K-2MPQ'))
    expect(Object.keys(onSave.mock.calls[0][0].signatures)).toEqual(['guardian'])
  })

  it('DENY: the child says No → nothing about them is kept; only a rejected participant', async () => {
    const { onSave, onDone } = renderFlow()
    childConsent()
    fireEvent.click(screen.getByRole('button', { name: 'No, the child does not agree' }))
    await waitFor(() => screen.getByText(/Nothing about them was recorded/))
    const job = onSave.mock.calls[0][0]
    expect(job).toMatchObject({ rejected: true, consent: null, signatures: {} })
    expect(JSON.stringify(job)).not.toMatch(/Kofi|Akua/)
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }))
    expect(onDone).toHaveBeenCalled()
  })
})

describe('F4 list states', () => {
  const row = (over: Partial<PracticeRow>): PracticeRow => ({ id: 'a', practiceNo: 1, ageGroup: 'adult', status: 'draft', createdAt: '', waiting: false, ...over })
  it.each([
    [{ status: 'rejected' }, 'Stopped: child said no'],
    [{ hasConsent: true }, 'Consented · waiting for measurements'],
    [{ waiting: true, receiptCode: 'R7K2MPQ' }, 'Consent on this phone'],
    [{}, 'No consent yet'],
  ])('%j → %s', (over, text) => {
    expect(stateOf(row(over as Partial<PracticeRow>))).toBe(text)
  })
})

describe('F4 admin withdrawal', () => {
  const preview = { found: true, alreadyWithdrawn: false, isPractice: false, ageGroup: 'adult', createdAt: '2026-11-07T09:00:00Z', collectorName: 'Ama' }

  it('look up shows no name; withdraw needs the code typed again', async () => {
    const api = { previewWithdraw: vi.fn(async () => preview), withdraw: vi.fn(async () => ({ outcome: 'withdrawn' as const })) }
    render(<WithdrawSection api={api} />)
    expect(nextBtn('Look up').disabled).toBe(true)
    type('Receipt code', 'r7k-2mpq')
    fireEvent.click(nextBtn('Look up'))
    await waitFor(() => screen.getByText(/Real participant · Adult · 7 Nov · collected by Ama/))
    expect(api.previewWithdraw).toHaveBeenCalledWith('R7K2MPQ')
    expect(nextBtn('Withdraw and delete').disabled).toBe(true)
    type('Type the code again to confirm', 'R7K2MPX')
    expect(nextBtn('Withdraw and delete').disabled).toBe(true)
    type('Type the code again to confirm', 'R7K 2MPQ')
    fireEvent.click(nextBtn('Withdraw and delete'))
    await waitFor(() => screen.getByText(/Withdrawn. Everything for R7K-2MPQ was deleted/))
    expect(api.withdraw).toHaveBeenCalledWith('R7K2MPQ')
  })

  it.each([
    [{ ...preview, found: false, alreadyWithdrawn: true }, 'Already withdrawn.'],
    [{ ...preview, found: false }, 'No participant has that code.'],
  ])('preview %#', async (p, text) => {
    render(<WithdrawSection api={{ previewWithdraw: async () => p, withdraw: vi.fn() }} />)
    type('Receipt code', 'R7K2MPQ')
    fireEvent.click(nextBtn('Look up'))
    await waitFor(() => screen.getByText(text))
  })

  it.each([
    ['files_not_deleted', /could not be deleted/],
    ['forbidden', /Not allowed/],
    ['failed', /Could not withdraw/],
    ['not_found', /Nothing to withdraw/],
  ] as const)('outcome %s explained', async (outcome, text) => {
    render(
      <WithdrawSection
        api={{ previewWithdraw: async () => preview, withdraw: async () => ({ outcome, participantId: ID }) }}
      />,
    )
    type('Receipt code', 'R7K2MPQ')
    fireEvent.click(nextBtn('Look up'))
    await waitFor(() => screen.getByLabelText('Type the code again to confirm'))
    type('Type the code again to confirm', 'R7K2MPQ')
    fireEvent.click(nextBtn('Withdraw and delete'))
    await waitFor(() => screen.getByText(text))
  })

  it('a failed look-up says so', async () => {
    render(<WithdrawSection api={{ previewWithdraw: async () => Promise.reject(new Error('x')), withdraw: vi.fn() }} />)
    type('Receipt code', 'R7K2MPQ')
    fireEvent.click(nextBtn('Look up'))
    await waitFor(() => screen.getByText(/Could not look that up/))
  })
})
