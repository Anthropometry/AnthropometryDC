// @vitest-environment jsdom
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AuthClient } from '../lib/auth'
import type { CaptchaProps } from '../components/Turnstile'
import type { Profile } from '../lib/profile'
import { InstallHelp } from '../components/InstallArea'
import { AppView, type AppViewProps } from '../App'
import { Join } from './Join'
import { SignIn } from './SignIn'

afterEach(cleanup)

/** Stands in for Turnstile: passes at once and records every reset. */
const resets: number[] = []
function PassingCaptcha({ onToken, resetKey }: CaptchaProps) {
  useEffect(() => {
    resets.push(resetKey)
    onToken(`tok-${resetKey}`)
  }, [resetKey, onToken])
  return <div>safety check</div>
}
function SilentCaptcha() {
  return <div>safety check</div>
}

function fakeClient() {
  const signUp = vi.fn(async () => ({ error: null }))
  const setSession = vi.fn(async () => ({ error: null }))
  return { client: { auth: { signUp, setSession } } as unknown as AuthClient, signUp, setSession }
}

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

function fillJoin(pin = '482916', confirm = pin) {
  type('Invite code', 'abcd-2345')
  type('Your name (collector)', 'Ama Mensah')
  type('Phone number', '024 123 4567')
  type('Choose a 6-digit PIN', pin)
  type('Type the PIN again', confirm)
}

describe('Join screen', () => {
  it('DENY: Join stays disabled until every field is valid and the safety check passed', () => {
    const { client } = fakeClient()
    render(<Join client={client} onJoined={vi.fn()} onBack={vi.fn()} Captcha={SilentCaptcha} />)
    const join = screen.getByRole('button', { name: 'Join' })
    expect((join as HTMLButtonElement).disabled).toBe(true)
    fillJoin()
    expect((join as HTMLButtonElement).disabled).toBe(true) // no safety-check token yet
  })

  it('ALLOW: valid form joins and calls onJoined', async () => {
    const { client, signUp } = fakeClient()
    const onJoined = vi.fn()
    render(<Join client={client} onJoined={onJoined} onBack={vi.fn()} Captcha={PassingCaptcha} />)
    fillJoin()
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(onJoined).toHaveBeenCalled())
    expect(signUp).toHaveBeenCalledOnce()
  })

  it('DENY: weak PIN shows a plain message and never calls the server', () => {
    const { client, signUp } = fakeClient()
    render(<Join client={client} onJoined={vi.fn()} onBack={vi.fn()} Captcha={PassingCaptcha} />)
    fillJoin('123456')
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(screen.getByRole('alert').textContent).toMatch(/too easy to guess/)
    expect(signUp).not.toHaveBeenCalled()
  })

  it('has no email field, and only the collector’s own name', () => {
    const { client } = fakeClient()
    const { container } = render(<Join client={client} onJoined={vi.fn()} onBack={vi.fn()} Captcha={SilentCaptcha} />)
    expect(container.querySelector('input[type="email"]')).toBeNull()
    expect(container.textContent?.toLowerCase()).not.toContain('email')
    expect(screen.getAllByLabelText(/name/i)).toHaveLength(1)
  })
})

