/**
 * The signed-in collector's own row, and a small cached copy so the installed app can open
 * offline on the right screen. The cache holds only this collector's own name, status and role:
 * never PINs, tokens or participant data.
 */

export type CollectorStatus = 'pending' | 'approved' | 'rejected' | 'disabled'

export interface Profile {
  id: string
  displayName: string
  status: CollectorStatus
  role: 'collector' | 'admin'
}

export type Screen = 'welcome' | 'waiting' | 'home' | 'inactive'

/** Which screen to show for a profile (null = not signed in). */
export function screenFor(profile: Profile | null): Screen {
  if (!profile) return 'welcome'
  if (profile.status === 'approved') return 'home'
  if (profile.status === 'pending') return 'waiting'
  return 'inactive'
}

const KEY = 'anthro-collect.profile.v1'
const STATUSES: readonly string[] = ['pending', 'approved', 'rejected', 'disabled']

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
  return { id: v.id, displayName: v.displayName, status: v.status as CollectorStatus, role: v.role }
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
