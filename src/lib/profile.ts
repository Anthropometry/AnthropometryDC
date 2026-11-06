/**
 * The signed-in collector's own row, and a small cached copy so the installed app can open
 * offline on the right screen. The cache holds only this collector's own name, status, role and
 * settings: never PINs, tokens or participant data.
 */

export type CollectorStatus = 'pending' | 'approved' | 'rejected' | 'disabled'
export type Unit = 'cm' | 'in'
export type Language = 'en' | 'fr' | 'tw'

export interface Profile {
  id: string
  displayName: string
  status: CollectorStatus
  role: 'collector' | 'admin'
  unit: Unit
  language: Language
  /** True once the collector has saved unit and language (F2 first-time setup). */
  settingsChosen: boolean
}

export type Screen = 'welcome' | 'waiting' | 'setup' | 'home' | 'inactive'

/** Which screen to show for a profile (null = not signed in). */
export function screenFor(profile: Profile | null): Screen {
  if (!profile) return 'welcome'
  if (profile.status === 'approved') return profile.settingsChosen ? 'home' : 'setup'
  if (profile.status === 'pending') return 'waiting'
  return 'inactive'
}

const KEY = 'anthro-collect.profile.v1'
const STATUSES: readonly string[] = ['pending', 'approved', 'rejected', 'disabled']
export const UNITS: readonly Unit[] = ['cm', 'in']
export const LANGUAGES: readonly Language[] = ['en', 'fr', 'tw']

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function parseProfile(value: unknown): Profile | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || typeof v.displayName !== 'string') return null
  if (typeof v.status !== 'string' || !STATUSES.includes(v.status)) return null
  if (v.role !== 'collector' && v.role !== 'admin') return null
  return {
    id: v.id,
    displayName: v.displayName,
    status: v.status as CollectorStatus,
    role: v.role,
    unit: UNITS.includes(v.unit as Unit) ? (v.unit as Unit) : 'cm',
    language: LANGUAGES.includes(v.language as Language) ? (v.language as Language) : 'en',
    settingsChosen: v.settingsChosen === true,
  }
}

/** Storage can be missing or throw (private mode, blocked site data): never let that crash the app. */
export function loadCachedProfile(store: KeyValueStore | undefined): Profile | null {
  try {
    const raw = store?.getItem(KEY)
    return raw ? parseProfile(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveCachedProfile(store: KeyValueStore | undefined, profile: Profile | null): void {
  try {
    if (profile) store?.setItem(KEY, JSON.stringify(profile))
    else store?.removeItem(KEY)
  } catch {
    // ignore: the app still works online without the cache
  }
}

/** Reads a JSON value from storage; any problem gives the fallback. */
export function readJson<T>(store: KeyValueStore | undefined, key: string, fallback: T): T {
  try {
    const raw = store?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Writes a JSON value (null removes it); storage problems are ignored. */
export function writeJson(store: KeyValueStore | undefined, key: string, value: unknown): void {
  try {
    if (value === null) store?.removeItem(key)
    else store?.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

/**
 * Storage for one collector only: keys get the collector's id in front, so records waiting on a
 * shared phone are never sent under someone else's login.
 */
export function scopedStore(store: KeyValueStore | undefined, collectorId: string): KeyValueStore | undefined {
  if (!store) return undefined
  const k = (key: string) => `${collectorId}:${key}`
  return {
    getItem: (key) => store.getItem(k(key)),
    setItem: (key, value) => store.setItem(k(key), value),
    removeItem: (key) => store.removeItem(k(key)),
  }
}
