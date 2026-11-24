/** F8: progress counts into women / men / girls / boys, follow-up rules and links. */
import { describe, expect, it } from 'vitest'
import { callLink, daysQuiet, groupOf, isQuiet, share, sizeText, totals, whatsAppLink, type ProgressRow } from './progress'

const row = (sex: string, ageGroup: 'adult' | 'child', ageRange: string, complete: number, m = 0, c = 0): ProgressRow => ({
  sex,
  ageGroup,
  ageRange,
  complete,
  measuredNoPhotos: m,
  consentedNotMeasured: c,
})

describe('totals by sex and adult/child (no targets)', () => {
  it('women, men, girls, boys with age ranges in order; All adds up', () => {
    const t = totals([row('female', 'adult', '35-44', 2, 1), row('female', 'adult', '18-24', 3), row('male', 'adult', '25-34', 4, 0, 2), row('female', 'child', '8-9', 1), row('male', 'child', '15-17', 5)])
    expect(t.groups.map((g) => g.key)).toEqual(['women', 'men', 'girls', 'boys'])
    expect(t.groups[0].counts).toEqual({ complete: 5, measuredNoPhotos: 1, consentedNotMeasured: 0 })
    expect(t.groups[0].byRange.map((r) => r.range)).toEqual(['18-24', '35-44'])
    expect(t.all).toEqual({ complete: 15, measuredNoPhotos: 1, consentedNotMeasured: 2 })
  })

  it('sex not recorded yet is shown only when there are some', () => {
    expect(totals([row('female', 'adult', '18-24', 1)]).groups.some((g) => g.key === 'unknown')).toBe(false)
    expect(totals([row('unknown', 'adult', 'unknown', 0, 0, 1)]).groups.at(-1)?.key).toBe('unknown')
    expect(groupOf({ sex: 'male', ageGroup: 'child' })).toBe('boys')
  })
})

describe('collector follow-up', () => {
  const now = new Date('2026-11-20T12:00:00Z')
  it('amber after 5 days without anything sent, or nothing sent yet', () => {
    expect(isQuiet('2026-11-16T12:00:00Z', now)).toBe(false)
    expect(isQuiet('2026-11-15T12:00:00Z', now)).toBe(true)
    expect(daysQuiet('2026-11-15T12:00:00Z', now)).toBe(5)
    expect(isQuiet(null, now)).toBe(true)
  })

  it('Call and WhatsApp only open the admin’s own phone with the number', () => {
    expect(callLink('+233 24 111 1111')).toBe('tel:+233241111111')
    expect(whatsAppLink('+233 24 111 1111')).toBe('https://wa.me/233241111111')
  })

  it('shares and sizes', () => {
    expect(share(1, 8)).toBe('13%')
    expect(share(0, 0)).toBe('—')
    expect(sizeText(1_250_000_000)).toBe('1.25 GB')
    expect(sizeText(4_500_000)).toBe('4.5 MB')
    expect(sizeText(12_000)).toBe('12 KB')
  })
})