describe('Sign in screen', () => {
  it('DENY: wrong PIN shows only the generic message and asks for a new safety check', async () => {
    const { client } = fakeClient()
    resets.length = 0
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: 'wrong_credentials' }), { status: 401 }))
    render(<SignIn client={client} onSignedIn={vi.fn()} onBack={vi.fn()} fetchFn={fetchFn} Captcha={PassingCaptcha} />)
    type('Phone number', '0241234567')
    type('6-digit PIN', '000001')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Phone number or PIN is not right.'))
    expect(resets).toEqual([0, 1]) // a fresh check after the failure
    expect((screen.getByLabelText('6-digit PIN') as HTMLInputElement).value).toBe('')
  })

  it('DENY: locked account shows the wait message', async () => {
    const { client, setSession } = fakeClient()
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: 'locked', retryAfter: 900 }), { status: 429 }))
    render(<SignIn client={client} onSignedIn={vi.fn()} onBack={vi.fn()} fetchFn={fetchFn} Captcha={PassingCaptcha} />)
    type('Phone number', '0241234567')
    type('6-digit PIN', '482916')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Try again in 15 minutes'))
    expect(setSession).not.toHaveBeenCalled()
  })

  it('ALLOW: right PIN stores the session and calls onSignedIn', async () => {
    const { client, setSession } = fakeClient()
    const onSignedIn = vi.fn()
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r' })))
    render(<SignIn client={client} onSignedIn={onSignedIn} onBack={vi.fn()} fetchFn={fetchFn} Captcha={PassingCaptcha} />)
    type('Phone number', '0241234567')
    type('6-digit PIN', '482916')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled())
    expect(setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' })
  })
})

describe('Install help', () => {
  it('Android with prompt: the Install app button calls install', () => {
    const onInstall = vi.fn()
    render(<InstallHelp mode="android-button" onInstall={onInstall} />)
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }))
    expect(onInstall).toHaveBeenCalled()
  })
  it('iPhone Safari: picture guide with Share and Add to Home Screen', () => {
    render(<InstallHelp mode="ios-safari" onInstall={vi.fn()} />)
    screen.getByText('Share')
    screen.getByText('Add to Home Screen')
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('iPhone in another browser: open in Safari', () => {
    render(<InstallHelp mode="ios-other-browser" onInstall={vi.fn()} />)
    screen.getByText('Safari')
  })
  it('installed: nothing shown', () => {
    const { container } = render(<InstallHelp mode="installed" onInstall={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('routing by status', () => {
  const base = (profile: Profile | null, view: AppViewProps['view'] = 'main'): AppViewProps => ({
    profile,
    view,
    online: true,
    setView: vi.fn(),
    onAuthChanged: vi.fn(),
    onSignOut: vi.fn(),
    join: <p>JOIN SCREEN</p>,
    signIn: <p>SIGN IN SCREEN</p>,
    admin: <p>ADMIN SCREEN</p>,
    install: null,
  })
  const P: Profile = { id: 'u', displayName: 'Ama', status: 'approved', role: 'collector' }

  it('signed out → Welcome; join and sign-in views', () => {
    const { rerender } = render(<AppView {...base(null)} />)
    screen.getByRole('button', { name: 'Join with invite code' })
    rerender(<AppView {...base(null, 'join')} />)
    screen.getByText('JOIN SCREEN')
    rerender(<AppView {...base(null, 'signin')} />)
    screen.getByText('SIGN IN SCREEN')
  })

  it('pending → Waiting with the collector’s name', () => {
    render(<AppView {...base({ ...P, status: 'pending' })} />)
    screen.getByText('Waiting for approval')
    screen.getByText(/Hello Ama/)
  })

  it('approved → Home; offline shows the banner', () => {
    render(<AppView {...base(P)} online={false} />)
    screen.getByText('Hello Ama')
    expect(screen.getByRole('status').textContent).toMatch(/offline/)
  })

  it.each(['rejected', 'disabled'] as const)('%s → not active', (status) => {
    render(<AppView {...base({ ...P, status })} />)
    screen.getByText('Your account is not active. Contact Ryan.')
  })

  it('DENY: a collector never reaches the admin screen; an admin does', () => {
    const { rerender } = render(<AppView {...base(P, 'admin')} />)
    expect(screen.queryByText('ADMIN SCREEN')).toBeNull()
    expect(screen.queryByRole('button', { name: /Admin/ })).toBeNull()
    rerender(<AppView {...base({ ...P, role: 'admin' }, 'admin')} />)
    screen.getByText('ADMIN SCREEN')
  })

  it('DENY: pending admin is still only waiting', () => {
    render(<AppView {...base({ ...P, role: 'admin', status: 'pending' }, 'admin')} />)
    expect(screen.queryByText('ADMIN SCREEN')).toBeNull()
  })
})
