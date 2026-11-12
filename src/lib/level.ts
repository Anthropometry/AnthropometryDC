/**
 * F6 level lock and auto-shutter (specs/F6-camera.md). Pure functions, tested without a phone.
 * Upright and square = the phone held in portrait, screen facing the collector, camera facing the
 * participant. Pitch is the forward/back tilt, roll the sideways tilt, both in degrees from upright.
 * Signs follow the orientation angles: pitch > 0 = the top of the phone leans towards the collector
 * (beta above 90°); roll > 0 = the right edge lower (gamma above 0).
 */

export interface Tilt {
  pitch: number
  roll: number
}

/**
 * F6 Amendment A (Ryan, 12 Nov): pitch ± 3°, roll ± 2° from upright, so it can be held by hand
 * (was ± 1.5° / ± 1°). The exact angles are stored with every photo.
 */
export const LIMITS: Tilt = { pitch: 3, roll: 2 }
export const STEADY_MS = 3000

const deg = (r: number) => (r * 180) / Math.PI

/**
 * From the accelerometer's gravity (works on phones without a gyroscope too, as in F2). This is the
 * main source: near upright the orientation angle gamma is unstable, gravity is not.
 * Upright portrait: gravity lies along the phone's y axis. iPhone reports every axis with the
 * opposite sign to Android, so all three are first turned to Android's signs using y.
 * Android: screen facing up → z > 0 (top leaning away, pitch < 0); left edge lower → x > 0 (roll < 0).
 */
export function tiltFromGravity(g: { x: number; y: number; z: number }): Tilt | null {
  if (![g.x, g.y, g.z].every(Number.isFinite) || Math.abs(g.y) < 1) return null
  const s = Math.sign(g.y)
  const y = g.y * s
  return { pitch: -deg(Math.atan2(g.z * s, y)) || 0, roll: -deg(Math.atan2(g.x * s, y)) || 0 }
}

/** From orientation angles: beta 90 = upright, gamma 0 = no sideways tilt. */
export function tiltFromOrientation(beta: number | null, gamma: number | null): Tilt | null {
  if (beta === null || gamma === null || !Number.isFinite(beta) || !Number.isFinite(gamma)) return null
  return { pitch: beta - 90, roll: gamma }
}

export function isLevel(t: Tilt | null, limits: Tilt = LIMITS): boolean {
  return t !== null && Math.abs(t.pitch) <= limits.pitch && Math.abs(t.roll) <= limits.roll
}

/** Plain words for the collector. */
export function levelHint(t: Tilt | null, limits: Tilt = LIMITS): string {
  if (!t) return 'Hold the phone upright.'
  if (Math.abs(t.pitch) > limits.pitch)
    return t.pitch > 0 ? 'Tilt the top of the phone away from you a little.' : 'Tilt the top of the phone towards you a little.'
  if (Math.abs(t.roll) > limits.roll) return 'Straighten the phone sideways.'
  return 'Level. Hold still.'
}

/**
 * Auto-shutter: fires once the phone has been level for STEADY_MS without a break.
 * Any reading that is not level resets the count.
 */
export function createSteadyTimer(steadyMs = STEADY_MS) {
  let since: number | null = null
  let fired = false
  return {
    /** Returns seconds left (3, 2, 1), 0 when it fires (once), or null when not level. */
    feed(level: boolean, now: number): number | null {
      if (!level) {
        since = null
        fired = false
        return null
      }
      if (since === null) since = now
      const left = steadyMs - (now - since)
      if (left <= 0) {
        if (fired) return null
        fired = true
        return 0
      }
      return Math.ceil(left / 1000)
    },
    reset() {
      since = null
      fired = false
    },
  }
}
