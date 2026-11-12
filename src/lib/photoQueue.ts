/**
 * F6 offline photos (IndexedDB, same database as consents and measurements).
 * - `photos`: blurred JPEGs waiting to upload, one per participant and slot (a retake replaces it).
 *   Only objects made by capture() (isBlurred) can be put here: an unblurred frame can never be queued.
 * - `photoDone`: "front and side are in" for a participant, sent after its photos.
 * Sending order per photo: the file through the Worker, then the `photos` row; each is removed from the
 * phone only after the server confirms (POLICY §12). Photos go after consents and measurements, which
 * the database and Worker require first.
 */
import type { FieldDb } from './consentQueue'
import { isBlurred, type BlurredPhoto } from './capture'

export type PhotoSlot = 'front' | 'side' | 'back'
export const PHOTO_SLOTS: readonly PhotoSlot[] = ['front', 'side', 'back']

export interface PhotoMeta {
  width: number
  height: number
  bytes: number
  takenAt: string
  facesDetected: number
  levelPitch: number | null
  levelRoll: number | null
  phoneModel: string | null
  a4Confirmed: boolean
  /** Digital zoom used (1 = none), for the researchers. */
  zoom: number
  /** F6 Amendment A: 2 = whole-head blur from the pose model (older photos are never sent). */
  blurVersion: 2
  peopleDetected: number
  /** The collector answered Yes to "Is the face completely hidden?" (always true on a saved photo). */
  faceHiddenConfirmed: true
  /** Top of the head and bottom of the heels, photo pixels, measured before the blur. */
  headTopY: number
  heelY: number
}

export interface QueuedPhoto extends PhotoMeta {
  /** `${participantId}:${slot}` */
  key: string
  collectorId: string
  participantId: string
  slot: PhotoSlot
  jpeg: Uint8Array
  /** File already confirmed by the Worker (only the row is left). */
  uploaded: boolean
}

export interface PhotoDone {
  participantId: string
  collectorId: string
}

export interface PhotoApi {
  /** PUT the JPEG through the Worker (owner, JPEG and size checked there). Overwrites on retry. */
  upload: (participantId: string, slot: PhotoSlot, jpeg: Uint8Array) => Promise<void>
  /** Insert the row, or update it on a retake / retry. */
  saveRow: (participantId: string, slot: PhotoSlot, meta: PhotoMeta) => Promise<void>
  markDone: (participantId: string) => Promise<void>
}

export interface Shot {
  photo: BlurredPhoto
  levelPitch: number | null
  levelRoll: number | null
  a4Confirmed: boolean
  /** The answer to "Is the face completely hidden?": only Yes can be saved. */
  faceHidden: boolean
  takenAt: string
  zoom: number
}

const round1 = (n: number | null) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10)

/** Keep a blurred photo on the phone, waiting to upload. Refuses anything capture() did not make. */
export async function savePhoto(
  db: FieldDb,
  who: { collectorId: string; participantId: string; slot: PhotoSlot; phoneModel: string | null },
  shot: Shot,
): Promise<void> {
  if (!isBlurred(shot.photo)) throw new Error('not_blurred')
  if (shot.faceHidden !== true) throw new Error('face_not_hidden')
  const p = shot.photo
  const row: QueuedPhoto = {
    key: `${who.participantId}:${who.slot}`,
    collectorId: who.collectorId,
    participantId: who.participantId,
    slot: who.slot,
    jpeg: p.jpeg,
    width: p.width,
    height: p.height,
    bytes: p.bytes,
    facesDetected: Math.min(20, p.facesDetected),
    takenAt: shot.takenAt,
    levelPitch: round1(shot.levelPitch),
    levelRoll: round1(shot.levelRoll),
    phoneModel: who.phoneModel ? who.phoneModel.slice(0, 80) : null,
    a4Confirmed: shot.a4Confirmed,
    zoom: Math.round(Math.min(4, Math.max(1, shot.zoom)) * 10) / 10,
    blurVersion: 2,
    peopleDetected: Math.min(20, p.peopleDetected),
    faceHiddenConfirmed: true,
    headTopY: p.headTopY,
    heelY: p.heelY,
    uploaded: false,
  }
  await db.photos.put(row)
}

/** Front and side are saved: mark the participant's photos done (sent after the photos). */
export async function finishPhotos(db: FieldDb, collectorId: string, participantId: string): Promise<void> {
  await db.photoDone.put({ participantId, collectorId })
}

/** Which slots are kept on this phone for a participant (for the screens). */
export async function slotsOnPhone(db: FieldDb, participantId: string): Promise<PhotoSlot[]> {
  const rows = await db.photos.where('participantId').equals(participantId).toArray()
  return rows.map((r) => r.slot)
}

export async function waitingPhotos(db: FieldDb, collectorId: string): Promise<number> {
  return (await db.photos.where('collectorId').equals(collectorId).count()) + (await db.photoDone.where('collectorId').equals(collectorId).count())
}

const meta = (r: QueuedPhoto): PhotoMeta => ({
  width: r.width,
  height: r.height,
  bytes: r.bytes,
  takenAt: r.takenAt,
  facesDetected: r.facesDetected,
  levelPitch: r.levelPitch,
  levelRoll: r.levelRoll,
  phoneModel: r.phoneModel,
  a4Confirmed: r.a4Confirmed,
  zoom: r.zoom ?? 1,
  blurVersion: 2,
  peopleDetected: r.peopleDetected,
  faceHiddenConfirmed: true,
  headTopY: r.headTopY,
  heelY: r.heelY,
})

/**
 * Send this collector's waiting photos, then the "done" marks whose photos are all in.
 * A failure for one participant (e.g. measurements not arrived yet) skips that participant only.
 */
export async function flushPhotos(db: FieldDb, collectorId: string, api: PhotoApi): Promise<number> {
  let sent = 0
  const failed = new Set<string>()
  const rows = await db.photos.where('collectorId').equals(collectorId).toArray()
  for (const r of rows) {
    // Amendment A: a photo made with the old blur (it could miss a face) is never sent. It is deleted
    // from the phone with its "done" mark, so the list asks for the photos again.
    if ((r as Partial<QueuedPhoto>).blurVersion !== 2) {
      await db.transaction('rw', db.photos, db.photoDone, async () => {
        await db.photos.delete(r.key)
        await db.photoDone.delete(r.participantId)
      })
      failed.add(r.participantId)
      continue
    }
    if (failed.has(r.participantId)) continue
    try {
      if (!r.uploaded) {
        await api.upload(r.participantId, r.slot, r.jpeg)
        // A retake may have replaced this photo meanwhile: only mark the one we sent.
        await db.transaction('rw', db.photos, async () => {
          const now = await db.photos.get(r.key)
          if (now && now.takenAt === r.takenAt) await db.photos.update(r.key, { uploaded: true })
        })
      }
      await api.saveRow(r.participantId, r.slot, meta(r))
      await db.transaction('rw', db.photos, async () => {
        const now = await db.photos.get(r.key)
        if (now && now.takenAt === r.takenAt) await db.photos.delete(r.key)
      })
      sent++
    } catch {
      failed.add(r.participantId)
    }
  }
  const done = await db.photoDone.where('collectorId').equals(collectorId).toArray()
  for (const d of done) {
    if (failed.has(d.participantId)) continue
    if ((await db.photos.where('participantId').equals(d.participantId).count()) > 0) continue
    try {
      await api.markDone(d.participantId)
      await db.photoDone.delete(d.participantId)
      sent++
    } catch {
      // try again later
    }
  }
  return sent
}
