/**
 * F6 real browser pieces for the camera screen: camera tools download, back camera, motion sensor,
 * live body check, capture. Kept apart from the screen so it is tested with fakes; this file is checked
 * on phones (spec phone test script).
 */
import { capture, type BlurredPhoto } from './lib/capture'
import { frameRect } from './lib/blur'
import { CAMERA_CACHE, prepareCameraFiles, type PrepareResult } from './lib/cameraFiles'
import { tiltFromGravity, tiltFromOrientation, type Tilt } from './lib/level'
import { checkFraming, type Framing } from './lib/pose'
import { supportsCameraTools } from './lib/phonecheck'
import { loadCameraTools } from './cameraTools'

export interface CameraEnv {
  /** One-time download of the camera tools (about 18 MB); 'ready' at once when already on the phone. */
  prepare: (onProgress: (done: number, total: number) => void) => Promise<PrepareResult>
  /** Ask for the motion sensor (iPhone needs a tap first) and the back camera into the video. Returns stop. */
  start: (video: HTMLVideoElement) => Promise<() => void>
  /** Tilt readings until the returned function is called. */
  watchTilt: (cb: (t: Tilt | null) => void) => () => void
  /**
   * About 4 times a second, whether the whole participant is in the live picture. `null` = slow
   * phone: no live checks; the photo itself is still checked (slow mode, spec Amendment A).
   */
  watchBody: (video: HTMLVideoElement, zoom: () => number, cb: (f: Framing | null) => void) => () => void
  /** The frame now: checked, measured and blurred before any file exists (throws CaptureRefused). */
  grab: (video: HTMLVideoElement, zoom: number) => Promise<BlurredPhoto>
  now: () => number
  phoneModel: string | null
}

type WithPermission = { requestPermission?: () => Promise<string> }

const LIVE_W = 240
const LIVE_H = 320
const LIVE_EVERY_MS = 250
/** Slower than this on average → slow mode (no live checks). */
const SLOW_MS = 500

export function browserCameraEnv(): CameraEnv {
  return {
    prepare(onProgress) {
      const supported = supportsCameraTools(typeof WebAssembly !== 'undefined' ? (b) => WebAssembly.validate(b as BufferSource) : undefined)
      const openCache = typeof caches !== 'undefined' ? () => caches.open(CAMERA_CACHE) : null
      return prepareCameraFiles(supported, openCache, (u) => fetch(u, { cache: 'no-store' }), onProgress)
    },
    async start(video) {
      // iPhone: motion permission must be asked inside the tap, before anything else waits.
      const O = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as WithPermission | undefined
      const M = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as WithPermission | undefined
      const asks = [O?.requestPermission?.(), M?.requestPermission?.()].filter(Boolean)
      await Promise.all(asks.map((p) => p!.catch(() => 'denied')))
      void loadCameraTools() // start loading while the camera opens
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 } },
      })
      video.srcObject = stream
      video.muted = true
      video.setAttribute('playsinline', '')
      await video.play().catch(() => undefined)
      return () => {
        stream.getTracks().forEach((t) => t.stop())
        video.srcObject = null
      }
    },
    watchTilt(cb) {
      // Prefer gravity (stable when upright); fall back to the orientation angles if a phone gives no gravity.
      // Light smoothing: hand shake alone should not break the lock, a real tilt still shows in ~0.2 s.
      let lastMotion = 0
      let s: { x: number; y: number; z: number } | null = null
      const onMotion = (e: DeviceMotionEvent) => {
        const g = e.accelerationIncludingGravity
        if (!g || g.x === null || g.y === null || g.z === null) return
        lastMotion = Date.now()
        const k = 0.3
        s = s && Math.sign(s.y) === Math.sign(g.y) ? { x: s.x + k * (g.x - s.x), y: s.y + k * (g.y - s.y), z: s.z + k * (g.z - s.z) } : { x: g.x, y: g.y, z: g.z }
        cb(tiltFromGravity(s))
      }
      const onOrientation = (e: DeviceOrientationEvent) => {
        if (Date.now() - lastMotion < 500) return
        cb(tiltFromOrientation(e.beta, e.gamma))
      }
      window.addEventListener('deviceorientation', onOrientation)
      window.addEventListener('devicemotion', onMotion)
      return () => {
        window.removeEventListener('deviceorientation', onOrientation)
        window.removeEventListener('devicemotion', onMotion)
      }
    },
    watchBody(video, zoom, cb) {
      let stopped = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const took: number[] = []
      const canvas = document.createElement('canvas')
      canvas.width = LIVE_W
      canvas.height = LIVE_H
      const ctx = canvas.getContext('2d')
      const tick = async () => {
        if (stopped) return
        const tools = await loadCameraTools()
        if (stopped) return
        if (!tools || !ctx || !video.videoWidth) {
          timer = setTimeout(() => void tick(), LIVE_EVERY_MS)
          return
        }
        const t0 = performance.now()
        const f = frameRect(video.videoWidth, video.videoHeight, zoom())
        ctx.drawImage(video, f.x, f.y, f.w, f.h, 0, 0, LIVE_W, LIVE_H)
        let framing: Framing | null
        try {
          framing = checkFraming(tools.live(canvas), LIVE_W, LIVE_H)
        } catch {
          framing = checkFraming([], LIVE_W, LIVE_H) // treated as "can't see the person"
        }
        ctx.clearRect(0, 0, LIVE_W, LIVE_H)
        took.push(performance.now() - t0)
        if (took.length > 3) took.shift()
        if (took.length === 3 && took.reduce((a, b) => a + b, 0) / 3 > SLOW_MS) {
          cb(null) // slow phone: the photo is checked after it is taken instead
          return
        }
        cb(framing)
        timer = setTimeout(() => void tick(), LIVE_EVERY_MS)
      }
      void tick()
      return () => {
        stopped = true
        clearTimeout(timer)
        canvas.width = 0
        canvas.height = 0
      }
    },
    async grab(video, zoom) {
      return capture(video, video.videoWidth, video.videoHeight, await loadCameraTools(), zoom)
    },
    now: () => Date.now(),
    phoneModel: null,
  }
}
