import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './index'

const PID = '11111111-2222-4333-8444-555555555555'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function fakeBucket() {
  return { put: vi.fn(async () => ({})) }
}
type FakeBucket = ReturnType<typeof fakeBucket>

let photos: FakeBucket
let signatures: FakeBucket
let env: Env
let ownedIds: string[]
const VALID_TOKEN = 'good-token'

beforeEach(() => {
  photos = fakeBucket()
  signatures = fakeBucket()
  env = {
    PHOTOS: photos as unknown as R2Bucket,
    SIGNATURES: signatures as unknown as R2Bucket,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  }
  ownedIds = [PID]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const ok = new Headers(init?.headers).get('authorization') === `Bearer ${VALID_TOKEN}`
      if (input.endsWith('/auth/v1/user')) {
        return ok ? Response.json({ id: 'collector-a' }) : new Response('{}', { status: 401 })
      }
      if (input.includes('/rest/v1/participants')) {
        const id = new URL(input).searchParams.get('id')?.replace('eq.', '')
        return Response.json(ok && id && ownedIds.includes(id) ? [{ id }] : [])
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
    ownedIds = []
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
