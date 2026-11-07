import { describe, expect, it } from 'vitest'
import {
  loadCachedProfile,
  parseProfile,
  readJson,
  saveCachedProfile,
  scopedStore,
  screenFor,
  writeJson,
  type KeyValueStore,
  type Profile,
} from './profile'

const P: Profile = { id: 'u1', displayName: 'Ama', status: 'approved', role: 'collector', unit: 'cm', language: 'en', settingsChosen: true }

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

describe('screenFor', () => {
  it('routes by status', () => {
    expect(screenFor(null)).toBe('welcome')
    expect(screenFor(P)).toBe('home')
    expect(screenFor({ ...P, status: 'pending' })).toBe('waiting')
    expect(screenFor({ ...P, status: 'rejected' })).toBe('inactive')
    expect(screenFor({ ...P, status: 'disabled' })).toBe('inactive')
  })

  it('F2: approved without settings → setup once', () => {
    expect(screenFor({ ...P, settingsChosen: false })).toBe('setup')
    expect(screenFor({ ...P, status: 'pending', settingsChosen: false })).toBe('waiting')
  })
})

describe('cached profile', () => {
  it('round-trips', () => {
    const s = memoryStore()
    saveCachedProfile(s, P)
    expect(loadCachedProfile(s)).toEqual(P)
    saveCachedProfile(s, null)
    expect(loadCachedProfile(s)).toBeNull()
  })

  it('stores only own id, name, status, role and settings', () => {
    const s = memoryStore()
    saveCachedProfile(s, P)
    expect(Object.keys(JSON.parse([...s.data.values()][0]))).toEqual(['id', 'displayName', 'status', 'role', 'unit', 'language', 'settingsChosen'])
  })

  it('survives missing or blocked storage and junk data', () => {
    expect(loadCachedProfile(undefined)).toBeNull()
    expect(loadCachedProfile(throwingStore)).toBeNull()
    expect(() => saveCachedProfile(throwingStore, P)).not.toThrow()
    const s = memoryStore()
    s.setItem('anthro-collect.profile.v1', '{not json')
    expect(loadCachedProfile(s)).toBeNull()
  })

  it.each([
    null,
    'x',
    { id: 'u', displayName: 'A', status: 'boss', role: 'collector' },
    { id: 'u', displayName: 'A', status: 'approved', role: 'owner' },
    { id: 1, displayName: 'A', status: 'approved', role: 'admin' },
  ])('rejects bad cached value %j', (v) => {
    expect(parseProfile(v)).toBeNull()
  })
})

describe('older cached profiles and settings fields', () => {
  it('a profile cached before M2 gets defaults and goes to setup', () => {
    const p = parseProfile({ id: 'u', displayName: 'A', status: 'approved', role: 'collector' })
    expect(p).toMatchObject({ unit: 'cm', language: 'en', settingsChosen: false })
  })
  it('bad unit or language falls back to cm / en', () => {
    expect(parseProfile({ ...P, unit: 'yards', language: 'de' })).toMatchObject({ unit: 'cm', language: 'en' })
  })
})

describe('JSON helpers and per-collector storage', () => {
  it('readJson/writeJson round-trip, remove with null, survive junk and blocked storage', () => {
    const s = memoryStore()
    writeJson(s, 'k', { a: 1 })
    expect(readJson(s, 'k', null)).toEqual({ a: 1 })
    writeJson(s, 'k', null)
    expect(readJson(s, 'k', 'fallback')).toBe('fallback')
    s.setItem('k', '{bad')
    expect(readJson(s, 'k', 7)).toBe(7)
    expect(readJson(throwingStore, 'k', 7)).toBe(7)
    expect(() => writeJson(throwingStore, 'k', 1)).not.toThrow()
  })
  it("DENY: one collector never sees another collector's keys on a shared phone", () => {
    const s = memoryStore()
    writeJson(scopedStore(s, 'a'), 'queue', [1])
    expect(readJson(scopedStore(s, 'b'), 'queue', [])).toEqual([])
    expect(readJson(scopedStore(s, 'a'), 'queue', [])).toEqual([1])
    scopedStore(s, 'a')!.removeItem('queue')
    expect(s.data.size).toBe(0)
    expect(scopedStore(undefined, 'a')).toBeUndefined()
  })
})
