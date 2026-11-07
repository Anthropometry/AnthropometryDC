import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './index'

const PID = '11111111-2222-4333-8444-555555555555'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function fakeBucket(keys: string[] = []) {
  const store = new Set(keys)
  return {
    store,
    put: vi.fn(async () => ({})),
    list: vi.fn(async ({ prefix }: { prefix: string }) => ({
      objects: [...store].filter((k) => k.startsWith(prefix)).map((key) => ({ key })),
      truncated: false,
    })),
    delete: vi.fn(async (k: string[]) => {
      k.forEach((x) => store.delete(x))
    }),
  }
}
type FakeBucket = ReturnType<typeof fakeBucket>

let photos: FakeBucket
let signatures: FakeBucket
let env: Env
/** participant id → owning collector id (what the database knows). */
let owners: Record<string, string>
/** What admin_withdraw returns for the next call: a participant id, null, or an HTTP error status. */
let withdrawResult: string | null | number
/** Participants that are practice records. */
let practiceIds: Set<string>
/** What the database answers to the practice DELETE: rows deleted. */
let deletedRows: number
const VALID_TOKEN = 'good-token'
const ME = 'aaaaaaaa-0000-4000-8000-00000000000a'
const OTHER = 'bbbbbbbb-0000-4000-8000-00000000000b'

