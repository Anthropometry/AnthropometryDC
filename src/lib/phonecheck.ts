/**
 * F2 phone check (about 10 seconds): camera, motion sensor, offline storage, phone model.
 * The camera is opened only to read its resolution and is closed at once: no frame is kept.
 * Everything the browser provides comes in through CheckEnv, so it is easy to test.
 */

export interface TrackLike {
  getSettings(): { width?: number; height?: number }
  stop(): void
}
export interface StreamLike {
  getVideoTracks(): TrackLike[]
  getTracks(): TrackLike[]
}

export interface CheckEnv {
  getUserMedia?: (c: MediaStreamConstraints) => Promise<StreamLike>
  /** iPhone only: asks for motion permission (must run first, inside the tap). */
  requestMotionPermission?: () => Promise<string>
  /** Resolves true if a tilt reading arrives within `ms`. */
  waitForMotion?: (ms: number) => Promise<boolean>
  hasIndexedDB: boolean
  estimateStorage?: () => Promise<{ quota?: number }>
  userAgent: string
  highEntropy?: () => Promise<{ model?: string; platformVersion?: string; platform?: string }>
}

export interface PhoneCheckResult {
  phoneModel: string | null
  os: string | null
  browser: string | null
  cameraOk: boolean
  cameraResolution: string | null
  cameraProblem: 'denied' | 'none' | null
  motionOk: boolean
  storageOk: boolean
  storageMb: number | null
  passed: boolean
  checkedAt: string
}

const MIN_STORAGE_MB = 50

const clip = (s: string | null | undefined, max: number) => (s ? s.trim().slice(0, max) || null : null)

/** Phone model, OS and browser from what the browser tells us. iPhones give no model. */
export function describeDevice(
  ua: string,
  high?: { model?: string; platformVersion?: string; platform?: string },
): { phoneModel: string | null; os: string | null; browser: string | null } {
  let os: string | null = null
  let model: string | null = clip(high?.model, 80)
  const android = ua.match(/Android (\d+(?:\.\d+)?)/)
  const ios = ua.match(/(?:iPhone|CPU) OS (\d+)[_.](\d+)/)
  if (/iPhone/.test(ua) && ios) {
    os = `iOS ${ios[1]}.${ios[2]}`
    model = model ?? 'iPhone'
  } else if (/iPad/.test(ua) && ios) {
    os = `iPadOS ${ios[1]}.${ios[2]}`
    model = model ?? 'iPad'
  } else if (android) {
    const v = high?.platformVersion ? high.platformVersion.split('.')[0] : android[1]
    os = `Android ${v}`
    if (!model) {
      const m = ua.match(/Android [^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\)/)
      model = m && m[1] !== 'K' ? clip(m[1], 80) : null
    }
  } else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  return { phoneModel: model, os: clip(os, 40), browser: clip(browserOf(ua), 40) }
}

const BROWSERS: [RegExp, string][] = [
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/EdgA?\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/(?:CriOS|Chrome)\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari/, 'Safari'],
]

function browserOf(ua: string): string | null {
  for (const [re, name] of BROWSERS) {
    const m = ua.match(re)
    if (m) return `${name} ${m[1]}`
  }
  return null
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])
}

export async function runPhoneCheck(env: CheckEnv, now: () => Date = () => new Date()): Promise<PhoneCheckResult> {
  // 1. Motion permission first: iPhones only allow the prompt straight after the tap.
  let motionAllowed = true
  if (env.requestMotionPermission) {
    try {
      motionAllowed = (await env.requestMotionPermission()) === 'granted'
    } catch {
      motionAllowed = false
    }
  }

  // 2. Camera: open the back camera, read its size, close it. Nothing is drawn or saved.
  let cameraOk = false
  let cameraResolution: string | null = null
  let cameraProblem: PhoneCheckResult['cameraProblem'] = null
  if (!env.getUserMedia) cameraProblem = 'none'
  else {
    try {
      const stream = await withTimeout(
        env.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }),
        8000,
        null,
      )
      if (!stream) cameraProblem = 'none'
      else {
        const track = stream.getVideoTracks()[0]
        const { width, height } = track?.getSettings() ?? {}
        stream.getTracks().forEach((t) => t.stop())
        cameraOk = Boolean(track)
        if (!cameraOk) cameraProblem = 'none'
        if (width && height) cameraResolution = `${Math.round(width)}x${Math.round(height)}`
      }
    } catch (e) {
      cameraProblem = e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'none'
    }
  }

  // 3. Motion sensor: a tilt reading within 2 seconds.
  let motionOk = false
  if (motionAllowed && env.waitForMotion) {
    try {
      motionOk = await env.waitForMotion(2000)
    } catch {
      motionOk = false
    }
  }

  // 4. Storage for offline work.
  let storageMb: number | null = null
  if (env.estimateStorage) {
    try {
      const { quota } = await env.estimateStorage()
      if (typeof quota === 'number' && Number.isFinite(quota)) storageMb = Math.min(10_000_000, Math.floor(quota / 1_048_576))
    } catch {
      storageMb = null
    }
  }
  const storageOk = env.hasIndexedDB && (storageMb === null || storageMb >= MIN_STORAGE_MB)

  // 5. Phone model.
  let high: Awaited<ReturnType<NonNullable<CheckEnv['highEntropy']>>> | undefined
  try {
    high = env.highEntropy ? await env.highEntropy() : undefined
  } catch {
    high = undefined
  }
  const device = describeDevice(env.userAgent, high)

  return {
    ...device,
    cameraOk,
    cameraResolution,
    cameraProblem,
    motionOk,
    storageOk,
    storageMb,
    passed: cameraOk && motionOk && storageOk,
    checkedAt: now().toISOString(),
  }
}

/** Plain fix text for each failing line. */
export function fixFor(line: 'camera' | 'motion' | 'storage', r: PhoneCheckResult): string | null {
  if (line === 'camera' && !r.cameraOk) {
    return r.cameraProblem === 'denied'
      ? 'Allow the camera for this app (browser settings → Site settings → Camera), then check again.'
      : 'No working camera found. Use another phone for photos.'
  }
  if (line === 'motion' && !r.motionOk) {
    return 'No tilt reading. Allow Motion & Orientation if asked, then check again. Without it, photos cannot be levelled.'
  }
  if (line === 'storage' && !r.storageOk) {
    return 'This phone cannot keep data offline. Free up space, and don’t use private browsing.'
  }
  return null
}
