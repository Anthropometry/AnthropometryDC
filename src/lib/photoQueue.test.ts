// @vitest-environment jsdom
/** F6 offline photos: only blurred photos can be queued; upload → row → done, in order; nothing lost on failure. */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FieldDb } from './consentQueue'
import { capture, type BlurredPhoto } from './capture'
import { person } from './__fixtures__/people'
import { finishPhotos, flushPhotos, savePhoto, slotsOnPhone, waitingPhotos, type PhotoApi, type PhotoSlot, type Shot } from './photoQueue'
import { photoApi } from '../data/photos'
import type { SupabaseClient } from '@supabase/supabase-js'

let db: FieldDb
afterEach(async () => {
  vi.restoreAllMocks()
  await db?.delete()
})

function fakeCanvas() {
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
    putImageData: vi.fn(),
    clearRect: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
    cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 7])]))
  })
}

async function blurred(): Promise<BlurredPhoto> {
  fakeCanvas()
  const p = person({ w: 1200, h: 1600, cx: 600, top: 100, bottom: 1500 })
  return capture({} as CanvasImageSource, 1200, 1600, { pose: async () => ({ people: [p], masks: [null] }), faces: async () => [] })
}

const shot = async (takenAt = '2026-11-11T10:00:00Z'): Promise<Shot> => ({ photo: await blurred(), levelPitch: 0.43, levelRoll: -0.27, a4Confirmed: true, faceHidden: true, takenAt, zoom: 1.84 })
const who = (participantId: string, slot: PhotoSlot, collectorId = 'me') => ({ collectorId, participantId, slot, phoneModel: 'TECNO KI5' })

function api(over: Partial<PhotoApi> = {}) {
  const calls: string[] = []
  const a: PhotoApi = {
    upload: vi.fn(async (id, slot) => void calls.push(`upload:${id}:${slot}`)),
    saveRow: vi.fn(async (id, slot) => void calls.push(`row:${id}:${slot}`)),
    markDone: vi.fn(async (id) => void calls.push(`done:${id}`)),
    ...over,
  }
  return { api: a, calls }
}

describe('photo queue', () => {
  it('DENY: an unblurred image (not made by capture) can never be queued', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    const fake = { jpeg: new Uint8Array([0xff, 0xd8, 0xff]), width: 1200, height: 1600, bytes: 3, facesDetected: 0, peopleDetected: 1, headTopY: 1, heelY: 2, blurVersion: 2 as const }
    await expect(savePhoto(db, who('p1', 'front'), { photo: fake, levelPitch: 0, levelRoll: 0, a4Confirmed: true, faceHidden: true, takenAt: 'x', zoom: 1 })).rejects.toThrow('not_blurred')
    expect(await db.photos.count()).toBe(0)
  })

  it('DENY: a photo whose face the collector says is not hidden can never be queued', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    await expect(savePhoto(db, who('p1', 'front'), { ...(await shot()), faceHidden: false })).rejects.toThrow('face_not_hidden')
    expect(await db.photos.count()).toBe(0)
  })

  it('DENY: a photo made with the old blur (before Amendment A) is deleted from the phone, never sent; photos asked again', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    await savePhoto(db, who('p1', 'front'), await shot())
    const row = (await db.photos.get('p1:front'))!
    const old = { ...row } as Record<string, unknown>
    delete old.blurVersion
    await db.photos.put(old as never)
    await finishPhotos(db, 'me', 'p1')
    const { api: a, calls } = api()
    await flushPhotos(db, 'me', a)
    expect(calls).toEqual([])
    expect(await db.photos.count()).toBe(0)
    expect(await db.photoDone.count()).toBe(0)
  })

  it('upload → row for each photo, then "done"; each removed only after the server confirms', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    await savePhoto(db, who('p1', 'front'), await shot())
    await savePhoto(db, who('p1', 'side'), await shot())
    await finishPhotos(db, 'me', 'p1')
    expect(await slotsOnPhone(db, 'p1')).toEqual(['front', 'side'])
    expect(await waitingPhotos(db, 'me')).toBe(3)
    const { api: a, calls } = api()
    expect(await flushPhotos(db, 'me', a)).toBe(3)
    expect(calls).toEqual(['upload:p1:front', 'row:p1:front', 'upload:p1:side', 'row:p1:side', 'done:p1'])
    expect(vi.mocked(a.saveRow).mock.calls[0][2]).toMatchObject({ width: 1200, height: 1600, bytes: 4, levelPitch: 0.4, levelRoll: -0.3, a4Confirmed: true, phoneModel: 'TECNO KI5', zoom: 1.8, blurVersion: 2, peopleDetected: 1, faceHiddenConfirmed: true, heelY: 1500 })
    expect(await waitingPhotos(db, 'me')).toBe(0)
  })

  it('upload refused (e.g. measurements not arrived yet): photo and "done" stay; other participants still go', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    await savePhoto(db, who('p1', 'front'), await shot())
    await finishPhotos(db, 'me', 'p1')
    await savePhoto(db, who('p2', 'front'), await shot())
    const { api: a, calls } = api({
      upload: vi.fn(async (id: string) => {
        if (id === 'p1') throw new Error('upload_409')
        calls.push(`upload:${id}`)
      }),
    })
    await flushPhotos(db, 'me', a)
    expect(calls).toEqual(['upload:p2', 'row:p2:front'])
    expect(await slotsOnPhone(db, 'p1')).toEqual(['front'])
    expect(await db.photoDone.count()).toBe(1)
  })

  it('row fails after the upload: the file is not sent again, only the row', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    await savePhoto(db, who('p1', 'front'), await shot())
    let fail = true
    const { api: a, calls } = api({
      saveRow: vi.fn(async () => {
        if (fail) throw new Error('net')
        calls.push('row')
      }),
    })
    await flushPhotos(db, 'me', a)
    expect((await db.photos.get('p1:front'))?.uploaded).toBe(true)
    fail = false
    await flushPhotos(db, 'me', a)
    expect(calls).toEqual(['upload:p1:front', 'row'])
    expect(await db.photos.count()).toBe(0)
  })

  it('a retake replaces the waiting photo; another collector\'s photos are never sent', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    await savePhoto(db, who('p1', 'front'), await shot('2026-11-11T10:00:00Z'))
    await savePhoto(db, who('p1', 'front'), await shot('2026-11-11T10:01:00Z'))
    await savePhoto(db, who('p9', 'front', 'someone-else'), await shot())
    expect(await db.photos.where('participantId').equals('p1').count()).toBe(1)
    const { api: a, calls } = api()
    await flushPhotos(db, 'me', a)
    expect(calls).toEqual(['upload:p1:front', 'row:p1:front'])
    expect(vi.mocked(a.saveRow).mock.calls[0][2].takenAt).toBe('2026-11-11T10:01:00Z')
    expect(await waitingPhotos(db, 'someone-else')).toBe(1)
  })

  it('"done" waits until all that participant\'s photos are sent', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    await savePhoto(db, who('p1', 'front'), await shot())
    await finishPhotos(db, 'me', 'p1')
    const { api: a, calls } = api({ saveRow: vi.fn(async () => Promise.reject(new Error('net'))) })
    await flushPhotos(db, 'me', a)
    expect(calls).toEqual(['upload:p1:front'])
    expect(a.markDone).not.toHaveBeenCalled()
  })
})

