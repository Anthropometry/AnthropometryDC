/**
 * F6 calls: the blurred JPEG through the Worker (owner, JPEG and size checked there; practice under
 * practice/), then its metadata row, then "photos done". No image, name or face ever goes to the
 * database; the database refuses photos without consent or before measurements are finished.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PhotoApi, PhotoMeta, PhotoSlot } from '../lib/photoQueue'

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

const isDuplicate = (e: { code?: string; message?: string } | null) =>
  !!e && e.code === '23505' && (e.message ?? '').includes('photos_participant_id_slot_key')

const columns = (m: PhotoMeta) => ({
  width: m.width,
  height: m.height,
  bytes: m.bytes,
  taken_at: m.takenAt,
  faces_detected: m.facesDetected,
  level_pitch: m.levelPitch,
  level_roll: m.levelRoll,
  phone_model: m.phoneModel,
  a4_confirmed: m.a4Confirmed,
  zoom: m.zoom,
  blur_version: m.blurVersion,
  people_detected: m.peopleDetected,
  face_hidden_confirmed: m.faceHiddenConfirmed,
  head_top_y: m.headTopY,
  heel_y: m.heelY,
})

export function photoApi(client: SupabaseClient, fetchFn: FetchLike = (i, r) => fetch(i, r)): PhotoApi {
  async function token(): Promise<string> {
    const { data } = await client.auth.getSession()
    const t = data.session?.access_token
    if (!t) throw new Error('signed_out')
    return t
  }
  return {
    async upload(participantId: string, slot: PhotoSlot, jpeg: Uint8Array) {
      const res = await fetchFn(`/api/photos/${participantId}/${slot}`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${await token()}` },
        body: jpeg as unknown as BodyInit,
      })
      if (res.status !== 201) throw new Error(`upload_${res.status}`)
    },
    async saveRow(participantId: string, slot: PhotoSlot, m: PhotoMeta) {
      const { error } = await client.from('photos').insert({ participant_id: participantId, slot, ...columns(m) })
      if (!error) return
      if (!isDuplicate(error)) throw error
      const again = await client.from('photos').update(columns(m)).eq('participant_id', participantId).eq('slot', slot).select('id')
      if (again.error) throw again.error
      if (!again.data || again.data.length !== 1) throw new Error('not_saved')
    },
    async markDone(participantId: string) {
      const { error } = await client
        .from('participants')
        .update({ photos_done_at: new Date().toISOString() })
        .eq('id', participantId)
        .is('photos_done_at', null)
        .select('id')
      if (error) throw error
    },
  }
}
