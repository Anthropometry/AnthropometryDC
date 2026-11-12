/**
 * F5 offline saving for measurements (IndexedDB via Dexie, in the same database as consents).
 * - `drafts`: per participant, what has been entered on this phone. The screens read and write it.
 * - `ops`: changes waiting to be sent, in order (about → measurements → finish). Each is deleted only
 *   after the server confirms it (POLICY §12). Consents are sent first (flushConsents), because the
 *   database refuses measurements without consent.
 * Everything is kept per collector, like consents.
 */
import type { FieldDb } from './consentQueue'
import { isAgeRange, rangeOf, type AgeRange, type Code, type Sex, type Unit } from './measurements'
import type { AgeGroup } from './practice'

export type Clothing = 'light' | 'medium' | 'heavy'
export type SkipReason = 'declined' | 'could_not_measure' | 'other' | 'declined_at_consent'
export type HeightMethod = 'steel_tape' | 'wall_100'

export interface About {
  sex: Sex
  /** F5 Amendment C: the age range, never the exact age. */
  ageRange: AgeRange
  clothing: Clothing
}

/** About saved on a phone before Amendment C held the exact age: turn it into its range. */
export function upgradeAbout(a: (Partial<About> & { ageYears?: number }) | null | undefined): About | null {
  if (!a || !a.sex || !a.clothing) return null
  const ageRange = isAgeRange(a.ageRange) ? a.ageRange : typeof a.ageYears === 'number' ? rangeOf(a.ageYears) : null
  return ageRange ? { sex: a.sex, ageRange, clothing: a.clothing } : null
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

/** F5 Amendment A: optional weight. `null` kg = asked and skipped. */
export interface Weight {
  kg: number | null
  source: 'scale' | 'told' | null
  confirmedUnusual: boolean
}

export interface MeasureDraft {
  participantId: string
  collectorId: string
  isPractice: boolean
  ageGroup: AgeGroup
  intimateOk: boolean
  /** Weight agreed at consent (older drafts lack it = false). */
  weightOk?: boolean
  /** Undefined = not asked yet. */
  weight?: Weight
  /** F5 Amendment B: stated height ({typed: null} = doesn't know); undefined = not asked yet. */
  toldHeight?: { typed: string | null; unit: 'cm' | 'ftin' | null }
  /** F5 Amendment B: stated weight in kg (null = doesn't know); undefined = not asked yet. */
  weightToldKg?: number | null
  about: About | null
  entries: Partial<Record<Code, Entry>>
  finishedAt: string | null
}

export type MeasureOp =
  | { seq?: number; collectorId: string; participantId: string; kind: 'about'; about: About }
  | { seq?: number; collectorId: string; participantId: string; kind: 'entry'; entry: Entry }
  | { seq?: number; collectorId: string; participantId: string; kind: 'finish'; at: string }
  | { seq?: number; collectorId: string; participantId: string; kind: 'weight'; weight: Weight }
  | { seq?: number; collectorId: string; participantId: string; kind: 'toldHeight'; typed: string | null; unit: 'cm' | 'ftin' | null }
  | { seq?: number; collectorId: string; participantId: string; kind: 'toldWeight'; kg: number | null }

export interface MeasureApi {
  saveAbout: (participantId: string, about: About) => Promise<void>
  /** Insert, or update the existing row for this participant and code. */
  saveEntry: (participantId: string, entry: Entry) => Promise<void>
  finish: (participantId: string) => Promise<void>
  saveWeight: (participantId: string, weight: Weight) => Promise<void>
  saveToldHeight: (participantId: string, typed: string | null, unit: 'cm' | 'ftin' | null) => Promise<void>
  saveToldWeight: (participantId: string, kg: number | null) => Promise<void>
}

export async function loadDraft(db: FieldDb, participantId: string): Promise<MeasureDraft | undefined> {
  const d = await db.drafts.get(participantId)
  return d && d.about ? { ...d, about: upgradeAbout(d.about) } : d
}

export async function startDraft(
  db: FieldDb,
  d: Pick<MeasureDraft, 'participantId' | 'collectorId' | 'isPractice' | 'ageGroup' | 'intimateOk'> & Partial<MeasureDraft>,
): Promise<MeasureDraft> {
  const existing = await loadDraft(db, d.participantId)
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

export async function saveWeightLocal(db: FieldDb, draft: MeasureDraft, weight: Weight): Promise<MeasureDraft> {
  const next = { ...draft, weight }
  await record(db, next, { collectorId: draft.collectorId, participantId: draft.participantId, kind: 'weight', weight })
  return next
}

export async function saveToldHeightLocal(
  db: FieldDb,
  draft: MeasureDraft,
  typed: string | null,
  unit: 'cm' | 'ftin' | null,
): Promise<MeasureDraft> {
  const next = { ...draft, toldHeight: { typed, unit } }
  await record(db, next, { collectorId: draft.collectorId, participantId: draft.participantId, kind: 'toldHeight', typed, unit })
  return next
}

export async function saveToldWeightLocal(db: FieldDb, draft: MeasureDraft, kg: number | null): Promise<MeasureDraft> {
  const next = { ...draft, weightToldKg: kg }
  await record(db, next, { collectorId: draft.collectorId, participantId: draft.participantId, kind: 'toldWeight', kg })
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
      if (op.kind === 'about') {
        const about = upgradeAbout(op.about)
        if (about) await api.saveAbout(op.participantId, about)
      }
      else if (op.kind === 'entry') await api.saveEntry(op.participantId, op.entry)
      else if (op.kind === 'weight') await api.saveWeight(op.participantId, op.weight)
      else if (op.kind === 'toldHeight') await api.saveToldHeight(op.participantId, op.typed, op.unit)
      else if (op.kind === 'toldWeight') await api.saveToldWeight(op.participantId, op.kg)
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
