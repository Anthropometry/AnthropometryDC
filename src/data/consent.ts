/**
 * F4 calls: participants, write-only consents, signature uploads through the Worker, the
 * collector's own list, and admin withdrawal. The database and Worker decide what is allowed.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsentApi, ConsentJob, SignatureSlot } from '../lib/consentQueue'
import type { PracticeRow } from '../lib/practice'

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

const isDuplicate = (e: { code?: string; message?: string } | null, constraint: string) =>
  !!e && e.code === '23505' && (e.message ?? '').includes(constraint)

export function consentApi(client: SupabaseClient, fetchFn: FetchLike = (i, r) => fetch(i, r)): ConsentApi {
  async function token(): Promise<string> {
    const { data } = await client.auth.getSession()
    const t = data.session?.access_token
    if (!t) throw new Error('signed_out')
    return t
  }
  return {
    async insertParticipant(job: ConsentJob) {
      const { error } = await client.from('participants').insert({
        id: job.participantId,
        is_practice: job.isPractice,
        age_group: job.ageGroup,
        receipt_code: job.rejected ? null : job.receiptCode,
        status: job.rejected ? 'rejected' : 'draft',
      })
      if (error && !isDuplicate(error, 'participants_pkey')) throw error
    },
    async insertConsent(job: ConsentJob) {
      const c = job.consent!
      // No .select(): collectors may write a consent but never read one back.
      const { error } = await client.from('consents').insert({
        participant_id: job.participantId,
        participant_name: c.participantName,
        guardian_name: c.guardianName,
        language: c.language,
        consent_version: c.consentVersion,
        agreed_data: true,
        agreed_photos: true,
        child_assent: c.childAssent,
        agreed_intimate: c.agreedIntimate === true,
        agreed_weight: c.agreedWeight === true,
        signed_at: c.signedAt,
      })
      if (error && !isDuplicate(error, 'consents_participant_id_key')) throw error
    },
    async uploadSignature(participantId: string, slot: SignatureSlot, png: Uint8Array) {
      const res = await fetchFn(`/api/signatures/${participantId}/${slot}`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png', authorization: `Bearer ${await token()}` },
        body: png as unknown as BodyInit,
      })
      if (res.status !== 201) throw new Error(`upload_${res.status}`)
    },
    async markSignature(participantId: string, slot: SignatureSlot) {
      const { error } = await client.rpc('mark_signature_uploaded', { p_participant: participantId, p_slot: slot })
      if (error) throw error
    },
  }
}

/** The signed-in collector's own participants (practice or real), with a consent yes/no. */
export async function listMine(client: SupabaseClient, practice: boolean): Promise<PracticeRow[]> {
  const { data, error } = await client.rpc('my_participants', { p_practice: practice })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    practiceNo: (r.practice_no as number | null) ?? null,
    ageGroup: r.age_group as 'adult' | 'child',
    status: r.status as string,
    createdAt: r.created_at as string,
    waiting: false,
    receiptCode: (r.receipt_code as string | null) ?? null,
    hasConsent: r.has_consent === true,
    measured: r.measured === true,
    intimateOk: r.intimate_ok === true,
    weightOk: r.weight_ok === true,
    sex: (r.sex as 'female' | 'male' | null) ?? null,
    ageYears: (r.age_years as number | null) ?? null,
  }))
}

export interface WithdrawPreview {
  found: boolean
  alreadyWithdrawn: boolean
  isPractice: boolean | null
  ageGroup: string | null
  createdAt: string | null
  collectorName: string | null
}

/** Admin only (checked in the database). Never returns a name of a participant. */
export async function previewWithdraw(client: SupabaseClient, receipt: string): Promise<WithdrawPreview> {
  const { data, error } = await client.rpc('admin_withdraw_preview', { p_receipt: receipt })
  if (error) throw error
  const r = ((data ?? []) as Record<string, unknown>[])[0] ?? {}
  return {
    found: r.is_found === true,
    alreadyWithdrawn: r.already_withdrawn === true,
    isPractice: (r.is_practice as boolean | null) ?? null,
    ageGroup: (r.age_group as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
    collectorName: (r.collector_name as string | null) ?? null,
  }
}

export type WithdrawOutcome = 'withdrawn' | 'not_found' | 'files_not_deleted' | 'forbidden' | 'failed'

/** Through the Worker, so the signature images are deleted from R2 too. */
export async function withdraw(client: SupabaseClient, receipt: string, fetchFn: FetchLike = (i, r) => fetch(i, r)): Promise<{ outcome: WithdrawOutcome; participantId?: string }> {
  const { data } = await client.auth.getSession()
  const t = data.session?.access_token
  if (!t) return { outcome: 'forbidden' }
  let res: Response
  try {
    res = await fetchFn('/api/withdraw', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
      body: JSON.stringify({ receipt }),
    })
  } catch {
    return { outcome: 'failed' }
  }
  const body = (await res.json().catch(() => ({}))) as { participantId?: string }
  if (res.status === 200) return { outcome: 'withdrawn' }
  if (res.status === 404) return { outcome: 'not_found' }
  if (res.status === 401 || res.status === 403) return { outcome: 'forbidden' }
  if (res.status === 502 && body.participantId) return { outcome: 'files_not_deleted', participantId: body.participantId }
  return { outcome: 'failed' }
}
