/**
 * F3 practice participants. Made on the phone first (works offline) and sent when online.
 * Until F7 brings the full upload queue, waiting records live in localStorage; nothing is removed
 * from the phone before the server has confirmed it (POLICY §12).
 */
import { readJson, writeJson, type KeyValueStore } from './profile'

export type AgeGroup = 'adult' | 'child'

export interface LocalPractice {
  id: string
  ageGroup: AgeGroup
  createdAt: string
}

export interface PracticeRow {
  id: string
  practiceNo: number | null
  ageGroup: AgeGroup
  status: string
  createdAt: string
  /** True while it is only on this phone. */
  waiting: boolean
  /** F4: receipt code given to the participant, and whether consent was recorded (never the consent itself). */
  receiptCode?: string | null
  hasConsent?: boolean
  /** F5: measurements finished; the intimate tick (yes/no only); sex and age once recorded. */
  measured?: boolean
  intimateOk?: boolean
  /** F5 Amendment A: weight agreed at consent (yes/no only). */
  weightOk?: boolean
  sex?: 'female' | 'male' | null
  /** F6: front and side photos in (on the server, or done on this phone and waiting). */
  photosDone?: boolean
  ageYears?: number | null
}

export interface PracticeApi {
  /** Insert; returns the practice number. Must succeed quietly if the id already exists. */
  insert: (p: LocalPractice) => Promise<number | null>
  remove: (id: string) => Promise<void>
}

const KEY = 'anthro-collect.practice-waiting.v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function loadWaiting(store: KeyValueStore | undefined): LocalPractice[] {
  const v = readJson<unknown>(store, KEY, [])
  if (!Array.isArray(v)) return []
  return v.filter(
    (p): p is LocalPractice =>
      !!p &&
      typeof p === 'object' &&
      typeof (p as LocalPractice).id === 'string' &&
      UUID.test((p as LocalPractice).id) &&
      ((p as LocalPractice).ageGroup === 'adult' || (p as LocalPractice).ageGroup === 'child') &&
      typeof (p as LocalPractice).createdAt === 'string',
  )
}

function saveWaiting(store: KeyValueStore | undefined, list: LocalPractice[]) {
  writeJson(store, KEY, list.length ? list : null)
}

/** "P-0007"; "P-…" while the number is not known yet. */
export function practiceLabel(no: number | null): string {
  return no === null ? 'P-…' : `P-${String(no).padStart(4, '0')}`
}

/** Make one on the phone, then try to send it. Returns its number if the server answered. */
export async function addPractice(
  store: KeyValueStore | undefined,
  api: PracticeApi,
  ageGroup: AgeGroup,
  newId: () => string = () => crypto.randomUUID(),
  now: () => Date = () => new Date(),
): Promise<{ id: string; practiceNo: number | null }> {
  const p: LocalPractice = { id: newId(), ageGroup, createdAt: now().toISOString() }
  saveWaiting(store, [...loadWaiting(store), p])
  const sent = await flushPractice(store, api)
  return { id: p.id, practiceNo: sent.get(p.id) ?? null }
}

/** Send everything waiting, oldest first; stop at the first failure (try again later). */
export async function flushPractice(store: KeyValueStore | undefined, api: PracticeApi): Promise<Map<string, number | null>> {
  const done = new Map<string, number | null>()
  for (const p of loadWaiting(store)) {
    try {
      done.set(p.id, await api.insert(p))
    } catch {
      break
    }
    saveWaiting(
      store,
      loadWaiting(store).filter((w) => w.id !== p.id),
    )
  }
  return done
}

/** Server rows plus those still waiting on this phone, newest first. */
export function mergePractice(server: PracticeRow[], waiting: LocalPractice[]): PracticeRow[] {
  const known = new Set(server.map((r) => r.id))
  const local: PracticeRow[] = waiting
    .filter((w) => !known.has(w.id))
    .map((w) => ({ id: w.id, practiceNo: null, ageGroup: w.ageGroup, status: 'draft', createdAt: w.createdAt, waiting: true }))
  return [...local, ...server].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Removing a record that is only on the phone never touches the server. */
export async function removePractice(store: KeyValueStore | undefined, api: PracticeApi, row: PracticeRow): Promise<void> {
  if (row.waiting) {
    saveWaiting(
      store,
      loadWaiting(store).filter((w) => w.id !== row.id),
    )
    return
  }
  await api.remove(row.id)
}