describe('photo server calls', () => {
  function client(insertError: unknown = null) {
    const updates: unknown[] = []
    const chain = {
      update: vi.fn((v: unknown) => {
        updates.push(v)
        return chain
      }),
      insert: vi.fn(async () => ({ error: insertError })),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      select: vi.fn(async () => ({ data: [{ id: 'x' }], error: null })),
    }
    const c = {
      auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
      from: vi.fn(() => chain),
    }
    return { c: c as unknown as SupabaseClient, chain, updates }
  }
  const meta = { width: 1200, height: 1600, bytes: 4, takenAt: 't', facesDetected: 1, levelPitch: 0.4, levelRoll: -0.3, phoneModel: null, a4Confirmed: true, zoom: 1.5, blurVersion: 2 as const, peopleDetected: 1, faceHiddenConfirmed: true as const, headTopY: 60, heelY: 1500 }

  it('upload: PUT /api/photos/<id>/<slot>, JPEG, with the token; anything but 201 fails', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 201 }))
    const { c } = client()
    await photoApi(c, fetchFn).upload('p1', 'side', new Uint8Array([0xff, 0xd8, 0xff]))
    expect(fetchFn).toHaveBeenCalledWith('/api/photos/p1/side', expect.objectContaining({ method: 'PUT', headers: { 'content-type': 'image/jpeg', authorization: 'Bearer tok' } }))
    await expect(photoApi(c, async () => new Response(null, { status: 409 })).upload('p1', 'side', new Uint8Array([1]))).rejects.toThrow('upload_409')
  })

  it('row: insert; on a duplicate (retake / retry) update the metadata only', async () => {
    const { c, chain, updates } = client({ code: '23505', message: 'duplicate key value violates unique constraint "photos_participant_id_slot_key"' })
    await photoApi(c).saveRow('p1', 'front', meta)
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ participant_id: 'p1', slot: 'front', a4_confirmed: true, level_pitch: 0.4, zoom: 1.5, blur_version: 2, people_detected: 1, face_hidden_confirmed: true, head_top_y: 60, heel_y: 1500 }))
    expect(updates[0]).not.toHaveProperty('participant_id')
    expect(updates[0]).not.toHaveProperty('slot')
  })
})