beforeEach(() => {
  photos = fakeBucket()
  signatures = fakeBucket()
  env = {
    PHOTOS: photos as unknown as R2Bucket,
    SIGNATURES: signatures as unknown as R2Bucket,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  }
  owners = { [PID]: ME }
  withdrawResult = null
  practiceIds = new Set()
  deletedRows = 1
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const ok = new Headers(init?.headers).get('authorization') === `Bearer ${VALID_TOKEN}`
      if (input.endsWith('/auth/v1/user')) {
        return ok ? Response.json({ id: ME }) : new Response('{}', { status: 401 })
      }
      if (input.includes('/rest/v1/participants') && init?.method === 'DELETE') {
        return ok ? Response.json(Array.from({ length: deletedRows }, () => ({ id: 'x' }))) : new Response('{}', { status: 401 })
      }
      if (input.includes('/rest/v1/participants')) {
        // Like row-level security for an admin: every row is visible; the collector_id filter narrows it.
        const q = new URL(input).searchParams
        const id = q.get('id')?.replace('eq.', '')
        const by = q.get('collector_id')?.replace('eq.', '')
        return Response.json(
          ok && id && owners[id] && (!by || owners[id] === by) ? [{ id, is_practice: practiceIds.has(id) }] : [],
        )
      }
      if (input.endsWith('/rest/v1/rpc/admin_withdraw')) {
        if (!ok) return new Response('{}', { status: 401 })
        if (typeof withdrawResult === 'number') return new Response('{}', { status: withdrawResult })
        return Response.json(withdrawResult)
      }
      return new Response('unexpected', { status: 500 })
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const call = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://app.test${path}`, init), env)

const upload = (path: string, body: Uint8Array, type: string, token: string | null = VALID_TOKEN) =>
  call(path, {
    method: 'PUT',
    body,
    headers: { 'content-type': type, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })

describe('routing', () => {
  it('health returns ok', async () => {
    const res = await call('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
  it('unknown /api route returns 404', async () => {
    expect((await call('/api/nope')).status).toBe(404)
    expect((await call('/api/photos/x')).status).toBe(404)
  })
  it('wrong method returns 405', async () => {
    expect((await call(`/api/photos/${PID}/front`)).status).toBe(405)
  })
  it('bad participant id or slot returns 404', async () => {
    expect((await upload('/api/photos/not-a-uuid/front', JPEG, 'image/jpeg')).status).toBe(404)
    expect((await upload(`/api/photos/${PID}/face`, JPEG, 'image/jpeg')).status).toBe(404)
  })
})

describe('upload: deny paths', () => {
  it('no token gives 401', async () => {
    expect((await upload(`/api/photos/${PID}/front`, JPEG, 'image/jpeg', null)).status).toBe(401)
  })
  it('invalid token gives 401', async () => {
    expect((await upload(`/api/photos/${PID}/front`, JPEG, 'image/jpeg', 'forged')).status).toBe(401)
  })
  it('another collector participant gives 403 and stores nothing', async () => {
    owners = {}
    expect((await upload(`/api/photos/${PID}/front`, JPEG, 'image/jpeg')).status).toBe(403)
    expect(photos.put).not.toHaveBeenCalled()
  })
  it('wrong content type gives 415', async () => {
    expect((await upload(`/api/photos/${PID}/front`, PNG, 'image/png')).status).toBe(415)
  })
  it('content type that lies about the bytes gives 415', async () => {
    expect((await upload(`/api/photos/${PID}/front`, PNG, 'image/jpeg')).status).toBe(415)
  })
  it('too large gives 413 and stores nothing', async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1)
    big.set(JPEG)
    expect((await upload(`/api/photos/${PID}/front`, big, 'image/jpeg')).status).toBe(413)
    expect(photos.put).not.toHaveBeenCalled()
  })
})

describe('upload: allow paths', () => {
  it('stores a photo at a fixed key in the photos bucket', async () => {
    const res = await upload(`/api/photos/${PID}/front`, JPEG, 'image/jpeg')
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ key: `${PID}/front.jpg` })
    expect(photos.put).toHaveBeenCalledOnce()
    expect(signatures.put).not.toHaveBeenCalled()
  })
  it('stores a signature in the signatures bucket', async () => {
    const res = await upload(`/api/signatures/${PID}/participant`, PNG, 'image/png')
    expect(res.status).toBe(201)
    expect(signatures.put).toHaveBeenCalledOnce()
    expect(photos.put).not.toHaveBeenCalled()
  })
})

describe('F4: uploads only to your own participant', () => {
  it("DENY: a participant you can see (as admin) but don't own gives 403", async () => {
    owners = { [PID]: OTHER }
    expect((await upload(`/api/signatures/${PID}/participant`, PNG, 'image/png')).status).toBe(403)
    expect(signatures.put).not.toHaveBeenCalled()
  })
  it('DENY: a malformed user id from the login service gives 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'not-a-uuid' })))
    expect((await upload(`/api/signatures/${PID}/participant`, PNG, 'image/png')).status).toBe(401)
  })
})

describe('F4: POST /api/withdraw', () => {
  const withdraw = (body: unknown, token: string | null = VALID_TOKEN, method = 'POST') =>
    call('/api/withdraw', {
      method,
      body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    })

  it("ALLOW: admin withdraws; that participant's images are deleted from both buckets, others kept", async () => {
    signatures = fakeBucket([`${PID}/participant.png`, `${PID}/guardian.png`, `${OTHER}/participant.png`])
    photos = fakeBucket([`${PID}/front.jpg`])
    env = { ...env, SIGNATURES: signatures as unknown as R2Bucket, PHOTOS: photos as unknown as R2Bucket }
    withdrawResult = PID
    const res = await withdraw({ receipt: 'R7K-2MPQ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ withdrawn: true, filesDeleted: 3 })
    expect([...signatures.store]).toEqual([`${OTHER}/participant.png`])
    expect([...photos.store]).toEqual([])
  })

  it('unknown code gives 404 and deletes nothing', async () => {
    withdrawResult = null
    expect((await withdraw({ receipt: 'ZZZZZZZ' })).status).toBe(404)
    expect(signatures.delete).not.toHaveBeenCalled()
  })

  it('DENY: not an admin (database refuses) gives 403; no token or a bad token gives 401', async () => {
    withdrawResult = 403
    expect((await withdraw({ receipt: 'R7K2MPQ' })).status).toBe(403)
    expect((await withdraw({ receipt: 'R7K2MPQ' }, null)).status).toBe(401)
    expect((await withdraw({ receipt: 'R7K2MPQ' }, 'forged')).status).toBe(401)
    expect(signatures.delete).not.toHaveBeenCalled()
  })

  it('DENY: wrong method, bad JSON, missing or oversized receipt', async () => {
    expect((await withdraw(null, VALID_TOKEN, 'GET')).status).toBe(405)
    expect((await withdraw('{not json')).status).toBe(400)
    expect((await withdraw({})).status).toBe(400)
    expect((await withdraw({ receipt: 'X'.repeat(21) })).status).toBe(400)
    expect((await withdraw('x'.repeat(2000))).status).toBe(413)
  })

  it('a strange answer from the database deletes nothing', async () => {
    withdrawResult = 'not-a-uuid'
    expect((await withdraw({ receipt: 'R7K2MPQ' })).status).toBe(502)
    expect(signatures.delete).not.toHaveBeenCalled()
  })

  it('storage failing three times reports files_not_deleted with the id, so it can be cleaned up', async () => {
    withdrawResult = PID
    signatures.list.mockRejectedValue(new Error('r2 down'))
    const res = await withdraw({ receipt: 'R7K2MPQ' })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'files_not_deleted', participantId: PID })
    expect(signatures.list).toHaveBeenCalledTimes(3)
  })

  it('the database being unreachable gives 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    expect((await withdraw({ receipt: 'R7K2MPQ' })).status).toBe(502)
  })
})

