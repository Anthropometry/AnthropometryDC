/**
 * F6 Amendment A: the real camera tools, self-hosted MediaPipe (runtime from npm in public/mediapipe/,
 * models in public/models/, Apache-2.0): the pose landmarker (lite) finds every person, and the face
 * detector finds faces. Downloaded once on first camera use (src/lib/cameraFiles.ts), then offline.
 * Never fetched from Google at run time. Browser-only; the logic it feeds is tested in src/lib.
 */
import type { CameraTools, PoseResult } from './lib/capture'
import type { Mask, Person } from './lib/pose'

export interface LoadedTools extends CameraTools {
  /** People in a live frame (no outline, for speed). */
  live: (canvas: HTMLCanvasElement) => Person[]
}

let loading: Promise<LoadedTools | null> | null = null

/** Monotonic timestamps: the pose model runs in video mode for both live checks and photos. */
let lastTs = 0
const ts = () => (lastTs = Math.max(lastTs + 1, Math.round(performance.now())))

export function loadCameraTools(): Promise<LoadedTools | null> {
  loading ??= (async () => {
    try {
      const vision = await import('@mediapipe/tasks-vision')
      const files = await vision.FilesetResolver.forVisionTasks('/mediapipe')
      const faceDetector = await vision.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.3,
      })
      const options = (masks: boolean) => ({
        baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'CPU' as const },
        runningMode: 'VIDEO' as const,
        numPoses: 5,
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
        outputSegmentationMasks: masks,
      })
      // Two small instances: live (no outline, fast) and photo (with the body outline).
      const livePose = await vision.PoseLandmarker.createFromOptions(files, options(false))
      const photoPose = await vision.PoseLandmarker.createFromOptions(files, options(true))

      const toPeople = (landmarks: { x: number; y: number }[][]): Person[] => landmarks.map((l) => l.map((p) => ({ x: p.x, y: p.y })))

      const tools: LoadedTools = {
        async pose(canvas): Promise<PoseResult> {
          const r = photoPose.detectForVideo(canvas, ts())
          const masks: (Mask | null)[] = r.landmarks.map((_, i) => {
            const m = r.segmentationMasks?.[i]
            if (!m) return null
            const copy: Mask = { data: m.getAsFloat32Array().slice(), width: m.width, height: m.height }
            return copy
          })
          r.segmentationMasks?.forEach((m) => m.close())
          return { people: toPeople(r.landmarks), masks }
        },
        async faces(canvas) {
          return faceDetector
            .detect(canvas)
            .detections.map((d) => d.boundingBox)
            .filter((b): b is NonNullable<typeof b> => !!b)
            .map((b) => ({ x: b.originX, y: b.originY, w: b.width, h: b.height }))
        },
        live(canvas) {
          return toPeople(livePose.detectForVideo(canvas, ts()).landmarks)
        },
      }
      return tools
    } catch {
      loading = null // try again next time (e.g. the files were not downloaded yet)
      return null
    }
  })()
  return loading
}
