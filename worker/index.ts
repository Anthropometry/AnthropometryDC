/**
 * Anthro Collect Worker (Ashesi University student research project).
 * Serves the PWA from static assets; this code runs only for /api/*.
 *
 * Every upload re-checks, in order: route and slot, login token, participant
 * ownership (via Supabase row-level security), content type, size, and file magic bytes.
 * Any failed check denies. Nothing about the person or the image is logged.
 * POST /api/login (phone + PIN with per-account lockout) lives in login.ts.
 * POST /api/withdraw (admin): the database deletes the participant (it checks admin rights itself),
 * then this removes that participant's images from both private buckets (F4).
 * DELETE /api/practice/<id> (owner): removes a practice participant's images, then the participant.
 * Practice images live under `practice/<id>/…` so they can all be cleared at Gate B (docs/ADMIN.md).
 */

import { handleLogin } from './login'

export interface Env {
  PHOTOS: R2Bucket
  SIGNATURES: R2Bucket
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  /** Secret (wrangler secret put). Only touches PIN-lockout counters; not the Supabase secret key. */
  LOGIN_GUARD_SECRET?: string
}

type Kind = 'photos' | 'signatures'

interface UploadRule {
  slots: readonly string[]
  contentType: string
  ext: string
  maxBytes: number
  magic: readonly number[]
  bucket: (env: Env) => R2Bucket
}

export const UPLOAD_RULES: Record<Kind, UploadRule> = {
  photos: {
    slots: ['front', 'side', 'back'],
    contentType: 'image/jpeg',
    ext: 'jpg',
    maxBytes: 4 * 1024 * 1024,
    magic: [0xff, 0xd8, 0xff],
    bucket: (env) => env.PHOTOS,
  },
  signatures: {
    slots: ['participant', 'guardian', 'assent'],
    contentType: 'image/png',
    ext: 'png',
    maxBytes: 512 * 1024,
    magic: [0x89, 0x50, 0x4e, 0x47],
    bucket: (env) => env.SIGNATURES,
  },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

/** Returns the Supabase user id for a valid access token, or null. */
async function getUserId(env: Env, token: string): Promise<string | null> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { id?: unknown }
  return typeof user.id === 'string' ? user.id : null
}

/**
 * True only if this collector owns the participant. Row-level security alone is not enough:
 * admins may read every participant for oversight, but may upload only to their own (F4).
 */
