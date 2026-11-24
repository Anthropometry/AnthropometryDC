/**
 * F6: the only place a photo is made (specs/F6-camera.md with Amendment A, POLICY §10).
 * 1. The camera frame (its centred 3:4 area, digitally zoomed as on screen) is drawn onto an
 *    off-screen canvas.
 * 2. The pose model finds every person. No person, the participant not whole or too small, or
 *    someone else in the picture → the photo is refused (nothing is made).
 * 3. The top of the head and the heels are measured (from the body outline), before any blur.
 * 4. Blurred, all of: every person's whole head; every face the face detector finds anywhere in
 *    the frame (searched in overlapping tiles); the fixed face zone of the outline.
 * 5. Only then is a JPEG made, fresh from the canvas (no place, time or camera data).
 * 6. The canvas is emptied.
 * Fail closed: no camera tools, or any error in them → no photo. The result is registered as
 * blurred; the photo queue accepts nothing else. There is no switch to turn the blur off.
 */
import { boxesToBlur, enlarge, frameRect, mosaic, tiles, toFrame, type Box } from './blur'
import { checkFraming, headBox, headTopAndHeels, mainPerson, type FramingProblem, type Mask, type Person } from './pose'

export interface BlurredPhoto {
  readonly jpeg: Uint8Array
  readonly width: number
  readonly height: number
  readonly bytes: number
  readonly facesDetected: number
  readonly peopleDetected: number
  /** Top of the head and bottom of the heels, photo pixels, measured before the blur. */
  readonly headTopY: number
  readonly heelY: number
  /** 2 = Amendment A (whole-head blur from the pose model). */
  readonly blurVersion: 2
}

/** Finds faces in the given canvas; boxes in that canvas's pixels. */
export type Detector = (canvas: HTMLCanvasElement) => Promise<Box[]>

export interface PoseResult {
  /** Every person found, points as fractions of the canvas. */
  people: Person[]
  /** Body outline of each person (same order), where the model gives one. */
  masks: (Mask | null)[]
}

/** The camera tools (self-hosted MediaPipe): pose model and face detector. */
export interface CameraTools {
  pose: (canvas: HTMLCanvasElement) => Promise<PoseResult>
  faces: Detector
}

export type RefusalReason = FramingProblem | 'no_tools' | 'tools_failed'

/** The photo was not made; the collector is told why and retakes. */
export class CaptureRefused extends Error {
  constructor(readonly reason: RefusalReason) {
    super(`capture_refused:${reason}`)
    this.name = 'CaptureRefused'
  }
}

const minted = new WeakSet<object>()

/** True only for photos made by `capture` (blurred). */
export function isBlurred(p: unknown): p is BlurredPhoto {
  return typeof p === 'object' && p !== null && minted.has(p)
}

const MAX_SIDE = 1600
const MAX_BYTES = 4 * 1024 * 1024
const DETECT_SIZE = 256

function toJpeg(c: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('no_jpeg'))
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject)
      },
      'image/jpeg',
      quality,
    )
  })
}

/** Faces anywhere in the frame: each overlapping tile is enlarged for the detector, boxes mapped back. */
async function facesEverywhere(canvas: HTMLCanvasElement, detect: Detector): Promise<Box[]> {
  const found: Box[] = []
  const crop = document.createElement('canvas')
  crop.width = DETECT_SIZE
  crop.height = DETECT_SIZE
  const cctx = crop.getContext('2d')
  if (!cctx) throw new Error('no_canvas')
  try {
    for (const t of tiles(canvas.width, canvas.height)) {
      cctx.clearRect(0, 0, DETECT_SIZE, DETECT_SIZE)
      cctx.drawImage(canvas, t.x, t.y, t.w, t.h, 0, 0, DETECT_SIZE, DETECT_SIZE)
      for (const b of await detect(crop)) found.push(toFrame(b, t, DETECT_SIZE / t.w, DETECT_SIZE / t.h))
    }
  } finally {
    cctx.clearRect(0, 0, DETECT_SIZE, DETECT_SIZE)
    crop.width = 0
    crop.height = 0
  }
  return found
}

export async function capture(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  tools: CameraTools | null,
  zoom = 1,
): Promise<BlurredPhoto> {
  if (!tools) throw new CaptureRefused('no_tools')
  const f = frameRect(sourceWidth, sourceHeight, zoom)
  const scale = Math.min(1, MAX_SIDE / Math.max(f.w, f.h))
  const width = Math.round(f.w * scale)
  const height = Math.round(f.h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no_canvas')
  try {
    ctx.drawImage(source, f.x, f.y, f.w, f.h, 0, 0, width, height)

    // Who is in the picture (fail closed on any error).
    let pose: PoseResult
    try {
      pose = await tools.pose(canvas)
    } catch {
      throw new CaptureRefused('tools_failed')
    }
    const framing = checkFraming(pose.people, width, height)
    if (framing.problem) throw new CaptureRefused(framing.problem)
    const main = mainPerson(pose.people, width, height)!
    const marks = headTopAndHeels(main, pose.masks[pose.people.indexOf(main)] ?? null, width, height)
    if (!marks) throw new CaptureRefused('no_person')

    // Faces anywhere (fail closed on any error).
    let faces: Box[]
    try {
      faces = await facesEverywhere(canvas, tools.faces)
    } catch {
      throw new CaptureRefused('tools_failed')
    }

    // Blur: every head (whole), every face found (enlarged), the fixed face zone.
    const heads = pose.people.map((p) => headBox(p, width, height)).filter((b): b is Box => b !== null)
    const img = ctx.getImageData(0, 0, width, height)
    for (const box of [...heads.map((h) => enlarge(h, 1.15, width, height)), ...boxesToBlur(faces, width, height)]) mosaic(img, box)
    ctx.putImageData(img, 0, 0)

    // Only now a file, fresh from the canvas (no EXIF), at most 4 MB.
    let jpeg = await toJpeg(canvas, 0.85)
    for (const q of [0.75, 0.6, 0.45]) {
      if (jpeg.length <= MAX_BYTES) break
      jpeg = await toJpeg(canvas, q)
    }
    if (jpeg.length > MAX_BYTES) throw new Error('too_large')

    const photo: BlurredPhoto = Object.freeze({
      jpeg,
      width,
      height,
      bytes: jpeg.length,
      facesDetected: faces.length,
      peopleDetected: pose.people.length,
      headTopY: marks.headTopY,
      heelY: marks.heelY,
      blurVersion: 2 as const,
    })
    minted.add(photo)
    return photo
  } finally {
    // Nothing of the frame is kept.
    ctx.clearRect(0, 0, width, height)
    canvas.width = 0
    canvas.height = 0
  }
}
