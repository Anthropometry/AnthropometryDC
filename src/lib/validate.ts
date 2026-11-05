/** Input rules for Join and Sign in (specs/F1-login.md). The database and Worker check again. */
import { isValidPin } from './phone'

/** 0 O 1 I L are left out so codes are easy to read aloud and type. 31 characters. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Upper-case and drop spaces and dashes: "abcd-2345" → "ABCD2345". */
export function normaliseInviteCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

export function isValidInviteCode(input: string): boolean {
  const code = normaliseInviteCode(input)
  return code.length === 8 && [...code].every((c) => INVITE_ALPHABET.includes(c))
}

/** Trim and collapse inner spaces: "  Ama   Mensah " → "Ama Mensah". */
export function normaliseDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

export function isValidDisplayName(input: string): boolean {
  const name = normaliseDisplayName(input)
  return name.length >= 2 && name.length <= 60
}

/** Easy-to-guess PINs: one digit repeated, or a straight run up or down. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true
  const d = [...pin].map(Number)
  const steps = d.slice(1).map((x, i) => x - d[i])
  return steps.every((s) => s === 1) || steps.every((s) => s === -1)
}

export type PinProblem = 'format' | 'weak' | 'mismatch'

/** Problem with a new PIN and its confirmation, or null if both are fine. */
export function newPinProblem(pin: string, confirm: string): PinProblem | null {
  if (!isValidPin(pin)) return 'format'
  if (isWeakPin(pin)) return 'weak'
  if (pin !== confirm) return 'mismatch'
  return null
}
