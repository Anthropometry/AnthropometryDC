/** F4 data calls with a fake Supabase client: retries are quiet, consents are never read back. */
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsentJob } from '../lib/consentQueue'
import { consentApi, listMine, previewWithdraw, withdraw } from './consent'
import { deletePractice } from './fieldwork'
import { fetchOwnProfile } from './collectors'

const job: ConsentJob = {
  participantId: '00000000-0000-4000-8000-000000000001',
  collectorId: 'me',
  createdAt: '2026-11-07T09:00:00Z',
  isPractice: true,
  ageGroup: 'adult',
  receiptCode: 'R7K2MPQ',
  rejected: false,
  consent: { participantName: 'Ama', guardianName: null, language: 'en', consentVersion: 'practice', childAssent: null, signedAt: '2026-11-07T09:00:00Z' },
  signatures: {},
  done: { participant: false, consent: false, signatures: [] },
}

function fakeClient(opts: { insertError?: { code: string; message: string } | null; rpc?: unknown; rpcError?: unknown; token?: string | null } = {}) {
  const inserts: { table: string; row: Record<string, unknown>; selected: boolean }[] = []
  const rpcs: [string, unknown][] = []
  const client = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        const entry = { table, row, selected: false }
        inserts.push(entry)
        const result = Promise.resolve({ error: opts.insertError ?? null })
        return Object.assign(result, {
          select: () => {
            entry.selected = true
            return result
          },
        })
      },
    }),
    rpc: vi.fn(async (name: string, args: unknown) => {
      rpcs.push([name, args])
      return { data: opts.rpc ?? null, error: opts.rpcError ?? null }
    }),
    auth: {
      getSession: async () => ({ data: { session: opts.token === null ? null : { access_token: opts.token ?? 'tok' } } }),
    },
  } as unknown as SupabaseClient
  return { client, inserts, rpcs }
}

