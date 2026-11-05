/**
 * POST /api/login — phone + 6-digit PIN sign-in with a per-account lockout (specs/F1-login.md).
 *
 * Order: validate input → lockout check (login_guard via guard secret) → Supabase password
 * sign-in with the Turnstile token forwarded unchanged → record the result → return the session.
 * Never logs the phone, PIN, login id, Turnstile token or session tokens.
 */
import { isValidPin, phoneToLoginId } from '../src/lib/phone'

export interface LoginEnv {
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  LOGIN_GUARD_SECRET?: string
}

const MAX_BODY = 8 * 1024

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  })

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Calls a login_guard_* database function. Returns seconds locked, or null if it failed. */
async function guard(env: LoginEnv, fn: 'login_guard_check' | 'login_guard_record', args: object) {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ ...args, p_secret: env.LOGIN_GUARD_SECRET }),
    })
    if (!res.ok) return null
    const seconds = (await res.json()) as unknown
    return typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : null
  } catch {
    return null
  }
}

const locked = (seconds: number) =>
  json(429, { error: 'locked', retryAfter: seconds }, { 'retry-after': String(seconds) })

export async function handleLogin(request: Request, env: LoginEnv): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if ((request.headers.get('content-type') ?? '').split(';')[0].trim() !== 'application/json') {
    return json(415, { error: 'unsupported_type' })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY) return json(413, { error: 'too_large' })
  let body: { phone?: unknown; pin?: unknown; captchaToken?: unknown }
  try {
    body = JSON.parse(raw) as typeof body
  } catch {
    return json(400, { error: 'bad_request' })
  }

  const loginId = typeof body.phone === 'string' ? phoneToLoginId(body.phone) : null
  const pin = typeof body.pin === 'string' ? body.pin : ''
  if (!loginId || !isValidPin(pin)) return json(400, { error: 'bad_request' })
  const captcha = typeof body.captchaToken === 'string' ? body.captchaToken : ''
  if (captcha.length < 1 || captcha.length > 4096) return json(400, { error: 'captcha_required' })

  // Fail safe: without the guard we refuse sign-in rather than skip the lockout.
  if (!env.LOGIN_GUARD_SECRET || env.LOGIN_GUARD_SECRET.length < 32) return json(503, { error: 'unavailable' })

  const key = await sha256Hex(loginId)
  const before = await guard(env, 'login_guard_check', { p_key: key })
  if (before === null) return json(503, { error: 'unavailable' })
  if (before > 0) return locked(before)

  let res: Response
  try {
    res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email: loginId, password: pin, gotrue_meta_security: { captcha_token: captcha } }),
    })
  } catch {
    return json(502, { error: 'upstream' })
  }

  if (res.ok) {
    const session = (await res.json()) as { access_token?: unknown; refresh_token?: unknown }
    if (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') {
      return json(502, { error: 'upstream' })
    }
    await guard(env, 'login_guard_record', { p_key: key, p_ok: true })
    return json(200, { access_token: session.access_token, refresh_token: session.refresh_token })
  }

  if (res.status === 429) return json(429, { error: 'rate_limited' })

  const err = (await res.json().catch(() => ({}))) as { error_code?: string; error?: string; msg?: string }
  const code = `${err.error_code ?? ''} ${err.error ?? ''} ${err.msg ?? ''}`.toLowerCase()
  if (code.includes('captcha')) return json(400, { error: 'captcha' }) // not counted as a wrong PIN
  if (res.status === 400 && (code.includes('invalid_credentials') || code.includes('invalid_grant'))) {
    const after = await guard(env, 'login_guard_record', { p_key: key, p_ok: false })
    if (after === null) return json(503, { error: 'unavailable' })
    if (after > 0) return locked(after)
    return json(401, { error: 'wrong_credentials' })
  }
  return json(502, { error: 'upstream' })
}
