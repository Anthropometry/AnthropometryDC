/**
 * F6 Amendment A (specs/F6-camera.md): where each person's head is, whether the whole participant is
 * in the picture, and where the top of the head and the heels are. Pure functions on the pose
 * model's points, so they are tested without a phone.
 *
 * Points follow MediaPipe's pose landmarker (33 points, x and y as fractions of the image):
 * 0 nose, 1–6 eyes, 7–8 ears, 9–10 mouth, 11–12 shoulders, 23–24 hips, 29–30 heels, 31–32 toes.
 * The model gives every point for every person it finds, also from the side or back (then estimated).
 */
import { clampBox, type Box } from './blur'

export interface Point {
  x: number
  y: number
}
/** One person: 33 points, as fractions of the image (0–1). */
export type Person = readonly Point[]

const HEAD = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const EYES = [2, 5]
const EARS = [7, 8]
const SHOULDERS = [11, 12]
const HIPS = [23, 24]
const FEET = [29, 30, 31, 32]

const ok = (p: Point | undefined): p is Point => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
const px = (p: Point, w: number, h: number): Point => ({ x: p.x * w, y: p.y * h })
const mid = (ps: Point[]): Point => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length })
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

function points(person: Person, idx: number[], w: number, h: number): Point[] {
  return idx.map((i) => person[i]).filter(ok).map((p) => px(p, w, h))
}

/**
 * The size of the head, in pixels, from the body around it (works from the front, side and back):
 * about half the shoulder-to-hip length, 0.8 × the shoulder width, 3 × the eye-to-ear distance;
 * whichever is largest, so a side view (narrow shoulders) still gets a big enough box.
 */
export const HEAD_FACTORS = { torso: 0.55, shoulders: 0.8, eyeEar: 3 }

function headSize(person: Person, w: number, h: number): number | null {
  const sh = points(person, SHOULDERS, w, h)
  const hips = points(person, HIPS, w, h)
  const eyes = points(person, EYES, w, h)
  const ears = points(person, EARS, w, h)
  const sizes: number[] = []
  if (sh.length === 2) sizes.push(dist(sh[0], sh[1]) * HEAD_FACTORS.shoulders)
  if (sh.length && hips.length) sizes.push(dist(mid(sh), mid(hips)) * HEAD_FACTORS.torso)
  if (eyes.length && ears.length) sizes.push(Math.max(...eyes.flatMap((e) => ears.map((a) => dist(e, a)))) * HEAD_FACTORS.eyeEar)
  const s = Math.max(0, ...sizes)
  return s > 0 ? s : null
}

/**
 * The box to blur over a person's whole head (Ryan, 12 Nov: the whole head, not only the face):
 * around the head points, 1.2 × the head size wide and 1.3 × tall (hair above, chin below),
 * kept inside the photo. Null if the head can't be placed (no head points or no body to size it).
 */
export function headBox(person: Person, width: number, height: number): Box | null {
  const head = points(person, HEAD, width, height)
  const size = headSize(person, width, height)
  if (!head.length || size === null) return null
  const c = mid(head)
  const w = size * 1.2
  const h = size * 1.3
  const b = clampBox({ x: c.x - w / 2, y: c.y - h * 0.6, w, h }, width, height)
  return b.w > 0 && b.h > 0 ? b : null
}

/** Lowest point of the feet (heels or toes), in pixels; null if none. */
export function feetY(person: Person, height: number): number | null {
  const ys = FEET.map((i) => person[i]).filter(ok).map((p) => p.y * height)
  return ys.length ? Math.max(...ys) : null
}

/** The main participant: the tallest person in the picture (bystanders are usually further away). */
export function mainPerson(people: readonly Person[], width: number, height: number): Person | null {
  let best: Person | null = null
  let bestSpan = -1
  for (const p of people) {
    const b = headBox(p, width, height)
    const f = feetY(p, height)
    const span = b && f !== null ? f - b.y : -1
    if (span > bestSpan) {
      best = p
      bestSpan = span
    }
  }
  return bestSpan > 0 ? best : null
}

export type FramingProblem = 'no_person' | 'other_people' | 'not_whole' | 'too_small'

/** The participant must fill at least this share of the photo's height (spec: 55%). */
export const MIN_HEIGHT_SHARE = 0.55
/** Head and heels must stay this far inside the edges (share of the photo's height). */
export const EDGE_MARGIN = 0.01

