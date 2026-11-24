/** F5 measurement logic. Expected values are the same as the database tests (f5.test.ts). */
import { describe, expect, it } from 'vitest'
import {
  CATALOGUE,
  DOUBLE,
  INTIMATE,
  disagreements,
  expectedRange,
  inchesTyped,
  needsThird,
  readingTenths,
  setFor,
  showCm,
  unusual,
  valueTenths,
  rangesFor,
  rangeOf,
  rangeYears,
  isAgeRange,
  showRange,
} from './measurements'

describe('age groups (F5 Amendment C)', () => {
  it('adults and children get their own ranges; the exact age is never needed', () => {
    expect(rangesFor('adult')).toEqual(['18-24', '25-34', '35-44', '45-54', '55-64', '65+'])
    expect(rangesFor('child')).toEqual(['8-9', '10-12', '13-14', '15-17'])
    expect(showRange('25-34')).toBe('25–34')
    expect(rangeYears('65+')).toEqual([65, 100])
    expect(isAgeRange('25-34')).toBe(true)
    expect(isAgeRange('30')).toBe(false)
  })

  it('an exact age saved on a phone before the change maps to its range', () => {
    expect(rangeOf(8)).toBe('8-9')
    expect(rangeOf(12)).toBe('10-12')
    expect(rangeOf(13)).toBe('13-14')
    expect(rangeOf(17)).toBe('15-17')
    expect(rangeOf(18)).toBe('18-24')
    expect(rangeOf(34)).toBe('25-34')
    expect(rangeOf(90)).toBe('65+')
  })

  it('a range never straddles the change of measurement set (12 → 13)', () => {
    for (const r of rangesFor('child')) {
      const [a, b] = rangeYears(r)
      expect(a <= 12 && b > 12).toBe(false)
    }
  })
})

describe('sets by sex and age (decisions 3 and 5)', () => {
  it('women 24, men 18, children 8–12: 9, 13–17 full set; catalogue order kept', () => {
    expect(setFor('female', '25-34')).toHaveLength(24)
    expect(setFor('male', '25-34')).toHaveLength(18)
    expect(setFor('female', '10-12')).toHaveLength(9)
    expect(setFor('male', '10-12')).toEqual(['height', 'neck_girth', 'shoulder_width', 'chest_girth', 'back_length', 'waist_girth', 'hip_girth', 'arm_length', 'inseam'])
    expect(setFor('female', '13-14')).toHaveLength(24)
    expect(setFor('male', '15-17')).toHaveLength(18)
    expect(setFor('female', '25-34')[0]).toBe('height')
    expect(setFor('female', '25-34')).not.toContain('chest_girth')
    expect(setFor('male', '25-34')).not.toContain('bust_girth')
  })

  it('intimate and ×2 lists', () => {
    expect([...INTIMATE].sort()).toEqual(['bust_girth', 'bust_point_distance', 'inseam', 'shoulder_to_bust_point', 'underbust_girth'])
    expect([...DOUBLE].sort()).toEqual(['bust_girth', 'chest_girth', 'height', 'hip_girth', 'waist_girth'])
    expect(CATALOGUE).toHaveLength(25)
  })
})

describe('readings (decision 18): same as the database', () => {
  it.each([
    ['87.3', 'cm', 873],
    ['87', 'cm', 870],
    ['34 3/8', 'in', 873],
    ['30 3/8', 'in', 772],
    ['30 1/2', 'in', 775],
    ['15 1/4', 'in', 387],
    ['34', 'in', 864],
    ['2 1/2', 'in', 64], // 6.35 cm → 6.4 (half up, like Postgres)
  ] as const)('%s %s → %i tenths', (typed, unit, tenths) => {
    expect(readingTenths(typed, unit)).toBe(tenths)
  })

  it.each([
    ['87.35', 'cm'],
    ['87a', 'cm'],
    ['0', 'cm'],
    ['301', 'cm'],
    ['34 2/8', 'in'],
    ['34 3/16', 'in'],
    ['34.5', 'in'],
    ['', 'cm'],
  ] as const)('DENY: %s %s', (typed, unit) => {
    expect(readingTenths(typed, unit)).toBeNull()
  })

  it('inch text in lowest terms', () => {
    expect(inchesTyped(34, 3)).toBe('34 3/8')
    expect(inchesTyped(34, 4)).toBe('34 1/2')
    expect(inchesTyped(34, 6)).toBe('34 3/4')
    expect(inchesTyped(34, 0)).toBe('34')
    expect(showCm(873)).toBe('87.3 cm')
  })
})

describe('×2 readings (decision 9)', () => {
  it('two close → mean; >1 cm → third; three → closest pair; single codes need one', () => {
    expect(valueTenths([920, 924], true)).toBe(922)
    expect(needsThird([1000, 1015])).toBe(true)
    expect(needsThird([1000, 1010])).toBe(false)
    expect(valueTenths([1000, 1015], true)).toBeNull()
    expect(valueTenths([1000, 1015, 1003], true)).toBe(1002)
    expect(valueTenths([920, 935, 940], true)).toBe(938)
    expect(valueTenths([920, 924, 926], true)).toBeNull() // no third when the first two agree
    expect(valueTenths([345], false)).toBe(345)
    expect(valueTenths([345, 346], false)).toBeNull()
  })
})

describe('unusual values (decision 13)', () => {
  it('adults: wide ranges; inside is fine, outside asks to check', () => {
    expect(unusual('waist_girth', 780, 'female', '25-34')).toBeNull()
    expect(unusual('waist_girth', 1750, 'female', '25-34')).toEqual([50, 170])
    expect(unusual('height', 165, 'male', '25-34')).toEqual([130, 210]) // 16.5 typed instead of 165
  })

  it('children: WHO height by age and sex; core bands for 8–12; adult ranges for other codes at 13–17', () => {
    expect(expectedRange('height', 'male', '8-9')).toEqual([110, 150]) // widest WHO limits across 8 and 9
    expect(expectedRange('height', 'female', '15-17')).toEqual([143, 182])
    expect(unusual('height', 1600, 'male', '8-9')).toEqual([110, 150])
    expect(expectedRange('waist_girth', 'female', '10-12')).toEqual([40, 110])
    expect(expectedRange('waist_girth', 'female', '15-17')).toEqual([50, 170])
  })
})

describe('consistency between measurements (decision 14)', () => {
  it('flags swapped or impossible pairs involving the value just entered', () => {
    expect(disagreements('underbust_girth', { bust_girth: 82, underbust_girth: 95 })[0].message).toMatch(/Under-bust/)
    expect(disagreements('outseam', { inseam: 100, outseam: 95 })).toHaveLength(1)
    expect(disagreements('arm_length', { height: 160, arm_length: 85 })).toHaveLength(1)
  })

  it('no warning when values agree, or when the other value is not measured yet', () => {
    expect(disagreements('underbust_girth', { bust_girth: 95, underbust_girth: 82 })).toEqual([])
    expect(disagreements('underbust_girth', { underbust_girth: 95 })).toEqual([])
    expect(disagreements('neck_girth', { neck_girth: 35, height: 160 })).toEqual([])
  })
})
