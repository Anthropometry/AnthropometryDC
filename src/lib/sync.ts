/**
 * F7 offline sync (specs/F7-sync.md): one sender at a time, retries by itself while the app is open
 * and online (1, 2, 4, 8, 15 minutes), and items the server keeps refusing marked "needs attention"
 * after 5 refusals. Nothing is ever deleted because of a failure (POLICY §12).
 * Error codes kept on the phone are short codes only: no names, signatures, photos or numbers.
 */
import type { FieldDb } from './consentQueue'

export type SyncKind = 'consent' | 'measurement' | 'photo'

/** A participant whose sending keeps failing (one per kind). */
export interface SyncIssue {
  /** `${kind}:${participantId}` */
  key: string
  kind: SyncKind
  participantId: string
  collectorId: string
  /** Refusals by the server in a row (network failures don't count). */
  tries: number
  lastError: string
  stuck: boolean
  lastAt: string
}

export const STUCK_AFTER = 5

/** A short code for an error, never its message (which could hold data). */
export function errorCode(e: unknown): string {
  if (e instanceof TypeError) return 'network'
  if (e instanceof Error && /^upload_\d{3}$/.test(e.message)) return e.message
  if (e instanceof Error && e.message === 'signed_out') return 'signed_out'
  const code = (e as { code?: unknown } | null)?.code
  if (typeof code === 'string' && /^[A-Z0-9]{2,8}$/.test(code)) return `db_${code}`
  return 'other'
}

/** Did the server refuse it (it will not succeed by trying again), rather than no signal or a busy server? */
export function isRefusal(code: string): boolean {
  if (/^upload_(400|403|404|409|413|415)$/.test(code)) return true
  if (/^db_(22|23|42|P0)/.test(code)) return true
  return false
}

/** Plain words for the collector. */
export function reasonText(code: string): string {
  if (code === 'upload_409') return 'The server is waiting for something sent before it (consent or measurements). It will go once that arrives.'
  if (code === 'upload_403' || code === 'db_42501') return 'The server says this participant is not yours, or your account is not approved. Tell the project lead.'
  if (code === 'upload_413') return 'The file is too large. Tell the project lead.'
  if (code === 'upload_415') return 'The file is not a photo the server accepts. Tell the project lead.'
  if (code.startsWith('db_23') || code.startsWith('db_22')) return 'The server’s checks refused a value. Tell the project lead; nothing is lost.'
  if (code === 'signed_out') return 'Sign in again to send.'
  if (code === 'network') return 'No connection to the server. It will try again by itself.'
  return 'The server refused it. It will keep trying; tell the project lead if it stays.'
}

/** What the senders tell us about each participant they try. */
export interface Reporter {
  fail: (kind: SyncKind, participantId: string, e: unknown) => Promise<void>
  ok: (kind: SyncKind, participantId: string) => Promise<void>
}

export const noReport: Reporter = { fail: async () => undefined, ok: async () => undefined }

export function issueReporter(db: FieldDb, collectorId: string, now: () => Date = () => new Date()): Reporter {
  return {
    async fail(kind, participantId, e) {
      const code = errorCode(e)
      const key = `${kind}:${participantId}`
      const old = await db.issues.get(key)
      const tries = (old?.tries ?? 0) + (isRefusal(code) ? 1 : 0)
      await db.issues.put({ key, kind, participantId, collectorId, tries, lastError: code, stuck: tries >= STUCK_AFTER, lastAt: now().toISOString() })
    },
    async ok(kind, participantId) {
      await db.issues.delete(`${kind}:${participantId}`)
    },
  }
}

export interface SyncSummary {
  consents: number
  measurements: number
  photos: number
  /** Bytes still to send (photos and signatures). */
  bytes: number
  stuck: number
  /** Participants with anything waiting, and their issues. */
  participants: { participantId: string; kinds: SyncKind[]; stuck: boolean; reason: string | null }[]
}

/** Everything still on this phone for this collector. */
export async function syncSummary(db: FieldDb, collectorId: string): Promise<SyncSummary> {
  const jobs = await db.jobs.where('collectorId').equals(collectorId).toArray()
  const ops = await db.ops.where('collectorId').equals(collectorId).toArray()
  const photos = await db.photos.where('collectorId').equals(collectorId).toArray()
  const done = await db.photoDone.where('collectorId').equals(collectorId).toArray()
  const issues = await db.issues.where('collectorId').equals(collectorId).toArray()

  const by = new Map<string, Set<SyncKind>>()
  const add = (id: string, k: SyncKind) => by.set(id, (by.get(id) ?? new Set()).add(k))
  jobs.forEach((j) => add(j.participantId, 'consent'))
  ops.forEach((o) => add(o.participantId, 'measurement'))
  photos.forEach((p) => add(p.participantId, 'photo'))
  done.forEach((d) => add(d.participantId, 'photo'))

  let bytes = photos.reduce((a, p) => a + (p.jpeg?.byteLength ?? 0), 0)
  for (const j of jobs) for (const s of Object.values(j.signatures)) bytes += s?.byteLength ?? 0

  const participants = [...by.entries()].map(([participantId, kinds]) => {
    const mine = issues.filter((i) => i.participantId === participantId)
    const worst = mine.find((i) => i.stuck) ?? null
    return { participantId, kinds: [...kinds], stuck: !!worst, reason: worst ? reasonText(worst.lastError) : null }
  })
  return {
    consents: jobs.length,
    measurements: ops.length,
    photos: photos.length + done.length,
    bytes,
    stuck: participants.filter((p) => p.stuck).length,
    participants,
  }
}

/**
 * Ask the browser to keep this app's saved data even when the phone runs low on space (it is
 * otherwise allowed to clear a website's data). Returns whether the browser agreed.
 */
export async function keepDataOnPhone(storage: { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> } | undefined): Promise<boolean> {
  try {
    if (!storage?.persist) return false
    if (storage.persisted && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return false
  }
}

/** Minutes between retries while a send keeps failing. */
export const RETRY_MINUTES = [1, 2, 4, 8, 15] as const

export interface SenderDeps {
  /** One full round (consents → measurements → photos). True when everything waiting was sent. */
  run: () => Promise<boolean>
  isOnline: () => boolean
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (t: unknown) => void
  /** After each round: whether it all went, for the badge and "last sent". */
  onRound?: (allSent: boolean) => void
}

/**
 * A single sender: `request()` from anywhere (save, app open, back online, Send now). A request
 * during a round asks for one more round after it, never a second round at the same time.
 */
export function createSender(d: SenderDeps) {
  let running = false
  let again = false
  let failures = 0
  let timer: unknown = null

  const schedule = () => {
    if (timer !== null) d.clearTimer(timer)
    timer = null
    if (!d.isOnline()) return
    const minutes = RETRY_MINUTES[Math.min(failures - 1, RETRY_MINUTES.length - 1)]
    timer = d.setTimer(() => {
      timer = null
      void request()
    }, minutes * 60_000)
  }

  async function request(): Promise<void> {
    if (running) {
      again = true
      return
    }
    running = true
    try {
      do {
        again = false
        let ok = false
        try {
          ok = await d.run()
        } catch {
          ok = false
        }
        d.onRound?.(ok)
        if (ok) {
          failures = 0
          if (timer !== null) d.clearTimer(timer)
          timer = null
        } else {
          failures++
          schedule()
        }
      } while (again)
    } finally {
      running = false
    }
  }

  return {
    request,
    /** For tests and the screen. */
    get busy() {
      return running
    },
    stop() {
      if (timer !== null) d.clearTimer(timer)
      timer = null
    },
  }
}
