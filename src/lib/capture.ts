/**
 * F6: the only place a photo is made (specs/F6-camera.md, POLICY §10).
 * 1. The camera frame (its centred 3:4 area, digitally zoomed as on screen) is drawn onto an
 *    off-screen canvas.
 * 2. The detector looks for faces around the guide's head; every face found, plus the fixed face
 *    zone (always), is turned into a coarse mosaic.
 * 3. Only then is a JPEG made, fresh from the canvas (so no EXIF: no place, time or camera data).
 * 4. The canvas is emptied.
 * The result is registered as blurred; the photo queue accepts nothing else, so an unblurred frame
 * can never reach storage. There is no switch to turn the blur off.
 */
import { boxesToBlur, detectArea, frameRect, mosaic, toFrame, type Box } from './blur'

export interface BlurredPhoto {
  readonly jpeg: Uint8Array
  readonly width: number
  readonly height: number
  readonly bytes: number
  readonly facesDetected: number
}

/** Finds faces in the given canvas; boxes in that canvas's pixels. */
export type Detector = (canvas: HTMLCanvasElement) => Promise<Box[]>

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

export async function capture(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  detect: Detector | null,
  zoom = 1,
): Promise<BlurredPhoto> {
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

    // Faces around the guide's head, made large enough for the detector.
    let found: Box[] = []
    if (detect) {
      const area = detectArea(width, height)
      const crop = document.createElement('canvas')
      crop.width = DETECT_SIZE
      crop.height = DETECT_SIZE
      const cctx = crop.getContext('2d')
      if (cctx && area.w > 0 && area.h > 0) {
        cctx.drawImage(canvas, area.x, area.y, area.w, area.h, 0, 0, DETECT_SIZE, DETECT_SIZE)
        const sx = DETECT_SIZE / area.w
        const sy = DETECT_SIZE / area.h
        found = (await detect(crop).catch(() => [])).map((b) => toFrame(b, area, sx, sy))
      }
      crop.width = 0
      crop.height = 0
    }

    // Blur: detected faces (enlarged) + the fixed face zone, always.
    const img = ctx.getImageData(0, 0, width, height)
    for (const box of boxesToBlur(found, width, height)) mosaic(img, box)
    ctx.putImageData(img, 0, 0)

    // Only now a file, fresh from the canvas (no EXIF), at most 4 MB.
    let jpeg = await toJpeg(canvas, 0.85)
    for (const q of [0.75, 0.6, 0.45]) {
      if (jpeg.length <= MAX_BYTES) break
      jpeg = await toJpeg(canvas, q)
    }
    if (jpeg.length > MAX_BYTES) throw new Error('too_large')

    const photo: BlurredPhoto = Object.freeze({ jpeg, width, height, bytes: jpeg.length, facesDetected: found.length })
    minted.add(photo)
    return photo
  } finally {
    // Nothing of the frame is kept.
    ctx.clearRect(0, 0, width, height)
    canvas.width = 0
    canvas.height = 0
  }
}
