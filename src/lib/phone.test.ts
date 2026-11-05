import { describe, expect, it } from 'vitest'
import { isValidPin, normaliseGhanaPhone } from './phone'

describe('normaliseGhanaPhone', () => {
  it.each([
    ['0241234567', '+233241234567'],
    ['024 123 4567', '+233241234567'],
    ['233241234567', '+233241234567'],
    ['+233 24 123 4567', '+233241234567'],
    ['0551234567', '+233551234567'],
  ])('accepts %s', (input, expected) => {
    expect(normaliseGhanaPhone(input)).toBe(expected)
  })

  it.each(['', '12345', '024123456', '02412345678', '+44 7700 900123', '0141234567', 'abc'])(
    'rejects %s',
    (input) => {
      expect(normaliseGhanaPhone(input)).toBeNull()
    },
  )
})

describe('isValidPin', () => {
  it('accepts six digits', () => expect(isValidPin('012345')).toBe(true))
  it.each(['12345', '1234567', '12a456', '', ' 12345'])('rejects %s', (pin) =>
    expect(isValidPin(pin)).toBe(false),
  )
})
