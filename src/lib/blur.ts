/**
 * F6 face blur (specs/F6-camera.md), the pure parts: where to blur and how. Two layers, always:
 *  1. every face the detector finds, its box enlarged;
 *  2. the fixed face zone where the face must be inside the pose guide, whatever the detector says.
 * The blur is a coarse mosaic (large blocks, each one flat colour): a face can't be recognised,
 * and it can't be undone. The outline of the top of the head stays (Ryan, 11 Nov: face only).
 */

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type Pose = 'front' | 'side' | 'back'

/**
 * Where the head must be in the frame when the person fits the pose guide, as fractions of the
 * frame (the guide draws the same shape): head centre at 50% across, 9% down; head about 11% of
 * the frame height (head to heel fills about 88% of it).
 */
export const GUIDE_HEAD = { cx: 0.5, cy: 0.09, size: 0.11 }

/** Every photo is 3:4 portrait, whatever the camera gives (the guide is drawn on this frame). */
export const FRAME_ASPECT = 3 / 4
export const ZOOM = { min: 1, max: 4, step: 0.1 }

/**
 * The part of the camera image that becomes the photo: the centred 3:4 area, then the centre
 * 1/zoom of it (digital zoom, so the person fills the guide from 2.5–3 m without walking closer;
 * the perspective stays that of the real distance). The screen shows exactly this area.
 */
export function frameRect(sourceWidth: number, sourceHeight: number, zoom = 1): Box {
  const z = Math.min(ZOOM.max, Math.max(ZOOM.min, zoom))
  const base = sourceWidth / sourceHeight > FRAME_ASPECT ? { w: sourceHeight * FRAME_ASPECT, h: sourceHeight } : { w: sourceWidth, h: sourceWidth / FRAME_ASPECT }
  const w = base.w / z
  const h = base.h / z
  return { x: (sourceWidth - w) / 2, y: (sourceHeight - h) / 2, w, h }
}

export function clampBox(b: Box, width: number, height: number): Box {
  const x = Math.max(0, Math.floor(b.x))
  const y = Math.max(0, Math.floor(b.y))
  const w = Math.max(0, Math.min(width, Math.ceil(b.x + b.w)) - x)
  const h = Math.max(0, Math.min(height, Math.ceil(b.y + b.h)) - y)
  return { x, y, w, h }
}

/** Enlarge around the centre (e.g. 1.4 = 40% bigger), kept inside the frame. */
export function enlarge(b: Box, factor: number, width: number, height: number): Box {
  const w = b.w * factor
  const h = b.h * factor
  return clampBox({ x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h }, width, height)
}

/**
 * The fixed face zone: the face part of the guide's head (from 20% below the top of the head down
 * past the chin), generous sideways for a little sway. The top of the head stays visible.
 */
export function faceZone(width: number, height: number): Box {
  const size = GUIDE_HEAD.size * height
  const top = GUIDE_HEAD.cy * height - size / 2
  return clampBox({ x: GUIDE_HEAD.cx * width - size * 0.9, y: top + size * 0.2, w: size * 1.8, h: size * 1.1 }, width, height)
}

/** The area given to the detector: around the guide's head, big enough that the face looks large. */
export function detectArea(width: number, height: number): Box {
  const size = GUIDE_HEAD.size * height
  return clampBox({ x: GUIDE_HEAD.cx * width - size * 1.6, y: GUIDE_HEAD.cy * height - size * 1.6, w: size * 3.2, h: size * 3.2 }, width, height)
}

/**
 * Amendment A: overlapping square tiles covering the whole frame, so the face detector also finds
 * small faces anywhere (bystanders, a person low in the frame). Tile side = half the shorter side;
 * tiles overlap by half, and the last row and column touch the edges.
 */
export function tiles(width: number, height: number): Box[] {
  const size = Math.max(1, Math.round(Math.min(width, height) / 2))
  const step = Math.max(1, Math.round(size / 2))
  const starts = (len: number) => {
    const out: number[] = []
    for (let s = 0; s + size < len; s += step) out.push(s)
    out.push(Math.max(0, len - size))
    return [...new Set(out)]
  }
  return starts(height).flatMap((y) => starts(width).map((x) => ({ x, y, w: Math.min(size, width), h: Math.min(size, height) })))
}

/** A box found in the detect area (drawn at sx × sy detector px per frame px) → frame coordinates. */
export function toFrame(found: Box, area: Box, sx: number, sy: number): Box {
  return { x: area.x + found.x / sx, y: area.y + found.y / sy, w: found.w / sx, h: found.h / sy }
}

/** Every box to blur: detected faces (enlarged 40%) plus the fixed face zone, always. */
export function boxesToBlur(detected: Box[], width: number, height: number): Box[] {
  return [...detected.map((d) => enlarge(d, 1.4, width, height)), faceZone(width, height)].filter((b) => b.w > 0 && b.h > 0)
}

export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * Coarse mosaic inside a box: blocks of `block` px, each filled with its average colour. With
 * about six blocks across a face, nothing recognisable is left.
 */
export function mosaic(img: Pixels, box: Box, block = Math.max(8, Math.round(box.w / 6))): void {
  const b = clampBox(box, img.width, img.height)
  for (let by = b.y; by < b.y + b.h; by += block) {
    for (let bx = b.x; bx < b.x + b.w; bx += block) {
      const ex = Math.min(bx + block, b.x + b.w)
      const ey = Math.min(by + block, b.y + b.h)
      let r = 0
      let g = 0
      let bl = 0
      let n = 0
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * img.width + x) * 4
          r += img.data[i]
          g += img.data[i + 1]
          bl += img.data[i + 2]
          n++
        }
      }
      if (!n) continue
      r = Math.round(r / n)
      g = Math.round(g / n)
      bl = Math.round(bl / n)
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * img.width + x) * 4
          img.data[i] = r
          img.data[i + 1] = g
          img.data[i + 2] = bl
        }
      }
    }
  }
}
