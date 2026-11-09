/**
 * F5 offline saving for measurements (IndexedDB via Dexie, in the same database as consents).
 * - `drafts`: per participant, what has been entered on this phone. The screens read and write it.
 * - `ops`: changes waiting to be sent, in order (about → measurements → finish). Each is deleted only
 *   after the server confirms it (POLICY §12). Consents are sent first (flushConsents), because the
 *   database refuses measurements without consent.
 * Everything is kept per collector, like consents.
 */
import type { FieldDb } from './consentQueue'
import type { Code, Sex, Unit } from './measurements'
import type { AgeGroup } from './practice'

export type Clothing = 'light' | 'medium' | 'heavy'
export type SkipReason = 'declined' | 'could_not_measure' | 'other' | 'declined_at_consent'
export type HeightMethod = 'steel_tape' | 'wall_100'

export interface About {
  sex: Sex
  ageYears: number
  clothing: Clothing
}

export interface Entry {
  code: Code
  unit: Unit | null
  readingsTyped: string[]
  skipped: boolean
  skipReason: SkipReason | null
  skipNote: string | null
  confirmedUnusual: boolean
  heightMethod: HeightMethod | null
  hairAddsHeight: boolean | null
  measuredAt: string
}

export interface MeasureDraft {
  participantId: string
  collectorId: string
  isPractice: boolean
  ageGroup: AgeGroup
  intimateOk: boolean
  about: About | null
  entries: Partial<Record<Code, Entry>>
  finishedAt: string | null
}

export type MeasureOp =
  | { seq?: number; collectorId: string; participantId: string; kind: 'about'; about: About }
  | { seq?: number; collectorId: string; participantId: string; kind: 'entry'; entry: Entry }
  | { seq?: number; collectorId: string; participantId: string; kind: 'finish'; at: string }

export interface MeasureApi {
  saveAbout: (participantId: string, about: About) => Promise<void>
  /** Insert, or update the existing row for this participant and code. */
  saveEntry: (participantId: string, entry: Entry) => Promise<void>
  finish: (participantId: string) => Promise<void>
}

export async function loadDraft(db: FieldDb, participantId: string): Promise<MeasureDraft | undefined> {
  return db.drafts.get(participantId)
}

export async function startDraft(
  db: FieldDb,
  d: Pick<MeasureDraft, 'participantId' | 'collectorId' | 'isPractice' | 'ageGroup' | 'intimateOk'> & Partial<MeasureDraft>,
): Promise<MeasureDraft> {
  const existing = await db.drafts.get(d.participantId)
  if (existing) return existing
  const draft: MeasureDraft = { about: null, entries: {}, finishedAt: null, ...d }
  await db.drafts.put(draft)
  return draft
}

/** Record on the phone, then queue it for sending (both in one transaction: never one without the other). */
async function record(db: FieldDb, draft: MeasureDraft, op: MeasureOp): Promise<void> {
  await db.transaction('rw', db.drafts, db.ops, async () => {
    await db.drafts.put(draft)
    await db.ops.add(op)
  })
}

export async function saveAbout(db: FieldDb, draft: MeasureDraft, about: About): Promise<MeasureDraft> {
  const next = { ...draft, about }
  await record(db, next, { collectorId: draft.collectorId, participantId: draft.participantId, kind: 'about', about })
  return next
}

export async function saveEntry(db: FieldDb, draft: MeasureDraft, entry: Entry): Promise<MeasureDraft> {
  const next = { ...draft, entries: { ...draft.entries, [entry.code]: entry } }
  await record(db, next, { collectorId: draft.collectorId, participantId: draft.participantId, kind: 'entry', entry })
  return next
}

export async function finishDraft(db: FieldDb, draft: MeasureDraft, at: string): Promise<MeasureDraft> {
  const next = { ...draft, finishedAt: at }
  await record(db, next, { collectorId: draft.collectorId, participantId: draft.participantId, kind: 'finish', at })
  return next
}

export async function waitingOps(db: FieldDb, collectorId: string): Promise<number> {
  return db.ops.where('collectorId').equals(collectorId).count()
}

/**
 * Send this collector's waiting changes in order; stop at the first failure (try again later).
 * A finished participant's draft is removed once nothing for it is waiting.
 */
export async function flushMeasurements(db: FieldDb, collectorId: string, api: MeasureApi): Promise<number> {
  const ops = await db.ops.where('collectorId').equals(collectorId).sortBy('seq')
  let sent = 0
  for (const op of ops) {
    try {
      if (op.kind === 'about') await api.saveAbout(op.participantId, op.about)
      else if (op.kind === 'entry') await api.saveEntry(op.participantId, op.entry)
      else await api.finish(op.participantId)
    } catch {
      break
    }
    await db.ops.delete(op.seq!)
    sent++
    if (op.kind === 'finish' && (await db.ops.where('participantId').equals(op.participantId).count()) === 0) {
      await db.drafts.delete(op.participantId)
    }
  }
  return sent
}
