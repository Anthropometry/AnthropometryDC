/**
 * F6: the MediaPipe face detector, self-hosted (public/mediapipe/ runtime from npm via
 * scripts/copy-mediapipe.mjs, public/models/blaze_face_short_range.tflite from Google's MediaPipe
 * model storage, Apache-2.0). Loaded only when the camera opens, and never from the internet at run
 * time. If it can't load (very old phone), photos are still blurred by the fixed face zone.
 */
import type { Detector } from './capture'

let loading: Promise<Detector | null> | null = null

export function loadDetector(): Promise<Detector | null> {
  loading ??= (async () => {
    try {
      const vision = await import('@mediapipe/tasks-vision')
      const files = await vision.FilesetResolver.forVisionTasks('/mediapipe')
      const detector = await vision.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.3,
      })
      const detect: Detector = async (canvas) =>
        detector
          .detect(canvas)
          .detections.map((d) => d.boundingBox)
          .filter((b): b is NonNullable<typeof b> => !!b)
          .map((b) => ({ x: b.originX, y: b.originY, w: b.width, h: b.height }))
      return detect
    } catch {
      return null
    }
  })()
  return loading
}
