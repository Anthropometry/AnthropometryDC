import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './index'

const SECRET = 's'.repeat(48)
const RIGHT_PIN = '482916'
const PHONE = '024 123 4567'
const LOGIN_ID = '233241234567@phone.anthro-collect.invalid'

// A fake Supabase: login_guard functions with the real lockout rule, and the password endpoint.
let guardFails: Map<string, number>
let lockedUntil: Map<string, number>
let guardDown: boolean
let calls: { url: string; body: Record<string, unknown> }[]
let tokenResponse: (body: Record<string, unknown>) => Response

beforeEach(() => {
  guardFails = new Map()
  lockedUntil = new Map()
  guardDown = false
  calls = []
  tokenResponse = (body) => {
    const captcha = (body.gotrue_meta_security as { captcha_token?: string })?.captcha_token
    if (captcha !== 'good-captcha') return Response.json({ error_code: 'captcha_failed' }, { status: 400 })
    return body.email === LOGIN_ID && body.password === RIGHT_PIN
      ? Response.json({ access_token: 'acc', refresh_token: 'ref', user: { id: 'u' } })
      : Response.json({ error_code: 'invalid_credentials' }, { status: 400 })
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      calls.push({ url, body })
      if (url.includes('/rest/v1/rpc/login_guard_')) {
        if (guardDown) return new Response('down', { status: 500 })
        if (body.p_secret !== SECRET) return Response.json({ message: 'not allowed' }, { status: 403 })
        const key = String(body.p_key)
        const left = () => Math.max(0, Math.ceil(((lockedUntil.get(key) ?? 0) - Date.now()) / 1000))
        if (url.endsWith('login_guard_check')) return Response.json(left())
        if (body.p_ok) {
          guardFails.delete(key)
          return Response.json(0)
        }
        const n = (guardFails.get(key) ?? 0) + 1
        guardFails.set(key, n)
        if (n >= 5) {
          lockedUntil.set(key, Date.now() + 900_000)
          guardFails.set(key, 0)
          return Response.json(900)
        }
        return Response.json(0)
      }
      if (url.includes('/auth/v1/token?grant_type=password')) return tokenResponse(body)
      return new Response('unexpected', { status: 500 })
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const env = (over: Partial<Env> = {}): Env => ({
  PHOTOS: {} as R2Bucket,
  SIGNATURES: {} as R2Bucket,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  LOGIN_GUARD_SECRET: SECRET,
  ...over,
})

const login = (body: unknown, e = env(), init: RequestInit = {}) =>
  worker.fetch(
    new Request('https://app.test/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...init,
    }),
    e,
  )

const attempt = (pin: string, phone = PHONE) => login({ phone, pin, captchaToken: 'good-captcha' })
const supabaseCalls = () => calls.filter((c) => c.url.includes('/auth/v1/token')).length

describe('POST /api/login: allow', () => {
  it('right PIN returns only the two session tokens', async () => {
    const res = await attempt(RIGHT_PIN)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ access_token: 'acc', refresh_token: 'ref' })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('sends the hidden login id, never the raw phone, and forwards the Turnstile token unchanged', async () => {
    await attempt(RIGHT_PIN)
    const token = calls.find((c) => c.url.includes('/auth/v1/token'))!
    expect(token.body).toEqual({
      email: LOGIN_ID,
      password: RIGHT_PIN,
      gotrue_meta_security: { captcha_token: 'good-captcha' },
    })
    expect(JSON.stringify(calls)).not.toContain('024 123 4567')
  })

  it('the guard key is a SHA-256 of the login id, not the phone', async () => {
    await attempt(RIGHT_PIN)
    const key = String(calls[0].body.p_key)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toContain('233241234567')
  })
})

describe('POST /api/login: deny', () => {
  it('wrong PIN gives the generic 401', async () => {
    const res = await attempt('000001')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'wrong_credentials' })
  })

  it('the 5th wrong PIN locks; then even the right PIN is refused without asking Supabase', async () => {
    for (let i = 0; i < 4; i++) expect((await attempt('000001')).status).toBe(401)
    const fifth = await attempt('000001')
    expect(fifth.status).toBe(429)
    expect(fifth.headers.get('retry-after')).toBe('900')
    const before = supabaseCalls()
    const right = await attempt(RIGHT_PIN)
    expect(right.status).toBe(429)
    expect(await right.json()).toMatchObject({ error: 'locked' })
    expect(supabaseCalls()).toBe(before)
  })

  it('an international number signs in with its own hidden id', async () => {
    tokenResponse = (body) =>
      body.email === '2348031234567@phone.anthro-collect.invalid'
        ? Response.json({ access_token: 'acc', refresh_token: 'ref' })
        : Response.json({ error_code: 'invalid_credentials' }, { status: 400 })
    expect((await attempt(RIGHT_PIN, '+234 803 123 4567')).status).toBe(200)
  })

  it('DENY: a number without country code never reaches Supabase', async () => {
    expect((await attempt(RIGHT_PIN, '803 123 4567')).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('a lock on one account does not affect another', async () => {
    for (let i = 0; i < 5; i++) await attempt('000001')
    expect((await attempt('000001', '0551234567')).status).toBe(401)
  })

  it('a right PIN clears earlier wrong PINs', async () => {
    for (let i = 0; i < 4; i++) await attempt('000001')
    expect((await attempt(RIGHT_PIN)).status).toBe(200)
    expect((await attempt('000001')).status).toBe(401) // counting starts again
  })

  it('the lock ends after its time', async () => {
    for (let i = 0; i < 5; i++) await attempt('000001')
    lockedUntil.clear()
    expect((await attempt(RIGHT_PIN)).status).toBe(200)
  })

  it('a failed Turnstile check is refused and not counted as a wrong PIN', async () => {
    for (let i = 0; i < 6; i++) {
      const res = await login({ phone: PHONE, pin: '000001', captchaToken: 'bad' })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'captcha' })
    }
    expect((await attempt(RIGHT_PIN)).status).toBe(200)
  })

  it.each([
    ['no Turnstile token', { phone: PHONE, pin: RIGHT_PIN }, 'captcha_required'],
    ['bad phone', { phone: '12345', pin: RIGHT_PIN, captchaToken: 'good-captcha' }, 'bad_request'],
    ['short PIN', { phone: PHONE, pin: '4829', captchaToken: 'good-captcha' }, 'bad_request'],
    ['PIN not a string', { phone: PHONE, pin: 482916, captchaToken: 'good-captcha' }, 'bad_request'],
    ['email instead of phone', { phone: 'a@b.com', pin: RIGHT_PIN, captchaToken: 'good-captcha' }, 'bad_request'],
  ])('%s → 400 without calling Supabase or the guard', async (_l, body, error) => {
    const res = await login(body)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error })
    expect(calls).toHaveLength(0)
  })

  it('broken JSON → 400; wrong content type → 415; GET → 405; huge body → 413', async () => {
    expect((await login('{nope')).status).toBe(400)
    expect(
      (await login({ phone: PHONE }, env(), { headers: { 'content-type': 'text/plain' } })).status,
    ).toBe(415)
    expect((await worker.fetch(new Request('https://app.test/api/login'), env())).status).toBe(405)
    expect((await login({ phone: PHONE, pin: RIGHT_PIN, captchaToken: 'x'.repeat(9000) })).status).toBe(413)
  })

  it('fail safe: guard unreachable → 503 and no sign-in', async () => {
    guardDown = true
    expect((await attempt(RIGHT_PIN)).status).toBe(503)
    expect(supabaseCalls()).toBe(0)
  })

  it('fail safe: missing or short guard secret → 503 and no sign-in', async () => {
    expect((await attempt(RIGHT_PIN)).status).toBe(200)
    calls = []
    expect((await login({ phone: PHONE, pin: RIGHT_PIN, captchaToken: 'good-captcha' }, env({ LOGIN_GUARD_SECRET: undefined }))).status).toBe(503)
    expect((await login({ phone: PHONE, pin: RIGHT_PIN, captchaToken: 'good-captcha' }, env({ LOGIN_GUARD_SECRET: 'short' }))).status).toBe(503)
    expect(calls).toHaveLength(0)
  })

  it('Supabase rate limit → 429 rate_limited; Supabase down → 502', async () => {
    tokenResponse = () => new Response('{}', { status: 429 })
    expect(await (await attempt(RIGHT_PIN)).json()).toEqual({ error: 'rate_limited' })
    tokenResponse = () => new Response('oops', { status: 500 })
    expect((await attempt(RIGHT_PIN)).status).toBe(502)
  })
})
