// @vitest-environment jsdom
/** F7 screens: Waiting to send, the badge, the sign-out question, Update ready. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SyncScreen, showMb } from './Sync'
import { Home } from './Status'
import type { SyncSummary } from '../lib/sync'
import type { Profile } from '../lib/profile'

afterEach(cleanup)

const summary = (over: Partial<SyncSummary> = {}): SyncSummary => ({
  consents: 1,
  measurements: 3,
  photos: 2,
  bytes: 820_000,
  stuck: 1,
  participants: [
    { participantId: 'aaaa1111-0000-4000-8000-000000000001', kinds: ['measurement', 'photo'], stuck: false, reason: null },
    { participantId: 'bbbb2222-0000-4000-8000-000000000002', kinds: ['consent'], stuck: true, reason: 'The server’s checks refused a value. Tell the project lead; nothing is lost.' },
  ],
  ...over,
})
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement

describe('Waiting to send', () => {
  it('counts, size, last sent, stuck participants with a plain reason; never a name', async () => {
    render(
      <SyncScreen
        online
        lastSentAt={null}
        load={async () => ({ summary: summary(), labels: { 'aaaa1111-0000-4000-8000-000000000001': 'P-0007' } })}
        sendNow={vi.fn(async () => undefined)}
        onBack={vi.fn()}
      />,
    )
    await waitFor(() => screen.getByText('Measurement changes: 3'))
    screen.getByText('Consents: 1')
    screen.getByText('Photos: 2')
    screen.getByText(/About 0\.8 MB still to send/)
    screen.getByRole('alert')
    screen.getByText(/1 participant needs attention\. Nothing is deleted/)
    screen.getByText('P-0007')
    screen.getByText('ID BBBB')
    screen.getByText(/checks refused a value/)
    screen.getByText(/Last sent: not yet/)
  })

  it('Send now sends and re-reads; it is off without signal; Back works', async () => {
    const sendNow = vi.fn(async () => undefined)
    const load = vi.fn(async () => ({ summary: summary(), labels: {} }))
    const onBack = vi.fn()
    const { unmount } = render(<SyncScreen online lastSentAt="2026-11-13T09:05:00Z" load={load} sendNow={sendNow} onBack={onBack} />)
    await waitFor(() => screen.getByText('Consents: 1'))
    fireEvent.click(btn('Send now'))
    await waitFor(() => expect(sendNow).toHaveBeenCalled())
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    fireEvent.click(btn('Back'))
    expect(onBack).toHaveBeenCalled()
    unmount()
    render(<SyncScreen online={false} lastSentAt={null} load={load} sendNow={sendNow} onBack={onBack} />)
    await waitFor(() => screen.getByText('Consents: 1'))
    expect(btn(/Send now/).disabled).toBe(true)
  })

  it('nothing waiting → All saved', async () => {
    render(<SyncScreen online lastSentAt={null} load={async () => ({ summary: summary({ consents: 0, measurements: 0, photos: 0, stuck: 0, participants: [] }), labels: {} })} sendNow={vi.fn()} onBack={vi.fn()} />)
    await waitFor(() => screen.getByText(/All saved\. Nothing is waiting/))
  })

  it('sizes', () => {
    expect(showMb(40_000)).toBe('40 KB')
    expect(showMb(1_500_000)).toBe('1.5 MB')
  })
})

const P: Profile = { id: 'me', phone: '+233241111111', displayName: 'Ama', role: 'collector', status: 'approved', unit: 'cm', language: 'en' } as unknown as Profile
function home(over: Partial<Parameters<typeof Home>[0]> = {}) {
  const props = {
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
    onSync: vi.fn(),
    onUpdate: vi.fn(),
    ...over,
  }
  render(<Home {...props} />)
  return props
}

describe('Home (F7)', () => {
  it('badge: waiting, needs attention, all saved; tapping it opens Waiting to send', () => {
    const p = home({ waiting: 4 })
    fireEvent.click(btn(/Sync: 4 waiting to upload/))
    expect(p.onSync).toHaveBeenCalled()
    cleanup()
    home({ waiting: 4, stuck: 2 })
    btn(/Sync: 2 need attention/)
    cleanup()
    home()
    btn(/Sync: All saved/)
  })

  it('DENY: sign out with items waiting asks first; Back cancels; nothing waiting signs out at once', () => {
    const p = home({ waiting: 3 })
    fireEvent.click(btn('Sign out'))
    expect(p.onSignOut).not.toHaveBeenCalled()
    screen.getByText(/3 items are still on this phone and not sent/)
    fireEvent.click(btn('Back'))
    screen.getByText('Hello Ama')
    fireEvent.click(btn('Sign out'))
    fireEvent.click(btn('Sign out anyway'))
    expect(p.onSignOut).toHaveBeenCalledTimes(1)
    cleanup()
    const q = home({ waiting: 0 })
    fireEvent.click(btn('Sign out'))
    expect(q.onSignOut).toHaveBeenCalledTimes(1)
  })

  it('Update ready shows on Home with Restart now', () => {
    const p = home({ updateReady: true })
    fireEvent.click(btn('Restart now'))
    expect(p.onUpdate).toHaveBeenCalled()
    cleanup()
    home()
    expect(screen.queryByRole('button', { name: 'Restart now' })).toBeNull()
  })
})