export interface Framing {
  problem: FramingProblem | null
  people: number
  /** Top of the head box and lowest foot point, in pixels (estimates from the points). */
  headTop: number | null
  feet: number | null
}

/** Is the whole participant in the picture, big enough, and alone? */
export function checkFraming(people: readonly Person[], width: number, height: number): Framing {
  const main = mainPerson(people, width, height)
  if (!main) return { problem: 'no_person', people: people.length, headTop: null, feet: null }
  const box = headBox(main, width, height)!
  const raw = points(main, HEAD, width, height)
  const size = headSize(main, width, height)!
  // Top of the head (estimate, unclamped): about half a head above the eyes. Above the photo = cut off.
  // (The blur box reaches higher on purpose; this is only for "is the whole person in?".)
  const headTop = mid(raw).y - size * 0.5
  const feet = feetY(main, height)!
  const margin = EDGE_MARGIN * height
  const xs = [box.x, box.x + box.w]
  const out = { people: people.length, headTop: Math.max(0, headTop), feet }
  if (people.length > 1) return { problem: 'other_people', ...out }
  if (headTop < margin || feet > height - margin || xs[0] <= 0 || xs[1] >= width) return { problem: 'not_whole', ...out }
  if ((feet - headTop) / height < MIN_HEIGHT_SHARE) return { problem: 'too_small', ...out }
  return { problem: null, ...out }
}

/** Plain words for the collector. */
export function framingHint(problem: FramingProblem | null): string {
  switch (problem) {
    case 'no_person':
      return 'Can’t see the whole person. Make sure head and feet are in the picture.'
    case 'other_people':
      return 'Wait until nobody is behind the person.'
    case 'not_whole':
      return 'Zoom out or step back: head and feet must be in the picture.'
    case 'too_small':
      return 'Zoom in: the person should fill more of the picture.'
    default:
      return 'Whole person in the picture.'
  }
}

/** The body outline from the pose model: one value per pixel, person ≈ 1, background ≈ 0. */
export interface Mask {
  data: ArrayLike<number>
  width: number
  height: number
}

/**
 * Top of the head (hair or headwear included) and bottom of the feet, from the body outline,
 * in photo pixels. Looks only in the columns around the participant (xFrom–xTo, photo pixels), so a
 * bystander or a shadow elsewhere doesn't count. Null if the outline has no person there.
 */
export function outlineTopBottom(
  mask: Mask,
  photoWidth: number,
  photoHeight: number,
  xFrom: number,
  xTo: number,
  threshold = 0.5,
): { top: number; bottom: number } | null {
  const sx = mask.width / photoWidth
  const sy = photoHeight / mask.height
  const c0 = Math.max(0, Math.floor(xFrom * sx))
  const c1 = Math.min(mask.width - 1, Math.ceil(xTo * sx))
  let top = -1
  let bottom = -1
  for (let r = 0; r < mask.height; r++) {
    for (let c = c0; c <= c1; c++) {
      if (mask.data[r * mask.width + c] >= threshold) {
        if (top < 0) top = r
        bottom = r
        break
      }
    }
  }
  if (top < 0) return null
  return { top: Math.round(top * sy), bottom: Math.min(photoHeight - 1, Math.round((bottom + 1) * sy) - 1) }
}

/**
 * Head top and heels to store with the photo (Ryan, 12 Nov), measured before the blur: from the
 * outline when there is one, otherwise from the points. Rounded to whole pixels, head above heels.
 */
export function headTopAndHeels(
  main: Person,
  mask: Mask | null,
  width: number,
  height: number,
): { headTopY: number; heelY: number } | null {
  const box = headBox(main, width, height)
  const feet = feetY(main, height)
  if (!box || feet === null) return null
  // Columns of the participant: from the points' left to right edge, widened a little for arms and hair.
  const xs = main.filter(ok).map((p) => p.x * width)
  const span = Math.max(...xs) - Math.min(...xs)
  const fromOutline = mask ? outlineTopBottom(mask, width, height, Math.min(...xs) - span * 0.1, Math.max(...xs) + span * 0.1) : null
  const headTopY = Math.round(fromOutline ? fromOutline.top : box.y)
  const heelY = Math.round(fromOutline ? fromOutline.bottom : feet)
  if (!(headTopY >= 0 && heelY < height && headTopY < heelY)) return null
  return { headTopY, heelY }
}
