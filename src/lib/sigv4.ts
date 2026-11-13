/**
 * F8 export: signs a read request to Cloudflare R2 (S3-compatible) with AWS Signature Version 4, so
 * the export script can download photos with Ryan's read-only R2 key. Written here (Web Crypto, no new
 * library; POLICY §13). Only GET of a single object is needed.
 */

const enc = new TextEncoder()

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data
  const h = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)))
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

/** S3 path encoding: every byte except unreserved characters and "/". */
export function encodePath(path: string): string {
  return path
    .split('/')
    .map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/')
}

export interface SignInput {
  method: 'GET'
  host: string
  path: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  /** e.g. 20130524T000000Z */
  amzDate: string
  /** Extra headers to sign (lower-case names). */
  headers?: Record<string, string>
}

/** The headers to send, including Authorization. */
export async function signGet(i: SignInput): Promise<Record<string, string>> {
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' // empty body
  const all: Record<string, string> = { host: i.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': i.amzDate, ...(i.headers ?? {}) }
  const names = Object.keys(all)
    .map((n) => n.toLowerCase())
    .sort()
  const canonicalHeaders = names.map((n) => `${n}:${String(all[n]).trim()}\n`).join('')
  const signedHeaders = names.join(';')
  const canonical = [i.method, encodePath(i.path), '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const day = i.amzDate.slice(0, 8)
  const scope = `${day}/${i.region}/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', i.amzDate, scope, await sha256Hex(canonical)].join('\n')
  let k = await hmac(enc.encode(`AWS4${i.secretAccessKey}`), day)
  k = await hmac(k, i.region)
  k = await hmac(k, 's3')
  k = await hmac(k, 'aws4_request')
  const signature = hex(await hmac(k, toSign))
  const { host: _host, ...send } = all
  void _host
  return { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` }
}

/** 20261113T090000Z from a date. */
export function amzDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}
