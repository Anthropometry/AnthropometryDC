/**
 * Anthro Collect Worker (Ashesi University student research project).
 * Serves the PWA from static assets; this code runs only for /api/*.
 *
 * Every upload re-checks, in order: route and slot, login token, participant
 * ownership (via Supabase row-level security), content type, size, and file magic bytes.
 * Any failed check denies. Nothing about the person or the image is logged.
 * POST /api/login (phone + PIN with per-account lockout) lives in login.ts.
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

/** True only if row-level security lets this collector see the participant. */
async function ownsParticipant(env: Env, token: string, participantId: string): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/participants?id=eq.${participantId}&select=id`
  const res = await fetch(url, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
  })
  if (!res.ok) return false
  const rows = (await res.json()) as unknown
  return Array.isArray(rows) && rows.length === 1
}

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

  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return json(401, { error: 'unauthorized' })

  const userId = await getUserId(env, token).catch(() => null)
  if (!userId) return json(401, { error: 'unauthorized' })

  const owns = await ownsParticipant(env, token, participantId).catch(() => false)
  if (!owns) return json(403, { error: 'forbidden' })

  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== rule.contentType) return json(415, { error: 'unsupported_type' })

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > rule.maxBytes) return json(413, { error: 'too_large' })

  const body = new Uint8Array(await request.arrayBuffer())
  if (body.byteLength === 0) return json(400, { error: 'empty' })
  if (body.byteLength > rule.maxBytes) return json(413, { error: 'too_large' })
  if (!rule.magic.every((b, i) => body[i] === b)) return json(415, { error: 'unsupported_type' })

  // Fixed key per slot: a retried upload overwrites instead of duplicating.
  const key = `${participantId}/${slot}.${rule.ext}`
  await rule.bucket(env).put(key, body, {
    httpMetadata: { contentType: rule.contentType },
    customMetadata: { uploadedBy: userId, uploadedAt: new Date().toISOString() },
  })
  return json(201, { key })
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

    const m = pathname.match(/^\/api\/(photos|signatures)\/([^/]+)\/([^/]+)$/)
    if (m) {
      if (request.method !== 'PUT') return json(405, { error: 'method_not_allowed' })
      return handleUpload(request, env, m[1] as Kind, m[2], m[3])
    }

    return json(404, { error: 'not_found' })
  },
} satisfies ExportedHandler<Env>
