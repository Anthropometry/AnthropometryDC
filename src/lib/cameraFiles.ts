/**
 * F6 Amendment A: the camera tools (MediaPipe runtime and two models, about 18 MB) are not part of
 * the install. They are downloaded once, the first time the collector opens the camera, into a cache
 * the service worker serves them from, so the camera then works offline (Ryan, 12 Nov: collectors use
 * their own phones and mobile data).
 */

/** Bump when the MediaPipe version or a model changes, so phones fetch the new files. */
export const CAMERA_CACHE = 'camera-tools-0.10.35-v1'

/** Self-hosted files (never fetched from Google at run time). */
export const CAMERA_FILES = [
  '/mediapipe/vision_wasm_internal.js',
  '/mediapipe/vision_wasm_internal.wasm',
  '/models/blaze_face_short_range.tflite',
  '/models/pose_landmarker_lite.task',
] as const

/** Shown while downloading (one time). */
export const CAMERA_DOWNLOAD_MB = 18

export interface CacheLike {
  match: (url: string) => Promise<unknown>
  put: (url: string, res: Response) => Promise<void>
}

export type PrepareResult = 'ready' | 'no_signal' | 'unsupported'

/**
 * Make sure every camera file is on the phone. Already there → 'ready' with no download.
 * No signal (or the server refuses) → 'no_signal'; files already saved are kept for next time.
 */
export async function prepareCameraFiles(
  supported: boolean,
  openCache: (() => Promise<CacheLike>) | null,
  fetchFn: (url: string) => Promise<Response>,
  onProgress: (done: number, total: number) => void = () => undefined,
): Promise<PrepareResult> {
  if (!supported) return 'unsupported'
  // No Cache API (very old browser, or a private window): the files are fetched when needed.
  if (!openCache) return 'ready'
  let cache: CacheLike
  try {
    cache = await openCache()
  } catch {
    return 'ready'
  }
  let done = 0
  onProgress(done, CAMERA_FILES.length)
  for (const url of CAMERA_FILES) {
    if (!(await cache.match(url))) {
      try {
        const res = await fetchFn(url)
        if (!res.ok) return 'no_signal'
        await cache.put(url, res)
      } catch {
        return 'no_signal'
      }
    }
    onProgress(++done, CAMERA_FILES.length)
  }
  return 'ready'
}
