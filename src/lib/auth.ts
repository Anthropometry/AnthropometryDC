/**
 * Join (invite code) and Sign in (phone + PIN) for collectors. The phone becomes the hidden login
 * id in code; no email is ever shown or sent. Sign-in goes through the Worker (/api/login) so
 * wrong PINs are counted per account. Both need a Turnstile token, which Supabase enforces.
 */
import { isValidPin, phoneToLoginId } from './phone'
import {
  isValidDisplayName,
  isValidInviteCode,
  newPinProblem,
  normaliseDisplayName,
  normaliseInviteCode,
} from './validate'

/** The parts of the Supabase client this module uses (small, so tests can fake them). */
export interface AuthClient {
  auth: {
    signUp(credentials: {
      email: string
      password: string
      options: { data: Record<string, string>; captchaToken?: string }
    }): Promise<{ error: { status?: number; code?: string; message: string } | null }>
    setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ error: unknown }>
  }
}

export type AuthFailure =
  | 'invalid_phone'
  | 'invalid_pin'
  | 'weak_pin'
  | 'pin_mismatch'
  | 'invalid_name'
  | 'invalid_invite'
  | 'already_joined'
  | 'wrong_credentials'
  | 'locked'
  | 'rate_limited'
  | 'captcha'
  | 'unavailable'
  | 'network'

export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure; retryAfter?: number }

const fail = (reason: AuthFailure, retryAfter?: number): AuthResult =>
  retryAfter === undefined ? { ok: false, reason } : { ok: false, reason, retryAfter }

export interface JoinInput {
  inviteCode: string
  name: string
  phone: string
  pin: string
  confirmPin: string
  captchaToken: string
}

export async function joinWithInvite(client: AuthClient, input: JoinInput): Promise<AuthResult> {
  if (!isValidInviteCode(input.inviteCode)) return fail('invalid_invite')
  if (!isValidDisplayName(input.name)) return fail('invalid_name')
  const loginId = phoneToLoginId(input.phone)
  if (!loginId) return fail('invalid_phone')
  const pinProblem = newPinProblem(input.pin, input.confirmPin)
  if (pinProblem === 'format') return fail('invalid_pin')
  if (pinProblem === 'weak') return fail('weak_pin')
  if (pinProblem === 'mismatch') return fail('pin_mismatch')
  if (!input.captchaToken) return fail('captcha')

  try {
    const { error } = await client.auth.signUp({
      email: loginId,
      password: input.pin,
      options: {
        data: {
          invite_code: normaliseInviteCode(input.inviteCode),
          display_name: normaliseDisplayName(input.name),
        },
        captchaToken: input.captchaToken,
      },
    })
    if (!error) return { ok: true }
    const text = `${error.code ?? ''} ${error.message}`.toLowerCase()
    if (error.status === 429) return fail('rate_limited')
    if (text.includes('captcha')) return fail('captcha')
    if (text.includes('invalid_invite')) return fail('invalid_invite')
    if (text.includes('invalid_name')) return fail('invalid_name')
    if (text.includes('invalid_login')) return fail('invalid_phone')
    if (text.includes('already') || text.includes('user_already_exists')) return fail('already_joined')
    return fail('unavailable')
  } catch {
    return fail('network')
  }
}

export interface SignInInput {
  phone: string
  pin: string
  captchaToken: string
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export async function signInWithPhonePin(
  client: AuthClient,
  fetchFn: FetchLike,
  input: SignInInput,
): Promise<AuthResult> {
  if (!phoneToLoginId(input.phone)) return fail('invalid_phone')
  if (!isValidPin(input.pin)) return fail('invalid_pin')
  if (!input.captchaToken) return fail('captcha')

  let res: Response
  try {
    res = await fetchFn('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    return fail('network')
  }

  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    retryAfter?: number
    access_token?: string
    refresh_token?: string
  }
  if (res.ok && body.access_token && body.refresh_token) {
    const { error } = await client.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    })
    return error ? fail('unavailable') : { ok: true }
  }
  if (res.status === 401) return fail('wrong_credentials')
  if (res.status === 429) return body.error === 'locked' ? fail('locked', body.retryAfter ?? 900) : fail('rate_limited')
  if (res.status === 400 && (body.error === 'captcha' || body.error === 'captcha_required')) return fail('captcha')
  if (res.status === 400) return fail('wrong_credentials')
  return fail('unavailable')
}

/** Plain words for every failure. Never says whether the phone or the PIN was wrong. */
export function failureMessage(reason: AuthFailure, retryAfter?: number): string {
  switch (reason) {
    case 'invalid_phone':
      return 'Enter a Ghana mobile number, for example 024 123 4567.'
    case 'invalid_pin':
      return 'The PIN must be exactly 6 digits.'
    case 'weak_pin':
      return 'That PIN is too easy to guess. Avoid 000000, 123456 and similar.'
    case 'pin_mismatch':
      return 'The two PINs are not the same.'
    case 'invalid_name':
      return 'Enter your name (2 to 60 letters).'
    case 'invalid_invite':
      return 'This invite code is not right, has expired or has been used up. Ask Ryan for a new one.'
    case 'already_joined':
      return 'This phone number has already joined. Use Sign in instead.'
    case 'wrong_credentials':
      return 'Phone number or PIN is not right.'
    case 'locked': {
      const minutes = Math.max(1, Math.ceil((retryAfter ?? 900) / 60))
      return `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
    }
    case 'rate_limited':
      return 'Too many tries from this network. Wait a few minutes and try again.'
    case 'captcha':
      return 'The safety check did not pass. Please try the check again.'
    case 'unavailable':
      return 'The service is not available right now. Try again soon.'
    case 'network':
      return 'No internet connection. Joining and signing in need internet.'
  }
}
