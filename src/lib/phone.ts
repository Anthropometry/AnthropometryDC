/**
 * Collector phone numbers, from any country (F1 Amendment A1).
 *
 * Accepted (spaces, dashes, dots and brackets ignored):
 *   - international: "+234 803 123 4567", "00234 803 123 4567"  → +2348031234567
 *   - Ghana local:   "024 123 4567", "0241234567"               → +233241234567
 *   - Ghana without +: "233 24 123 4567"                        → +233241234567
 * Result is E.164: "+" then 8–15 digits, first digit not 0. Ghana numbers must also be mobile
 * numbers (2 or 5 after the country code), which catches the most common typos.
 */
export function normalisePhone(input: string): string | null {
  const s = input.replace(/[\s\-().]/g, '')
  let digits: string
  if (/^0[25]\d{8}$/.test(s)) digits = `233${s.slice(1)}`
  else if (/^\+\d+$/.test(s)) digits = s.slice(1)
  else if (/^00\d+$/.test(s)) digits = s.slice(2)
  else if (/^233\d{9}$/.test(s)) digits = s
  else return null

  if (!/^[1-9]\d{7,14}$/.test(digits)) return null
  if (digits.startsWith('233') && !/^233[25]\d{8}$/.test(digits)) return null
  return `+${digits}`
}

/** A PIN is exactly six digits. */
export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

/**
 * Domain for the hidden login id. `.invalid` is reserved (RFC 2606) and can never receive mail.
 * The id is built only in code: never shown to anyone, never typed, never mailed.
 */
export const LOGIN_ID_DOMAIN = 'phone.anthro-collect.invalid'

/**
 * Map a phone number to the hidden, email-shaped login id Supabase Auth stores.
 * "024 123 4567" → "233241234567@phone.anthro-collect.invalid". Null if the phone is invalid.
 */
export function phoneToLoginId(input: string): string | null {
  const e164 = normalisePhone(input)
  return e164 ? `${e164.slice(1)}@${LOGIN_ID_DOMAIN}` : null
}

/** Reverse of phoneToLoginId. */
export function loginIdToPhone(loginId: string): string | null {
  const m = loginId.match(/^([1-9]\d{7,14})@(.+)$/)
  return m && m[2] === LOGIN_ID_DOMAIN ? `+${m[1]}` : null
}

/** For display only: "+233205552668" → "+233 20 555 2668". Other countries are shown as stored. */
export function formatPhone(e164: string): string {
  const m = e164.match(/^\+233(\d{2})(\d{3})(\d{4})$/)
  return m ? `+233 ${m[1]} ${m[2]} ${m[3]}` : e164
}