describe('F4: practice files live under practice/', () => {
  it('a practice signature is stored under practice/<id>/', async () => {
    practiceIds.add(PID)
    const res = await upload(`/api/signatures/${PID}/participant`, PNG, 'image/png')
    expect(await res.json()).toEqual({ key: `practice/${PID}/participant.png` })
  })

  it('withdrawal clears both the real and the practice folder', async () => {
    signatures = fakeBucket([`practice/${PID}/participant.png`, `${PID}/guardian.png`])
    env = { ...env, SIGNATURES: signatures as unknown as R2Bucket }
    withdrawResult = PID
    expect(await (await call('/api/withdraw', { method: 'POST', body: JSON.stringify({ receipt: 'R7K2MPQ' }), headers: { authorization: `Bearer ${VALID_TOKEN}` } })).json()).toEqual({ withdrawn: true, filesDeleted: 2 })
    expect(signatures.store.size).toBe(0)
  })
})

describe('F4: DELETE /api/practice/<id>', () => {
  const del = (id = PID, token: string | null = VALID_TOKEN, method = 'DELETE') =>
    call(`/api/practice/${id}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} })

  it('ALLOW: owner deletes own practice participant: images first, then the row', async () => {
    practiceIds.add(PID)
    signatures = fakeBucket([`practice/${PID}/participant.png`, `practice/${OTHER}/participant.png`])
    env = { ...env, SIGNATURES: signatures as unknown as R2Bucket }
    const res = await del()
    expect(res.status).toBe(200)
    expect([...signatures.store]).toEqual([`practice/${OTHER}/participant.png`])
  })

  it('DENY: a real participant, someone else’s, no token, bad id, wrong method', async () => {
    expect((await del()).status).toBe(403) // PID is real
    practiceIds.add(PID)
    owners = { [PID]: OTHER }
    expect((await del()).status).toBe(403)
    expect((await del(PID, null)).status).toBe(401)
    expect((await del(PID, 'forged')).status).toBe(401)
    expect((await del('not-a-uuid')).status).toBe(404)
    expect((await del(PID, VALID_TOKEN, 'POST')).status).toBe(405)
    expect(signatures.delete).not.toHaveBeenCalled()
  })

  it('the database refusing the delete gives 403; storage failing gives 502 and keeps the row', async () => {
    practiceIds.add(PID)
    deletedRows = 0
    expect((await del()).status).toBe(403)
    signatures.list.mockRejectedValueOnce(new Error('r2 down'))
    expect((await del()).status).toBe(502)
  })
})
