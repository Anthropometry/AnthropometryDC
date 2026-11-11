// @vitest-environment jsdom
/** F6 logic: level lock, steady timer, blur geometry and mosaic, capture order, stated height. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIMITS, createSteadyTimer, isLevel, levelHint, tiltFromGravity, tiltFromOrientation } from './level'
import { boxesToBlur, detectArea, enlarge, faceZone, mosaic, toFrame, type Pixels } from './blur'
import { capture, isBlurred } from './capture'
import { ftinTyped, toldHeightTenths } from './measurements'

afterEach(() => vi.restoreAllMocks())

describe('level lock (pitch 90° ± 1.5°, roll ± 1°)', () => {
  it('from gravity: upright is level on Android and iPhone (opposite signs)', () => {
    expect(isLevel(tiltFromGravity({ x: 0, y: 9.81, z: 0 }))).toBe(true)
    expect(isLevel(tiltFromGravity({ x: 0, y: -9.81, z: 0 }))).toBe(true)
  })

  it('from gravity: 2° forward or 1.5° sideways is not level; flat is unknown', () => {
    const z = 9.81 * Math.sin((2 * Math.PI) / 180)
    expect(isLevel(tiltFromGravity({ x: 0, y: 9.8, z }))).toBe(false)
    const x = 9.81 * Math.sin((1.5 * Math.PI) / 180)
    expect(isLevel(tiltFromGravity({ x, y: 9.8, z: 0 }))).toBe(false)
    expect(tiltFromGravity({ x: 0, y: 0.2, z: 9.8 })).toBeNull()
    expect(tiltFromGravity({ x: NaN, y: 9, z: 0 })).toBeNull()
  })

  it('from orientation angles; limits and hints', () => {
    expect(isLevel(tiltFromOrientation(90.5, -0.5))).toBe(true)
    expect(isLevel(tiltFromOrientation(92, 0))).toBe(false)
    expect(tiltFromOrientation(null, 0)).toBeNull()
    expect(LIMITS).toEqual({ pitch: 1.5, roll: 1 })
    expect(levelHint(null)).toMatch(/upright/)
    expect(levelHint({ pitch: 3, roll: 0 })).toMatch(/back/)
    expect(levelHint({ pitch: -3, roll: 0 })).toMatch(/forward/)
    expect(levelHint({ pitch: 0, roll: 2 })).toMatch(/sideways/)
    expect(levelHint({ pitch: 0, roll: 0 })).toMatch(/Hold still/)
  })
})

describe('auto-shutter: level and steady for 3 seconds', () => {
  it('counts 3, 2, 1 and fires once; tilting resets', () => {
    const t = createSteadyTimer()
    expect(t.feed(true, 0)).toBe(3)
    expect(t.feed(true, 1100)).toBe(2)
    expect(t.feed(true, 2100)).toBe(1)
    expect(t.feed(true, 3000)).toBe(0) // fires
    expect(t.feed(true, 3100)).toBeNull() // only once
    expect(t.feed(false, 3200)).toBeNull()
    expect(t.feed(true, 4000)).toBe(3) // starts again
    expect(t.feed(true, 5500)).toBe(2)
    expect(t.feed(false, 5600)).toBeNull() // tilted: cancelled
    expect(t.feed(true, 5700)).toBe(3)
    t.reset()
    expect(t.feed(true, 6000)).toBe(3)
  })
})

describe('blur geometry', () => {
  it('the fixed face zone sits on the guide head, below the top of the head, inside the frame', () => {
    const z = faceZone(1200, 1600)
    expect(z.x).toBeGreaterThan(0)
    expect(z.y).toBeGreaterThan(0) // the top of the head above it stays visible
    expect(z.x + z.w).toBeLessThanOrEqual(1200)
    expect(z.y + z.h).toBeLessThan(1600 * 0.3)
    const a = detectArea(1200, 1600)
    expect(a.x).toBeLessThan(z.x)
    expect(a.y + a.h).toBeGreaterThan(z.y + z.h)
  })

  it('DENY: with no face detected, the face zone is still blurred (always)', () => {
    expect(boxesToBlur([], 1200, 1600)).toEqual([faceZone(1200, 1600)])
  })

  it('detected faces are enlarged by 40% and mapped back to the frame', () => {
    expect(enlarge({ x: 100, y: 100, w: 100, h: 100 }, 1.4, 1000, 1000)).toEqual({ x: 80, y: 80, w: 140, h: 140 })
    expect(enlarge({ x: 0, y: 0, w: 100, h: 100 }, 1.4, 1000, 1000)).toEqual({ x: 0, y: 0, w: 120, h: 120 })
    expect(toFrame({ x: 64, y: 32, w: 128, h: 64 }, { x: 400, y: 0, w: 512, h: 256 }, 0.5, 1)).toEqual({ x: 528, y: 32, w: 256, h: 64 })
    expect(boxesToBlur([{ x: 500, y: 60, w: 100, h: 120 }], 1200, 1600)).toHaveLength(2)
  })

  it('mosaic: inside the box every block is one flat colour; outside is untouched', () => {
    const w = 32
    const h = 32
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = i % 256
      data[i * 4 + 1] = (i * 7) % 256
      data[i * 4 + 2] = (i * 13) % 256
      data[i * 4 + 3] = 255
    }
    const img: Pixels = { data, width: w, height: h }
    const before = data.slice()
    mosaic(img, { x: 8, y: 8, w: 16, h: 16 }, 8)
    const px = (x: number, y: number) => Array.from(data.slice((y * w + x) * 4, (y * w + x) * 4 + 3))
    expect(px(8, 8)).toEqual(px(15, 15)) // one block
    expect(px(16, 16)).toEqual(px(23, 23)) // another block
    expect(px(8, 8)).not.toEqual(Array.from(before.slice((8 * w + 8) * 4, (8 * w + 8) * 4 + 3)))
    expect(px(0, 0)).toEqual(Array.from(before.slice(0, 3))) // outside: untouched
    expect(px(31, 31)).toEqual(Array.from(before.slice((31 * w + 31) * 4, (31 * w + 31) * 4 + 3)))
  })
})

describe('capture: blur before any file exists', () => {
  function fakeCanvas() {
    const calls: string[] = []
    const ctx = {
      drawImage: vi.fn(() => calls.push('draw')),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
        calls.push('read')
        return { data: new Uint8ClampedArray(w * h * 4).fill(200), width: w, height: h }
      }),
      putImageData: vi.fn(() => calls.push('blurred')),
      clearRect: vi.fn(() => calls.push('cleared')),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      calls.push('jpeg')
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])]))
    })
    return { calls, ctx }
  }

  it('order: draw → detect → blur → JPEG → cleared; the result counts as blurred', async () => {
    const { calls, ctx } = fakeCanvas()
    const detect = vi.fn(async () => {
      calls.push('detect')
      return [{ x: 100, y: 80, w: 60, h: 70 }]
    })
    const photo = await capture({} as CanvasImageSource, 3000, 4000, detect)
    // frame drawn, head area copied for the detector, faces found, blurred, then the only JPEG, then cleared
    expect(calls).toEqual(['draw', 'draw', 'detect', 'read', 'blurred', 'jpeg', 'cleared'])
    expect(photo).toMatchObject({ width: 1200, height: 1600, facesDetected: 1, bytes: 5 })
    expect(isBlurred(photo)).toBe(true)
    expect(ctx.putImageData).toHaveBeenCalledTimes(1)
  })

  it('without a detector (failed to load), the face zone is still blurred before the JPEG', async () => {
    const { calls } = fakeCanvas()
    const photo = await capture({} as CanvasImageSource, 1200, 1600, null)
    expect(calls).toEqual(['draw', 'read', 'blurred', 'jpeg', 'cleared'])
    expect(photo.facesDetected).toBe(0)
  })

  it('a detector error does not stop the blur', async () => {
    const { calls } = fakeCanvas()
    await capture({} as CanvasImageSource, 1200, 1600, async () => Promise.reject(new Error('x')))
    expect(calls.slice(-3)).toEqual(['blurred', 'jpeg', 'cleared'])
  })

  it('DENY: anything not made by capture is not "blurred" (so it can never be queued)', () => {
    expect(isBlurred({ jpeg: new Uint8Array([1]), width: 1, height: 1, bytes: 1, facesDetected: 0 })).toBe(false)
    expect(isBlurred(null)).toBe(false)
    expect(isBlurred('photo')).toBe(false)
  })
})

describe('stated height (F5 Amendment B): same rules as the database', () => {
  it.each([
    ['170.5', 'cm', 1705],
    ['5 7 1/2', 'ftin', 1715],
    ['5 7', 'ftin', 1702],
    ['6 0', 'ftin', 1829],
  ] as const)('%s %s → %i tenths', (typed, unit, tenths) => {
    expect(toldHeightTenths(typed, unit)).toBe(tenths)
  })

  it.each([
    ['5 12', 'ftin'],
    ['5 7 2/8', 'ftin'],
    ['9 0', 'ftin'],
    ['1 2', 'ftin'],
    ['170.55', 'cm'],
    ['300', 'cm'],
  ] as const)('DENY: %s %s', (typed, unit) => {
    expect(toldHeightTenths(typed, unit)).toBeNull()
  })

  it('text for feet and inches', () => {
    expect(ftinTyped(5, 7, 4)).toBe('5 7 1/2')
    expect(ftinTyped(5, 7, 0)).toBe('5 7')
  })
})
