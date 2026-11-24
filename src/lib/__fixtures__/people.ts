/**
 * Test people for F6 Amendment A: 33 pose points (as fractions of the image) for a standing person,
 * from simple body proportions. `view` drops the points the model would only estimate.
 */
import type { Person, Point } from '../pose'

export interface Body {
  /** Image size in pixels. */
  w: number
  h: number
  /** Centre x, top of the head and bottom of the feet, in pixels. */
  cx: number
  top: number
  bottom: number
  view?: 'front' | 'side' | 'back'
}

export function person({ w, h, cx, top, bottom, view = 'front' }: Body): Person {
  const H = bottom - top
  const at = (dx: number, dy: number): Point => ({ x: (cx + dx * H) / w, y: (top + dy * H) / h })
  const none: Point = { x: NaN, y: NaN }
  const eye = 0.065
  const pts: Point[] = Array.from({ length: 33 }, () => none)
  pts[0] = at(0, eye + 0.02) // nose
  pts[2] = at(-0.02, eye) // eyes
  pts[5] = at(0.02, eye)
  pts[1] = at(-0.015, eye)
  pts[3] = at(-0.025, eye)
  pts[4] = at(0.015, eye)
  pts[6] = at(0.025, eye)
  pts[7] = at(-0.045, eye + 0.005) // ears
  pts[8] = at(0.045, eye + 0.005)
  pts[9] = at(-0.01, eye + 0.035) // mouth
  pts[10] = at(0.01, eye + 0.035)
  pts[11] = at(-0.12, 0.18) // shoulders
  pts[12] = at(0.12, 0.18)
  pts[23] = at(-0.08, 0.52) // hips
  pts[24] = at(0.08, 0.52)
  pts[29] = at(-0.05, 0.995) // heels
  pts[30] = at(0.05, 0.995)
  pts[31] = at(-0.06, 1) // toes
  pts[32] = at(0.06, 1)
  if (view === 'side') {
    // Side-on: shoulders and hips overlap; one eye and one ear.
    pts[11] = at(-0.01, 0.18)
    pts[12] = at(0.01, 0.18)
    pts[23] = at(-0.01, 0.52)
    pts[24] = at(0.01, 0.52)
    for (const i of [1, 2, 3, 7, 9]) pts[i] = none
  }
  if (view === 'back') {
    // From the back: no face points, only ears.
    for (const i of [0, 1, 2, 3, 4, 5, 6, 9, 10]) pts[i] = none
  }
  return pts
}
