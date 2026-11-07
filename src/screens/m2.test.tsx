// @vitest-environment jsdom
/** M2 screens: Setup/Settings, Home, Phone check, Practice, routing, Admin phone checks. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Profile } from '../lib/profile'
import type { PhoneCheckResult } from '../lib/phonecheck'
import type { PracticeRow } from '../lib/practice'
import { AppView, type AppViewProps } from '../App'
import { SettingsScreen } from './Settings'
import { PhoneCheck } from './PhoneCheck'
import { PracticeList, PracticeNew } from './Practice'
import { Home, type HomeProps } from './Status'
import { Admin, type AdminApi } from './Admin'

afterEach(cleanup)

const P: Profile = { id: 'u', displayName: 'Ama', status: 'approved', role: 'collector', unit: 'in', language: 'tw', settingsChosen: true }

const homeProps = (over: Partial<HomeProps> = {}): HomeProps => ({
  profile: P,
  online: true,
  collectionOpen: false,
  waiting: 0,
  lastCheck: null,
  onPracticeNew: vi.fn(),
  onPracticeList: vi.fn(),
  onRealNew: vi.fn(),
  onCheck: vi.fn(),
  onSettings: vi.fn(),
  onAdmin: vi.fn(),
  onInvite: vi.fn(),
  onSignOut: vi.fn(),
  ...over,
})

describe('F2 Setup and Settings', () => {
  it('first time: choose inches and Twi, Save sends exactly those', async () => {
    const onSave = vi.fn(async () => 'saved' as const)
    const onDone = vi.fn()
    render(<SettingsScreen first initial={{ unit: 'cm', language: 'en' }} onSave={onSave} onDone={onDone} />)
    screen.getByText('Set up the app')
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Inches (in)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Twi' }))
    expect(screen.getByRole('button', { name: 'Inches (in)' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Centimetres (cm)' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith({ unit: 'in', language: 'tw' })
  })

  it('Settings starts from the current choice and has Back; a failed save shows a message', async () => {
    const onSave = vi.fn(async () => Promise.reject(new Error('x')))
    const onDone = vi.fn()
    render(<SettingsScreen first={false} initial={{ unit: 'in', language: 'fr' }} onSave={onSave} onDone={onDone} onBack={vi.fn()} />)
    screen.getByText('Settings')
    expect(screen.getByRole('button', { name: 'French' }).getAttribute('aria-pressed')).toBe('true')
    screen.getByRole('button', { name: 'Back' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => screen.getByRole('alert'))
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('F2/F3 Home', () => {
  it('shows mode, unit, language, sync badge and no real button while collection is closed', () => {
    render(<Home {...homeProps({ waiting: 2 })} />)
    screen.getByText(/Practice only · in · Twi/)
    expect(screen.getByRole('status', { name: 'Sync' }).textContent).toBe('2 waiting to upload')
    expect(screen.queryByRole('button', { name: 'Start real participant' })).toBeNull()
    screen.getByText(/Real collection opens after ethics \(IRB\) approval/)
    screen.getByText('Not checked yet. Check before you practise.')
  })

  it('all saved; last check; real button only once collection is open', () => {
    const onRealNew = vi.fn()
    render(<Home {...homeProps({ collectionOpen: true, onRealNew, lastCheck: { passed: false, checkedAt: '2026-11-07T09:00:00Z' } })} />)
    expect(screen.getByRole('status', { name: 'Sync' }).textContent).toBe('All saved')
    screen.getByText('Last check: needs attention on 7 Nov')
    fireEvent.click(screen.getByRole('button', { name: 'Start real participant' }))
    expect(onRealNew).toHaveBeenCalled()
  })

  it('buttons call their screens', () => {
    const p = homeProps()
    render(<Home {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start practice participant' }))
    fireEvent.click(screen.getByRole('button', { name: 'My practice list' }))
    fireEvent.click(screen.getByRole('button', { name: 'Check this phone' }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect([p.onPracticeNew, p.onPracticeList, p.onCheck, p.onSettings].every((f) => (f as ReturnType<typeof vi.fn>).mock.calls.length === 1)).toBe(true)
  })
})

describe('routing (M2)', () => {
  const base = (profile: Profile | null, view: AppViewProps['view'] = 'main', over: Partial<AppViewProps> = {}): AppViewProps => ({
    profile,
    view,
    online: true,
    setView: vi.fn(),
    onAuthChanged: vi.fn(),
    onSignOut: vi.fn(),
    join: null,
    signIn: null,
    admin: <p>ADMIN</p>,
    invite: <p>INVITE</p>,
    install: null,
    setup: <p>SETUP</p>,
    settings: <p>SETTINGS</p>,
    check: <p>CHECK</p>,
    practiceNew: <p>PRACTICE NEW</p>,
    practiceList: <p>PRACTICE LIST</p>,
    ...over,
  })

  it('approved without settings → Setup, whatever view is asked for', () => {
    render(<AppView {...base({ ...P, settingsChosen: false }, 'practice-new')} />)
    screen.getByText('SETUP')
    expect(screen.queryByText('PRACTICE NEW')).toBeNull()
  })

  it.each([
    ['settings', 'SETTINGS'],
    ['check', 'CHECK'],
    ['practice-new', 'PRACTICE NEW'],
    ['practice-list', 'PRACTICE LIST'],
  ] as const)('%s view', (view, text) => {
    render(<AppView {...base(P, view)} />)
    screen.getByText(text)
  })

  it('DENY: the real participant screen is unreachable while collection is closed', () => {
    const { rerender } = render(<AppView {...base(P, 'real')} />)
    screen.getByText('Hello Ama')
    rerender(<AppView {...base(P, 'real', { collectionOpen: true })} />)
    screen.getByText('REAL COLLECTION')
  })

  it('DENY: pending collectors never reach practice or settings', () => {
    render(<AppView {...base({ ...P, status: 'pending' }, 'practice-new')} />)
    screen.getByText('Waiting for approval')
  })
})

const result = (over: Partial<PhoneCheckResult> = {}): PhoneCheckResult => ({
  phoneModel: 'TECNO KI5',
  os: 'Android 13',
  browser: 'Chrome 120',
  cameraOk: true,
  cameraResolution: '1920x1080',
  cameraProblem: null,
  motionOk: true,
  storageOk: true,
  storageMb: 2048,
  passed: true,
  checkedAt: '2026-11-07T09:00:00Z',
  ...over,
})

describe('F2 Phone check screen', () => {
  it('runs, shows each line and the phone, and saves the result', async () => {
    const save = vi.fn(async () => true)
    render(<PhoneCheck run={async () => result()} save={save} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start the check' }))
    await waitFor(() => screen.getByText('This phone is ready.'))
    screen.getByText(/Camera: OK/)
    screen.getByText(/Phone: TECNO KI5 · Android 13 · Chrome 120/)
    await waitFor(() => screen.getByText('Result saved.'))
    expect(save).toHaveBeenCalledWith(result())
  })

  it('a failing camera shows its fix; offline keeps the result on the phone', async () => {
    render(
      <PhoneCheck
        run={async () => result({ cameraOk: false, cameraProblem: 'denied', passed: false })}
        save={async () => false}
        onBack={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start the check' }))
    await waitFor(() => screen.getByText('This phone needs attention.'))
    screen.getByText(/Allow the camera for this app/)
    await waitFor(() => screen.getByText(/kept on this phone/))
  })

  it('a check that cannot run says so', async () => {
    render(<PhoneCheck run={async () => Promise.reject(new Error('x'))} save={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start the check' }))
    await waitFor(() => screen.getByRole('alert'))
  })
})

describe('F3 Practice screens', () => {
  it('PRACTICE banner; age group needed; shows the practice number', async () => {
    const create = vi.fn(async () => ({ practiceNo: 7 }))
    render(<PracticeNew create={create} onList={vi.fn()} onBack={vi.fn()} />)
    screen.getByText('PRACTICE · not real data')
    expect((screen.getByRole('button', { name: 'Start practice' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Under 18' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start practice' }))
    await waitFor(() => screen.getByText('P-0007'))
    expect(create).toHaveBeenCalledWith('child')
    screen.getByText(/Next: consent/)
  })

  it('offline: saved on the phone, number later', async () => {
    render(<PracticeNew create={async () => ({ practiceNo: null })} onList={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adult (18 or older)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start practice' }))
    await waitFor(() => screen.getByText(/gets its number when you are online/))
  })

  it('list: PRACTICE label on each; delete needs a second tap', async () => {
    const rows: PracticeRow[] = [
      { id: 'a', practiceNo: 2, ageGroup: 'adult', status: 'draft', createdAt: '2026-11-07T09:00:00Z', waiting: false },
      { id: 'b', practiceNo: null, ageGroup: 'child', status: 'draft', createdAt: '2026-11-07T10:00:00Z', waiting: true },
    ]
    const remove = vi.fn(async () => {})
    render(<PracticeList load={async () => rows} remove={remove} onNew={vi.fn()} onBack={vi.fn()} />)
    const item = await waitFor(() => screen.getByRole('listitem', { name: 'Practice P-0002' }))
    within(item).getByText('PRACTICE')
    within(screen.getByRole('listitem', { name: 'Practice P-…' })).getByText(/on this phone/)
    fireEvent.click(within(item).getByRole('button', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(within(item).getByRole('button', { name: 'Tap again to delete' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith(rows[0]))
  })

  it('list: load and delete failures show a message', async () => {
    const { unmount } = render(<PracticeList load={async () => Promise.reject(new Error('x'))} remove={vi.fn()} onNew={vi.fn()} onBack={vi.fn()} />)
    await waitFor(() => screen.getByRole('alert'))
    unmount()
    const row: PracticeRow = { id: 'a', practiceNo: 1, ageGroup: 'adult', status: 'draft', createdAt: '2026-11-07T09:00:00Z', waiting: false }
    render(<PracticeList load={async () => [row]} remove={async () => Promise.reject(new Error('x'))} onNew={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(await waitFor(() => screen.getByRole('button', { name: 'Delete' })))
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to delete' }))
    await waitFor(() => screen.getByText(/Could not delete/))
  })
})

describe('Admin: phone checks (F2)', () => {
  it('lists each collector’s latest check', async () => {
    const api: AdminApi = {
      listCollectors: async () => [],
      decide: async () => {},
      listInvites: async () => [],
      createInvite: async () => '',
      showInvite: async () => '',
      revokeInvite: async () => {},
      listPhoneChecks: async () => [
        { collectorId: 'a', displayName: 'Akosua', phoneModel: 'TECNO KI5', os: 'Android 13', browser: 'Chrome 120', passed: true, checkedAt: '2026-11-07T09:00:00Z' },
        { collectorId: 'b', displayName: 'Ann', phoneModel: null, os: null, browser: null, passed: false, checkedAt: '2026-11-06T09:00:00Z' },
      ],
    }
    render(<Admin api={api} myId="me" appUrl="x" shareEnv={{}} onBack={vi.fn()} />)
    const a = await waitFor(() => screen.getByRole('article', { name: 'Phone check: Akosua' }))
    expect(a.textContent).toContain('✓ Passed')
    expect(a.textContent).toContain('TECNO KI5 · Android 13 · Chrome 120 · 7 Nov')
    const b = screen.getByRole('article', { name: 'Phone check: Ann' })
    expect(b.textContent).toContain('Needs attention')
    expect(b.textContent).toContain('Unknown phone')
  })
})
