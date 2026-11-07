/**
 * The real browser pieces the phone check needs (F2). Kept apart from src/lib so the logic there
 * is tested with fakes; this file is checked on phones (spec phone test script).
 */
import type { CheckEnv, StreamLike } from './lib/phonecheck'

type OrientationWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
type NavigatorWithUAData = Navigator & {
  userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ model?: string; platformVersion?: string; platform?: string }> }
}

export function browserCheckEnv(): CheckEnv {
  const nav = navigator as NavigatorWithUAData
  const Orientation = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as
    | OrientationWithPermission
    | undefined
  return {
    getUserMedia: nav.mediaDevices?.getUserMedia
      ? (c) => nav.mediaDevices.getUserMedia(c) as Promise<StreamLike>
      : undefined,
    requestMotionPermission:
      Orientation && typeof Orientation.requestPermission === 'function'
        ? () => Orientation.requestPermission!()
        : undefined,
    waitForMotion: Orientation
      ? (ms) =>
          new Promise<boolean>((resolve) => {
            const onTilt = (e: DeviceOrientationEvent) => {
              if (e.beta !== null || e.gamma !== null) finish(true)
            }
            const timer = setTimeout(() => finish(false), ms)
            function finish(ok: boolean) {
              clearTimeout(timer)
              window.removeEventListener('deviceorientation', onTilt)
              resolve(ok)
            }
            window.addEventListener('deviceorientation', onTilt)
          })
      : undefined,
    hasIndexedDB: (() => {
      try {
        return typeof indexedDB !== 'undefined' && indexedDB !== null
      } catch {
        return false
      }
    })(),
    estimateStorage: nav.storage?.estimate ? () => nav.storage.estimate() : undefined,
    userAgent: nav.userAgent,
    highEntropy: nav.userAgentData
      ? () => nav.userAgentData!.getHighEntropyValues(['model', 'platformVersion', 'platform'])
      : undefined,
  }
}