async function ownedParticipant(
  env: Env,
  token: string,
  participantId: string,
  userId: string,
): Promise<{ isPractice: boolean } | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/participants?id=eq.${participantId}&collector_id=eq.${userId}&select=id,is_practice`
  const res = await fetch(url, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const rows = (await res.json()) as unknown
  if (!Array.isArray(rows) || rows.length !== 1) return null
  return { isPractice: (rows[0] as { is_practice?: unknown }).is_practice === true }
}

/** Where a participant's files live: practice ones under practice/, so Gate B can clear them in one go. */
export const folderFor = (participantId: string, isPractice: boolean) =>
  isPractice ? `practice/${participantId}/` : `${participantId}/`

async function handleUpload(
  request: Request,
  env: Env,
  kind: Kind,
  participantId: string,
  slot: string,
): Promise<Response> {
  const rule = UPLOAD_RULES[kind]
  if (!UUID.test(participantId) || !rule.slots.includes(slot)) {
    return json(404, { error: 'not_found' })
  }

  const token = bearer(request)
  if (!token) return json(401, { error: 'unauthorized' })

  const userId = await getUserId(env, token).catch(() => null)
  if (!userId) return json(401, { error: 'unauthorized' })

  if (!UUID.test(userId)) return json(401, { error: 'unauthorized' })
  const owned = await ownedParticipant(env, token, participantId, userId).catch(() => null)
  if (!owned) return json(403, { error: 'forbidden' })

  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== rule.contentType) return json(415, { error: 'unsupported_type' })

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > rule.maxBytes) return json(413, { error: 'too_large' })

  const body = new Uint8Array(await request.arrayBuffer())
  if (body.byteLength === 0) return json(400, { error: 'empty' })
  if (body.byteLength > rule.maxBytes) return json(413, { error: 'too_large' })
  if (!rule.magic.every((b, i) => body[i] === b)) return json(415, { error: 'unsupported_type' })

  // Fixed key per slot: a retried upload overwrites instead of duplicating.
  const key = `${folderFor(participantId, owned.isPractice)}${slot}.${rule.ext}`
  await rule.bucket(env).put(key, body, {
    httpMetadata: { contentType: rule.contentType },
    customMetadata: { uploadedBy: userId, uploadedAt: new Date().toISOString() },
  })
  return json(201, { key })
}

const bearer = (request: Request) => {
  const auth = request.headers.get('authorization') ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
}

/** Deletes every object under `<participant id>/` in one bucket. Returns how many were deleted. */
async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<number> {
  let deleted = 0
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor })
    const keys = page.objects.map((o) => o.key)
    if (keys.length) await bucket.delete(keys)
    deleted += keys.length
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return deleted
}

async function handleWithdraw(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const token = bearer(request)
  if (!token) return json(401, { error: 'unauthorized' })
  const raw = await request.text()
  if (raw.length > 1024) return json(413, { error: 'too_large' })
  let receipt: unknown
  try {
    receipt = (JSON.parse(raw) as { receipt?: unknown }).receipt
  } catch {
    return json(400, { error: 'bad_request' })
  }
  if (typeof receipt !== 'string' || receipt.length > 20) return json(400, { error: 'bad_request' })

  // The database decides whether this login is an approved admin.
  let res: Response
  try {
    res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/admin_withdraw`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_receipt: receipt }),
    })
  } catch {
    return json(502, { error: 'upstream' })
  }
  if (res.status === 401) return json(401, { error: 'unauthorized' })
  if (!res.ok) return json(403, { error: 'forbidden' })
  const id = (await res.json().catch(() => null)) as unknown
  if (id === null) return json(404, { error: 'not_found' })
  if (typeof id !== 'string' || !UUID.test(id)) return json(502, { error: 'upstream' })

  // Database rows are gone; now the images. Retry a little before giving up.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let files = 0
      for (const bucket of [env.SIGNATURES, env.PHOTOS]) {
        for (const prefix of [folderFor(id, false), folderFor(id, true)]) files += await deletePrefix(bucket, prefix)
      }
      return json(200, { withdrawn: true, filesDeleted: files })
    } catch {
      // try again
    }
  }
  return json(502, { error: 'files_not_deleted', participantId: id })
}

/** A collector deletes their own practice participant: images first, then the database row. */
async function handlePracticeDelete(request: Request, env: Env, participantId: string): Promise<Response> {
  if (request.method !== 'DELETE') return json(405, { error: 'method_not_allowed' })
  if (!UUID.test(participantId)) return json(404, { error: 'not_found' })
  const token = bearer(request)
  if (!token) return json(401, { error: 'unauthorized' })
  const userId = await getUserId(env, token).catch(() => null)
  if (!userId || !UUID.test(userId)) return json(401, { error: 'unauthorized' })
  const owned = await ownedParticipant(env, token, participantId, userId).catch(() => null)
  if (!owned || !owned.isPractice) return json(403, { error: 'forbidden' })
  try {
    for (const bucket of [env.SIGNATURES, env.PHOTOS]) await deletePrefix(bucket, folderFor(participantId, true))
  } catch {
    return json(502, { error: 'files_not_deleted' })
  }
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/participants?id=eq.${participantId}&is_practice=eq.true`,
    {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${token}`,
        prefer: 'return=representation',
      },
    },
  ).catch(() => null)
  if (!res?.ok) return json(502, { error: 'upstream' })
  const rows = (await res.json().catch(() => [])) as unknown
  return Array.isArray(rows) && rows.length === 1 ? json(200, { deleted: true }) : json(403, { error: 'forbidden' })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname === '/api/health') {
      return request.method === 'GET'
        ? json(200, { ok: true })
        : json(405, { error: 'method_not_allowed' })
    }

    if (pathname === '/api/login') return handleLogin(request, env)
    if (pathname === '/api/withdraw') return handleWithdraw(request, env)
    const practice = pathname.match(/^\/api\/practice\/([^/]+)$/)
    if (practice) return handlePracticeDelete(request, env, practice[1])

    const m = pathname.match(/^\/api\/(photos|signatures)\/([^/]+)\/([^/]+)$/)
    if (m) {
      if (request.method !== 'PUT') return json(405, { error: 'method_not_allowed' })
      return handleUpload(request, env, m[1] as Kind, m[2], m[3])
    }

    return json(404, { error: 'not_found' })
  },
} satisfies ExportedHandler<Env>
