import { describe, expect, it, vi } from 'vitest'
import { failureMessage, joinWithInvite, signInWithPhonePin, type AuthClient, type AuthFailure } from './auth'

function fakeClient(signUpError: { status?: number; code?: string; message: string } | null | Error = null) {
  const signUp = vi.fn(async () => {
    if (signUpError instanceof Error) throw signUpError
    return { error: signUpError }
  })
  const setSession = vi.fn(async () => ({ error: null }))
  return { client: { auth: { signUp, setSession } } as unknown as AuthClient, signUp, setSession }
}

const JOIN = {
  inviteCode: 'abcd-2345',
  name: '  Ama   Mensah ',
  phone: '024 123 4567',
  pin: '482916',
  confirmPin: '482916',
  captchaToken: 'tok',
}

describe('joinWithInvite', () => {
  it('ALLOW: sends the hidden login id, normalised code and name, and the Turnstile token', async () => {
    const { client, signUp } = fakeClient()
    expect(await joinWithInvite(client, JOIN)).toEqual({ ok: true })
    expect(signUp).toHaveBeenCalledWith({
      email: '233241234567@phone.anthro-collect.invalid',
      password: '482916',
      options: { data: { invite_code: 'ABCD2345', display_name: 'Ama Mensah' }, captchaToken: 'tok' },
    })
    expect(JSON.stringify(signUp.mock.calls)).not.toContain('024 123 4567')
  })

  it.each<[string, Partial<typeof JOIN>, AuthFailure]>([
    ['bad code format', { inviteCode: 'ABC' }, 'invalid_invite'],
    ['no name', { name: ' ' }, 'invalid_name'],
    ['bad phone', { phone: '12345' }, 'invalid_phone'],
    ['short PIN', { pin: '4829', confirmPin: '4829' }, 'invalid_pin'],
    ['weak PIN', { pin: '123456', confirmPin: '123456' }, 'weak_pin'],
    ['PINs differ', { confirmPin: '482917' }, 'pin_mismatch'],
    ['no Turnstile token', { captchaToken: '' }, 'captcha'],
  ])('DENY before any network call: %s', async (_l, change, reason) => {
    const { client, signUp } = fakeClient()
    expect(await joinWithInvite(client, { ...JOIN, ...change })).toEqual({ ok: false, reason })
    expect(signUp).not.toHaveBeenCalled()
  })

  it.each<[{ status?: number; code?: string; message: string }, AuthFailure]>([
    [{ status: 400, message: 'invalid_invite' }, 'invalid_invite'],
    [{ status: 400, message: 'invalid_name' }, 'invalid_name'],
    [{ status: 400, message: 'invalid_login' }, 'invalid_phone'],
    [{ status: 422, code: 'user_already_exists', message: 'User already registered' }, 'already_joined'],
    [{ status: 400, code: 'captcha_failed', message: 'captcha protection: request disallowed' }, 'captcha'],
    [{ status: 429, message: 'Too many requests' }, 'rate_limited'],
    [{ status: 500, message: 'Database error saving new user' }, 'unavailable'],
  ])('maps server refusal %j', async (error, reason) => {
    const { client } = fakeClient(error)
    expect(await joinWithInvite(client, JOIN)).toEqual({ ok: false, reason })
  })

  it('network failure', async () => {
    const { client } = fakeClient(new Error('offline'))
    expect(await joinWithInvite(client, JOIN)).toEqual({ ok: false, reason: 'network' })
  })
})

describe('signInWithPhonePin (through the Worker)', () => {
  const input = { phone: '0241234567', pin: '482916', captchaToken: 'tok' }
  const fetchReturning = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }))

  it('ALLOW: posts to /api/login and stores the session', async () => {
    const { client, setSession } = fakeClient()
    const f = fetchReturning(200, { access_token: 'a', refresh_token: 'r' })
    expect(await signInWithPhonePin(client, f, input)).toEqual({ ok: true })
    expect(f).toHaveBeenCalledWith('/api/login', expect.objectContaining({ method: 'POST' }))
    expect(setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' })
  })

  it.each<[number, unknown, AuthFailure, number | undefined]>([
    [401, { error: 'wrong_credentials' }, 'wrong_credentials', undefined],
    [429, { error: 'locked', retryAfter: 600 }, 'locked', 600],
    [429, { error: 'rate_limited' }, 'rate_limited', undefined],
    [400, { error: 'captcha' }, 'captcha', undefined],
    [400, { error: 'bad_request' }, 'wrong_credentials', undefined],
    [503, { error: 'unavailable' }, 'unavailable', undefined],
    [200, { nope: true }, 'unavailable', undefined],
  ])('maps %i %j', async (status, body, reason, retryAfter) => {
    const { client, setSession } = fakeClient()
    const r = await signInWithPhonePin(client, fetchReturning(status, body), input)
    expect(r).toEqual(retryAfter === undefined ? { ok: false, reason } : { ok: false, reason, retryAfter })
    expect(setSession).not.toHaveBeenCalled()
  })

  it.each<[Partial<typeof input>, AuthFailure]>([
    [{ phone: '123' }, 'invalid_phone'],
    [{ pin: '12' }, 'invalid_pin'],
    [{ captchaToken: '' }, 'captcha'],
  ])('DENY before any network call: %j', async (change, reason) => {
    const { client } = fakeClient()
    const f = vi.fn()
    expect(await signInWithPhonePin(client, f, { ...input, ...change })).toEqual({ ok: false, reason })
    expect(f).not.toHaveBeenCalled()
  })

  it('network failure and a failed setSession', async () => {
    const { client } = fakeClient()
    expect(await signInWithPhonePin(client, vi.fn(async () => Promise.reject(new Error('x'))), input)).toEqual({
      ok: false,
      reason: 'network',
    })
    const broken = {
      auth: { signUp: vi.fn(), setSession: vi.fn(async () => ({ error: new Error('bad') })) },
    } as unknown as AuthClient
    expect(await signInWithPhonePin(broken, fetchReturning(200, { access_token: 'a', refresh_token: 'r' }), input)).toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })
})

describe('failureMessage', () => {
  const reasons: AuthFailure[] = [
    'invalid_phone',
    'invalid_pin',
    'weak_pin',
    'pin_mismatch',
    'invalid_name',
    'invalid_invite',
    'already_joined',
    'wrong_credentials',
    'locked',
    'rate_limited',
    'captcha',
    'unavailable',
    'network',
  ]
  it.each(reasons)('%s has a plain message', (r) => expect(failureMessage(r).length).toBeGreaterThan(10))

  it('a wrong PIN never says whether the phone or the PIN was wrong', () => {
    expect(failureMessage('wrong_credentials')).toBe('Phone number or PIN is not right.')
  })
  it('lock message counts minutes', () => {
    expect(failureMessage('locked', 900)).toBe('Too many wrong PINs. Try again in 15 minutes.')
    expect(failureMessage('locked', 30)).toBe('Too many wrong PINs. Try again in 1 minute.')
  })
})
