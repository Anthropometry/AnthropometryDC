/**
 * F6 real browser pieces for the camera screen: back camera, motion sensor, capture with the face
 * detector. Kept apart from the screen so it is tested with fakes; this file is checked on phones
 * (spec phone test script).
 */
import { capture, type BlurredPhoto } from './lib/capture'
import { loadDetector } from './lib/faceDetector'
import { tiltFromGravity, tiltFromOrientation, type Tilt } from './lib/level'

export interface CameraEnv {
  /** Ask for the motion sensor (iPhone needs a tap first) and the back camera into the video. Returns stop. */
  start: (video: HTMLVideoElement) => Promise<() => void>
  /** Tilt readings until the returned function is called. */
  watchTilt: (cb: (t: Tilt | null) => void) => () => void
  /** The frame now, blurred (face detector + fixed face zone) before any file exists. */
  grab: (video: HTMLVideoElement, zoom: number) => Promise<BlurredPhoto>
  now: () => number
  phoneModel: string | null
}

type WithPermission = { requestPermission?: () => Promise<string> }

export function browserCameraEnv(): CameraEnv {
  return {
    async start(video) {
      // iPhone: motion permission must be asked inside the tap, before anything else waits.
      const O = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as WithPermission | undefined
      const M = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as WithPermission | undefined
      const asks = [O?.requestPermission?.(), M?.requestPermission?.()].filter(Boolean)
      await Promise.all(asks.map((p) => p!.catch(() => 'denied')))
      void loadDetector() // start loading while the camera opens
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
      // Light smoothing: hand shake alone should not break the ±1° lock, a real tilt still shows in ~0.2 s.
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
    async grab(video, zoom) {
      return capture(video, video.videoWidth, video.videoHeight, await loadDetector(), zoom)
    },
    now: () => Date.now(),
    phoneModel: null,
  }
}
