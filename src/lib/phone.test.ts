import { describe, expect, it } from 'vitest'
import {
  LOGIN_ID_DOMAIN,
  isValidPin,
  loginIdToPhone,
  normaliseGhanaPhone,
  phoneToLoginId,
} from './phone'

describe('phoneToLoginId', () => {
  it.each([
    ['0241234567', '233241234567@phone.anthro-collect.invalid'],
    ['024 123 4567', '233241234567@phone.anthro-collect.invalid'],
    ['+233 24 123 4567', '233241234567@phone.anthro-collect.invalid'],
    ['233551234567', '233551234567@phone.anthro-collect.invalid'],
  ])('maps %s to the hidden login id', (input, expected) => {
    expect(phoneToLoginId(input)).toBe(expected)
  })

  it('gives the same id for every way of writing one number', () => {
    const ids = ['0241234567', '024-123-4567', '(024) 123 4567', '+233241234567'].map(phoneToLoginId)
    expect(new Set(ids).size).toBe(1)
  })

  it('gives different ids for different numbers', () => {
    expect(phoneToLoginId('0241234567')).not.toBe(phoneToLoginId('0241234568'))
  })

  it('uses a reserved domain that can never receive mail', () => {
    expect(LOGIN_ID_DOMAIN.endsWith('.invalid')).toBe(true)
  })

  it.each(['', '12345', 'someone@gmail.com', '0141234567', '+44 7700 900123'])('rejects %s', (input) => {
    expect(phoneToLoginId(input)).toBeNull()
  })
})

describe('loginIdToPhone', () => {
  it('round-trips with phoneToLoginId', () => {
    expect(loginIdToPhone(phoneToLoginId('024 123 4567')!)).toBe('+233241234567')
  })
  it.each([
    'someone@gmail.com',
    '233241234567@gmail.com',
    '233241234567@phone.anthro-collect.invalid.evil.com',
    '23324123456@phone.anthro-collect.invalid',
    '',
  ])('rejects %s', (id) => {
    expect(loginIdToPhone(id)).toBeNull()
  })
})

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
