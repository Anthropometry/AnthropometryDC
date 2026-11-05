import { describe, expect, it, vi } from 'vitest'
import { signInWithPhonePin, type PasswordAuth } from './auth'

function fakeClient(result: Awaited<ReturnType<PasswordAuth['auth']['signInWithPassword']>> | Error) {
  const signInWithPassword = vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  return { client: { auth: { signInWithPassword } } as PasswordAuth, signInWithPassword }
}

describe('signInWithPhonePin', () => {
  it('sends the hidden login id and PIN, never the raw phone', async () => {
    const { client, signInWithPassword } = fakeClient({ error: null })
    expect(await signInWithPhonePin(client, '024 123 4567', '123456')).toEqual({ ok: true })
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: '233241234567@phone.anthro-collect.invalid',
      password: '123456',
    })
  })

  it('rejects an invalid phone without calling the server', async () => {
    const { client, signInWithPassword } = fakeClient({ error: null })
    expect(await signInWithPhonePin(client, '12345', '123456')).toEqual({ ok: false, reason: 'invalid_phone' })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('rejects a PIN that is not six digits without calling the server', async () => {
    const { client, signInWithPassword } = fakeClient({ error: null })
    expect(await signInWithPhonePin(client, '0241234567', '12345')).toEqual({ ok: false, reason: 'invalid_pin' })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('reports a wrong PIN plainly', async () => {
    const { client } = fakeClient({ error: { status: 400, message: 'Invalid login credentials' } })
    expect(await signInWithPhonePin(client, '0241234567', '000000')).toEqual({
      ok: false,
      reason: 'wrong_credentials',
    })
  })

  it('reports rate limiting', async () => {
    const { client } = fakeClient({ error: { status: 429, message: 'Too many requests' } })
    expect(await signInWithPhonePin(client, '0241234567', '000000')).toEqual({ ok: false, reason: 'rate_limited' })
  })

  it('reports a network failure', async () => {
    const { client } = fakeClient(new Error('offline'))
    expect(await signInWithPhonePin(client, '0241234567', '123456')).toEqual({ ok: false, reason: 'network' })
  })
})
