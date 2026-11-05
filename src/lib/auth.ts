import { isValidPin, phoneToLoginId } from './phone'

/** The part of the Supabase client this module uses (kept small so it is easy to fake in tests). */
export interface PasswordAuth {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): Promise<{
      error: { status?: number; message: string } | null
    }>
  }
}

export type SignInResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_phone' | 'invalid_pin' | 'wrong_credentials' | 'rate_limited' | 'network' }

/**
 * Sign a collector in with phone number + 6-digit PIN.
 * The phone is turned into the hidden login id in code; no email is ever shown or sent.
 */
export async function signInWithPhonePin(
  client: PasswordAuth,
  phone: string,
  pin: string,
): Promise<SignInResult> {
  const loginId = phoneToLoginId(phone)
  if (!loginId) return { ok: false, reason: 'invalid_phone' }
  if (!isValidPin(pin)) return { ok: false, reason: 'invalid_pin' }

  try {
    const { error } = await client.auth.signInWithPassword({ email: loginId, password: pin })
    if (!error) return { ok: true }
    if (error.status === 429) return { ok: false, reason: 'rate_limited' }
    return { ok: false, reason: 'wrong_credentials' }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
