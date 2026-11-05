import { describe, expect, it } from 'vitest'
import {
  INVITE_ALPHABET,
  isValidDisplayName,
  isValidInviteCode,
  isWeakPin,
  newPinProblem,
  normaliseDisplayName,
  normaliseInviteCode,
} from './validate'

describe('invite codes', () => {
  it('alphabet has 31 easy-to-read characters, no 0 O 1 I L', () => {
    expect(INVITE_ALPHABET).toHaveLength(31)
    expect(INVITE_ALPHABET).not.toMatch(/[0O1IL]/)
  })
  it.each([
    ['abcd-2345', 'ABCD2345'],
    [' ABCD 2345 ', 'ABCD2345'],
  ])('normalises %s', (input, out) => expect(normaliseInviteCode(input)).toBe(out))
  it.each(['ABCD2345', 'abcd-2345', 'zzzz 9999'])('accepts %s', (code) => expect(isValidInviteCode(code)).toBe(true))
  it.each(['', 'ABCD234', 'ABCD23456', 'ABCD234O', 'ABCD2341', 'ABCD234L', 'ABCD234!'])('rejects %s', (code) =>
    expect(isValidInviteCode(code)).toBe(false),
  )
})

describe('display name', () => {
  it('trims and collapses spaces', () => expect(normaliseDisplayName('  Ama   Mensah ')).toBe('Ama Mensah'))
  it.each(['Ab', 'Ama Mensah', 'x'.repeat(60), '  Kofi  '])('accepts %s', (n) => expect(isValidDisplayName(n)).toBe(true))
  it.each(['', 'A', '   ', ' A ', 'x'.repeat(61)])('rejects %s', (n) => expect(isValidDisplayName(n)).toBe(false))
})

describe('PIN rules', () => {
  it.each(['000000', '111111', '999999', '012345', '123456', '456789', '987654', '654321', '543210'])(
    'weak: %s',
    (pin) => expect(isWeakPin(pin)).toBe(true),
  )
  it.each(['482916', '135790', '112233', '121212', '901234'])('not weak: %s', (pin) => expect(isWeakPin(pin)).toBe(false))

  it('newPinProblem: format, weak, mismatch, ok', () => {
    expect(newPinProblem('4829', '4829')).toBe('format')
    expect(newPinProblem('123456', '123456')).toBe('weak')
    expect(newPinProblem('482916', '482917')).toBe('mismatch')
    expect(newPinProblem('482916', '482916')).toBeNull()
  })
})