describe('consentApi', () => {
  it('participant insert carries receipt and status; a rejected one has no receipt', async () => {
    const { client, inserts } = fakeClient()
    await consentApi(client).insertParticipant(job)
    await consentApi(client).insertParticipant({ ...job, rejected: true })
    expect(inserts[0].row).toMatchObject({ id: job.participantId, is_practice: true, receipt_code: 'R7K2MPQ', status: 'draft' })
    expect(inserts[1].row).toMatchObject({ receipt_code: null, status: 'rejected' })
  })

  it('DENY: consent is written without asking for it back (collectors cannot read consents)', async () => {
    const { client, inserts } = fakeClient()
    await consentApi(client).insertConsent(job)
    expect(inserts[0]).toMatchObject({ table: 'consents', selected: false })
    expect(inserts[0].row).toMatchObject({ participant_name: 'Ama', agreed_data: true, agreed_photos: true, consent_version: 'practice' })
  })

  it('a retry that finds the row already there is fine; other errors are not', async () => {
    const dup = fakeClient({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint "participants_pkey"' } })
    await expect(consentApi(dup.client).insertParticipant(job)).resolves.toBeUndefined()
    const dupC = fakeClient({ insertError: { code: '23505', message: 'violates unique constraint "consents_participant_id_key"' } })
    await expect(consentApi(dupC.client).insertConsent(job)).resolves.toBeUndefined()
    const receiptClash = fakeClient({ insertError: { code: '23505', message: 'violates unique constraint "participants_receipt_code_idx"' } })
    await expect(consentApi(receiptClash.client).insertParticipant(job)).rejects.toBeTruthy()
    const other = fakeClient({ insertError: { code: '23514', message: 'consent refused' } })
    await expect(consentApi(other.client).insertConsent(job)).rejects.toBeTruthy()
  })

  it('signature upload goes to the Worker with the login token; non-201 fails', async () => {
    const { client } = fakeClient()
    const f = vi.fn(async () => new Response('{}', { status: 201 }))
    await consentApi(client, f).uploadSignature(job.participantId, 'participant', new Uint8Array([1]))
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/signatures/${job.participantId}/participant`)
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok')
    expect(new Headers(init.headers).get('content-type')).toBe('image/png')
    await expect(consentApi(client, async () => new Response('{}', { status: 403 })).uploadSignature(job.participantId, 'participant', new Uint8Array([1]))).rejects.toThrow(/upload_403/)
    await expect(consentApi(fakeClient({ token: null }).client, f).uploadSignature(job.participantId, 'participant', new Uint8Array([1]))).rejects.toThrow(/signed_out/)
  })

  it('markSignature calls the database function', async () => {
    const { client, rpcs } = fakeClient()
    await consentApi(client).markSignature(job.participantId, 'guardian')
    expect(rpcs).toEqual([['mark_signature_uploaded', { p_participant: job.participantId, p_slot: 'guardian' }]])
    await expect(consentApi(fakeClient({ rpcError: { message: 'x' } }).client).markSignature(job.participantId, 'guardian')).rejects.toBeTruthy()
  })
})

describe('lists and withdrawal', () => {
  it('listMine maps rows and never includes a name', async () => {
    const { client } = fakeClient({ rpc: [{ id: 'a', practice_no: 2, age_group: 'child', status: 'draft', receipt_code: 'R7K2MPQ', created_at: 'x', has_consent: true }] })
    expect(await listMine(client, true)).toEqual([
      { id: 'a', practiceNo: 2, ageGroup: 'child', status: 'draft', createdAt: 'x', waiting: false, receiptCode: 'R7K2MPQ', hasConsent: true, measured: false, intimateOk: false, weightOk: false, photosDone: false, sex: null, ageRange: null },
    ])
  })

  it('previewWithdraw maps the answer', async () => {
    const { client } = fakeClient({ rpc: [{ is_found: true, already_withdrawn: false, is_practice: false, age_group: 'adult', created_at: 'x', collector_name: 'Ama' }] })
    expect(await previewWithdraw(client, 'R7K2MPQ')).toEqual({ found: true, alreadyWithdrawn: false, isPractice: false, ageGroup: 'adult', createdAt: 'x', collectorName: 'Ama' })
  })

  it.each([
    [200, {}, 'withdrawn'],
    [404, {}, 'not_found'],
    [403, {}, 'forbidden'],
    [401, {}, 'forbidden'],
    [502, { participantId: 'p1' }, 'files_not_deleted'],
    [502, {}, 'failed'],
  ] as const)('withdraw: %i → %s', async (status, body, outcome) => {
    const { client } = fakeClient()
    const r = await withdraw(client, 'R7K2MPQ', async () => Response.json(body, { status }))
    expect(r.outcome).toBe(outcome)
  })

  it('withdraw signed out or offline', async () => {
    expect((await withdraw(fakeClient({ token: null }).client, 'R7K2MPQ')).outcome).toBe('forbidden')
    expect((await withdraw(fakeClient().client, 'R7K2MPQ', async () => Promise.reject(new Error('x')))).outcome).toBe('failed')
  })

  it('deletePractice goes through the Worker; anything but 200 fails', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }))
    await deletePractice(fakeClient().client, 'p1', f)
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/practice/p1')
    await expect(deletePractice(fakeClient().client, 'p1', async () => new Response('{}', { status: 403 }))).rejects.toThrow()
    await expect(deletePractice(fakeClient({ token: null }).client, 'p1', f)).rejects.toThrow(/signed_out/)
  })
})

describe('fetchOwnProfile keeps the collector signed in when the server cannot be reached', () => {
  const client = (error: unknown, user: unknown = null) =>
    ({ auth: { getUser: async () => ({ data: { user }, error }) } }) as unknown as SupabaseClient

  it('no signal or a server hiccup throws (the app keeps the cached collector)', async () => {
    await expect(fetchOwnProfile(client({ status: 0, message: 'Failed to fetch' }))).rejects.toBeTruthy()
    await expect(fetchOwnProfile(client({ status: 500, message: 'oops' }))).rejects.toBeTruthy()
  })

  it('a real "not signed in" answer returns null (the app signs out)', async () => {
    expect(await fetchOwnProfile(client({ status: 401, message: 'bad jwt' }))).toBeNull()
    expect(await fetchOwnProfile(client({ status: 403, message: 'forbidden' }))).toBeNull()
    expect(await fetchOwnProfile(client(null, null))).toBeNull()
  })
})
