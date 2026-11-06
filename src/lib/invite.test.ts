import { describe, expect, it, vi } from 'vitest'
import { formatInviteCode, inviteMessage, shareInvite, shortDate } from './invite'

describe('invite message', () => {
  it('formats the code with a dash', () => {
    expect(formatInviteCode('ABCD2345')).toBe('ABCD-2345')
    expect(formatInviteCode('ABC')).toBe('ABC')
  })

  it('has the app link, the code and the Ashesi framing', () => {
    const m = inviteMessage('ABCD2345', 'https://anthro.example')
    expect(m).toContain('https://anthro.example')
    expect(m).toContain('ABCD-2345')
    expect(m).toContain('student research project at Ashesi University')
    expect(m).toContain('3 people')
    expect(m).toContain('10 days')
  })

  it('DENY: never contains a PIN, a phone number or an email', () => {
    const m = inviteMessage('ABCD2345', 'https://anthro.example')
    expect(m).not.toMatch(/PIN|\+\d{6,}|0\d{9}|@/)
  })
})

describe('shareInvite', () => {
  it('uses the share sheet when there is one', async () => {
    const share = vi.fn(async () => {})
    const copy = vi.fn(async () => {})
    expect(await shareInvite('hi', { share, copy })).toBe('shared')
    expect(copy).not.toHaveBeenCalled()
  })

  it('cancelling the share sheet copies nothing', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    const copy = vi.fn(async () => {})
    expect(await shareInvite('hi', { share: vi.fn(async () => Promise.reject(abort)), copy })).toBe('cancelled')
    expect(copy).not.toHaveBeenCalled()
  })

  it('falls back to copying when sharing fails or is missing', async () => {
    const copy = vi.fn(async () => {})
    expect(await shareInvite('hi', { share: vi.fn(async () => Promise.reject(new Error('no'))), copy })).toBe('copied')
    expect(await shareInvite('hi', { copy })).toBe('copied')
    expect(copy).toHaveBeenCalledWith('hi')
  })

  it('unavailable when neither works', async () => {
    expect(await shareInvite('hi', {})).toBe('unavailable')
    expect(await shareInvite('hi', { copy: vi.fn(async () => Promise.reject(new Error('no'))) })).toBe('unavailable')
  })
})

describe('admin code message (Amendment B2)', () => {
  it('says how many joins are left and the last day; no phone or PIN', () => {
    const text = inviteMessage('ABCD2345', 'https://app.test', { joinsLeft: 2, expiresAt: '2026-11-16T10:00:00Z' })
    expect(text).toContain('https://app.test')
    expect(text).toContain('ABCD-2345')
    expect(text).toContain('2 more people until 16 Nov')
    expect(text).not.toMatch(/\+?\d{9,}|PIN/)
  })
  it('one join left reads "person"', () => {
    expect(inviteMessage('ABCD2345', 'x', { joinsLeft: 1, expiresAt: '2026-11-16T10:00:00Z' })).toContain('1 more person until')
  })
  it('dates read day-month', () => {
    expect(shortDate('2026-11-06T12:00:00Z')).toBe('6 Nov')
  })
})
