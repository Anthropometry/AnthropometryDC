/**
 * F4 offline queue for participants, consents and signature images (IndexedDB via Dexie).
 * Each job is sent in order: participant → consent → each signature (→ record its slot).
 * A job is deleted from the phone only after every step is confirmed by the server (POLICY §12).
 * Jobs are kept per collector, so nothing is sent under someone else's login on a shared phone.
 * F7: one participant that fails no longer holds up the others; failures are reported (src/lib/sync.ts).
 */
import Dexie, { type Table } from 'dexie'
import type { Language } from './profile'
import type { AgeGroup } from './practice'
import type { MeasureDraft, MeasureOp } from './measureQueue'
import type { PhotoDone, QueuedPhoto } from './photoQueue'
import { noReport, type Reporter, type SyncIssue } from './sync'

export type SignatureSlot = 'participant' | 'guardian' | 'assent'
export const SIGNATURE_SLOTS: readonly SignatureSlot[] = ['participant', 'guardian', 'assent']

export interface ConsentRecord {
  participantName: string
  guardianName: string | null
  language: Language
  consentVersion: string
  childAssent: boolean | null
  /** F5 amendment: the optional third tick (intimate measurements). Older waiting jobs lack it (= false). */
  agreedIntimate?: boolean
  /** F5 Amendment A: the optional weight tick (missing on older waiting jobs = false). */
  agreedWeight?: boolean
  signedAt: string
}

export interface ConsentJob {
  participantId: string
  collectorId: string
  createdAt: string
  isPractice: boolean
  ageGroup: AgeGroup
  receiptCode: string
  /** The child said No: only a rejected participant is sent, no consent, no signatures. */
  rejected: boolean
  consent: ConsentRecord | null
  /** PNG bytes per slot. */
  signatures: Partial<Record<SignatureSlot, Uint8Array>>
  done: { participant: boolean; consent: boolean; signatures: SignatureSlot[] }
}

export class FieldDb extends Dexie {
  jobs!: Table<ConsentJob, string>
  /** F5: what has been measured for each participant on this phone (the screens read this). */
  drafts!: Table<MeasureDraft, string>
  /** F5: changes waiting to be sent, in order. */
  ops!: Table<MeasureOp, number>
  /** F6: blurred photos waiting to upload, and "photos done" marks. */
  photos!: Table<QueuedPhoto, string>
  photoDone!: Table<PhotoDone, string>
  /** F7: participants whose sending keeps failing (never deletes anything else). */
  issues!: Table<SyncIssue, string>
  constructor(name = 'anthro-collect') {
    super(name)
    this.version(1).stores({ jobs: 'participantId, collectorId, createdAt' })
    this.version(2).stores({
      jobs: 'participantId, collectorId, createdAt',
      drafts: 'participantId, collectorId',
      ops: '++seq, collectorId, participantId',
    })
    this.version(3).stores({
      jobs: 'participantId, collectorId, createdAt',
      drafts: 'participantId, collectorId',
      ops: '++seq, collectorId, participantId',
      photos: 'key, collectorId, participantId',
      photoDone: 'participantId, collectorId',
    })
    this.version(4).stores({
      jobs: 'participantId, collectorId, createdAt',
      drafts: 'participantId, collectorId',
      ops: '++seq, collectorId, participantId',
      photos: 'key, collectorId, participantId',
      photoDone: 'participantId, collectorId',
      issues: 'key, collectorId, participantId',
    })
  }
}

export interface ConsentApi {
  /** Must succeed quietly if the participant already arrived (a retry). */
  insertParticipant: (job: ConsentJob) => Promise<void>
  /** Must succeed quietly if the consent already arrived. */
  insertConsent: (job: ConsentJob) => Promise<void>
  uploadSignature: (participantId: string, slot: SignatureSlot, png: Uint8Array) => Promise<void>
  markSignature: (participantId: string, slot: SignatureSlot) => Promise<void>
}

export async function saveJob(db: FieldDb, job: ConsentJob): Promise<void> {
  await db.jobs.put(job)
}

export async function waitingJobs(db: FieldDb, collectorId: string): Promise<ConsentJob[]> {
  return db.jobs.where('collectorId').equals(collectorId).sortBy('createdAt')
}

export async function waitingCount(db: FieldDb, collectorId: string): Promise<number> {
  return db.jobs.where('collectorId').equals(collectorId).count()
}

/**
 * Send everything waiting for this collector, oldest first. A participant that fails is reported and
 * tried again next round; the others still go (F7). Returns how many finished.
 */
export async function flushConsents(db: FieldDb, collectorId: string, api: ConsentApi, report: Reporter = noReport): Promise<number> {
  let finished = 0
  for (const job of await waitingJobs(db, collectorId)) {
    try {
      await sendJob(db, job, api)
    } catch (e) {
      await report.fail('consent', job.participantId, e)
      continue
    }
    await report.ok('consent', job.participantId)
    finished++
  }
  return finished
}

async function sendJob(db: FieldDb, job: ConsentJob, api: ConsentApi): Promise<void> {
  const save = (done: ConsentJob['done']) => db.jobs.update(job.participantId, { done })
  let done = job.done
  if (!done.participant) {
    await api.insertParticipant(job)
    done = { ...done, participant: true }
    await save(done)
  }
  if (!job.rejected && job.consent && !done.consent) {
    await api.insertConsent(job)
    done = { ...done, consent: true }
    await save(done)
  }
  if (!job.rejected) {
    for (const slot of SIGNATURE_SLOTS) {
      const png = job.signatures[slot]
      if (!png || done.signatures.includes(slot)) continue
      await api.uploadSignature(job.participantId, slot, png)
      await api.markSignature(job.participantId, slot)
      done = { ...done, signatures: [...done.signatures, slot] }
      await save(done)
    }
  }
  // Every step confirmed: now, and only now, the names and signatures leave this phone.
  await db.jobs.delete(job.participantId)
}
