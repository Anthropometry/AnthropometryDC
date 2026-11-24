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
  /** F6 Amendment A: can this browser run the camera tools (WebAssembly with SIMD)? */
  validateWasm?: (bytes: Uint8Array) => boolean
}

/**
 * The smallest WebAssembly module that uses a SIMD instruction: browsers that accept it can run
 * the camera tools (Chrome since 2021, Safari on iOS 16.4+). Same probe as the wasm-feature-detect
 * library.
 */
export const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])

export function supportsCameraTools(validate?: (bytes: Uint8Array) => boolean): boolean {
  try {
    return !!validate && validate(SIMD_PROBE)
  } catch {
    return false
  }
}

export interface PhoneCheckResult {
  phoneModel: string | null
  os: string | null
  browser: string | null
  cameraOk: boolean
  cameraResolution: string | null
  cameraProblem: 'denied' | 'none' | null
  motionOk: boolean
  /** F6 Amendment A: the camera tools can run, so this phone can take study photos. */
  photosOk: boolean
  storageOk: boolean
  storageMb: number | null
  passed: boolean
  checkedAt: string
}

const MIN_STORAGE_MB = 50

/**
 * A usable tilt reading. Phones with a gyroscope send orientation angles (beta/gamma); many
 * low-cost phones have only an accelerometer, which sends gravity. Either is enough to tell
 * whether the phone is upright, which is what F6's level lock needs.
 */
export function isTiltReading(e: {
  beta?: number | null
  gamma?: number | null
  accelerationIncludingGravity?: { x?: number | null; y?: number | null; z?: number | null } | null
}): boolean {
  const g = e.accelerationIncludingGravity
  const gravity = !!g && [g.x, g.y, g.z].some((v) => typeof v === 'number' && Number.isFinite(v) && v !== 0)
  const angles = [e.beta, e.gamma].some((v) => typeof v === 'number' && Number.isFinite(v))
  return gravity || angles
}

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
    photosOk: supportsCameraTools(env.validateWasm),
    storageOk,
    storageMb,
    passed: cameraOk && motionOk && storageOk && supportsCameraTools(env.validateWasm),
    checkedAt: now().toISOString(),
  }
}

/** Plain fix text for each failing line. */
export function fixFor(line: 'camera' | 'motion' | 'storage' | 'photos', r: PhoneCheckResult): string | null {
  if (line === 'photos' && !r.photosOk) {
    return 'This phone can’t take study photos: its browser is too old for the face blur. Update the browser (Chrome, or iOS 16.4 or newer) and check again, or use another phone for photos. Consent and measurements still work.'
  }
  if (line === 'camera' && !r.cameraOk) {
    return r.cameraProblem === 'denied'
      ? 'Allow the camera for this app (browser settings → Site settings → Camera), then check again.'
      : 'No working camera found. Use another phone for photos.'
  }
  if (line === 'motion' && !r.motionOk) {
    return 'No tilt reading. Allow Motion & Orientation if asked (Chrome: Site settings → Motion sensors → Allow), then check again. Without it, photos cannot be levelled.'
  }
  if (line === 'storage' && !r.storageOk) {
    return 'This phone cannot keep data offline. Free up space, and don’t use private browsing.'
  }
  return null
}
