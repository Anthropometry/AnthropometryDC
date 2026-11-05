import { describe, expect, it } from 'vitest'
import { loadCachedProfile, parseProfile, saveCachedProfile, screenFor, type KeyValueStore, type Profile } from './profile'

const P: Profile = { id: 'u1', displayName: 'Ama', status: 'approved', role: 'collector' }

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
})

describe('cached profile', () => {
  it('round-trips', () => {
    const s = memoryStore()
    saveCachedProfile(s, P)
    expect(loadCachedProfile(s)).toEqual(P)
    saveCachedProfile(s, null)
    expect(loadCachedProfile(s)).toBeNull()
  })

  it('stores only id, name, status and role', () => {
    const s = memoryStore()
    saveCachedProfile(s, P)
    expect(Object.keys(JSON.parse([...s.data.values()][0]))).toEqual(['id', 'displayName', 'status', 'role'])
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
