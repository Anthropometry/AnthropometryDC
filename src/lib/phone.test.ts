import { describe, expect, it } from 'vitest'
import { LOGIN_ID_DOMAIN, formatPhone, isValidPin, loginIdToPhone, normalisePhone, phoneToLoginId } from './phone'

describe('normalisePhone: any country (Amendment A1)', () => {
  it.each([
    ['0241234567', '+233241234567'],
    ['024 123 4567', '+233241234567'],
    ['(024) 123-4567', '+233241234567'],
    ['0551234567', '+233551234567'],
    ['233241234567', '+233241234567'],
    ['+233 24 123 4567', '+233241234567'],
    ['+234 803 123 4567', '+2348031234567'], // Nigeria
    ['00234 803 123 4567', '+2348031234567'], // 00 instead of +
    ['+44 7700 900123', '+447700900123'], // UK
    ['+1 (202) 555-0123', '+12025550123'], // US
    ['+225 07 12 34 56 78', '+2250712345678'], // Côte d'Ivoire
  ])('accepts %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected)
  })

  it.each([
    ['empty', ''],
    ['too short', '12345'],
    ['Ghana local, 9 digits', '024123456'],
    ['Ghana local, 11 digits', '02412345678'],
    ['Ghana landline-style', '0141234567'],
    ['+233 not mobile', '+233141234567'],
    ['+233 too long', '+2332412345678'],
    ['no country code', '803 123 4567'],
    ['country code 0', '+0241234567'],
    ['too short after +', '+1234567'],
    ['too long after +', '+1234567890123456'],
    ['letters', '+234abc1234567'],
    ['email', 'someone@gmail.com'],
  ])('rejects %s', (_label, input) => {
    expect(normalisePhone(input)).toBeNull()
  })
})

describe('phoneToLoginId', () => {
  it.each([
    ['0241234567', '233241234567@phone.anthro-collect.invalid'],
    ['+233 24 123 4567', '233241234567@phone.anthro-collect.invalid'],
    ['+234 803 123 4567', '2348031234567@phone.anthro-collect.invalid'],
  ])('maps %s to the hidden login id', (input, expected) => {
    expect(phoneToLoginId(input)).toBe(expected)
  })

  it('gives the same id for every way of writing one number', () => {
    const ids = ['0241234567', '024-123-4567', '(024) 123 4567', '+233241234567', '00233241234567'].map(phoneToLoginId)
    expect(new Set(ids).size).toBe(1)
  })

  it('gives different ids for different numbers', () => {
    expect(phoneToLoginId('0241234567')).not.toBe(phoneToLoginId('0241234568'))
  })

  it('Ghana ids are unchanged from before Amendment A', () => {
    expect(phoneToLoginId('024 123 4567')).toBe('233241234567@phone.anthro-collect.invalid')
  })

  it('uses a reserved domain that can never receive mail', () => {
    expect(LOGIN_ID_DOMAIN.endsWith('.invalid')).toBe(true)
  })

  it.each(['', '12345', 'someone@gmail.com', '0141234567', '803 123 4567'])('rejects %s', (input) => {
    expect(phoneToLoginId(input)).toBeNull()
  })
})

describe('loginIdToPhone', () => {
  it.each(['024 123 4567', '+234 803 123 4567', '+44 7700 900123'])('round-trips %s', (p) => {
    expect(loginIdToPhone(phoneToLoginId(p)!)).toBe(normalisePhone(p))
  })
  it.each([
    'someone@gmail.com',
    '233241234567@gmail.com',
    '233241234567@phone.anthro-collect.invalid.evil.com',
    '0241234567@phone.anthro-collect.invalid',
    '1234567@phone.anthro-collect.invalid',
    '',
  ])('rejects %s', (id) => {
    expect(loginIdToPhone(id)).toBeNull()
  })
})

describe('isValidPin', () => {
  it('accepts six digits', () => expect(isValidPin('012345')).toBe(true))
  it.each(['12345', '1234567', '12a456', '', ' 12345'])('rejects %s', (pin) => expect(isValidPin(pin)).toBe(false))
})

describe('formatPhone (Amendment B3, display only)', () => {
  it('spaces Ghana numbers', () => {
    expect(formatPhone('+233205552668')).toBe('+233 20 555 2668')
  })
  it('leaves other countries and odd values as stored', () => {
    expect(formatPhone('+2348031234567')).toBe('+2348031234567')
    expect(formatPhone('+23320555266')).toBe('+23320555266')
  })
})
