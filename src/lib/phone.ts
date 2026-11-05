/**
 * Normalise a Ghana phone number to E.164 (+233XXXXXXXXX).
 * Accepts "024 123 4567", "0241234567", "233241234567", "+233 24 123 4567".
 * Returns null when the input is not a valid Ghana mobile number.
 */
export function normaliseGhanaPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '')
  let national: string
  if (/^\+233\d{9}$/.test(digits)) national = digits.slice(4)
  else if (/^233\d{9}$/.test(digits)) national = digits.slice(3)
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1)
  else return null
  // Mobile numbers start with 2 or 5 after the leading 0.
  if (!/^[25]\d{8}$/.test(national)) return null
  return `+233${national}`
}

/** A PIN is exactly six digits. */
export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}
