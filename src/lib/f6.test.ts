// @vitest-environment jsdom
/** F6 logic: level lock, steady timer, blur geometry and mosaic, capture order, stated height. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIMITS, createSteadyTimer, isLevel, levelHint, tiltFromGravity, tiltFromOrientation } from './level'
import { boxesToBlur, detectArea, enlarge, faceZone, frameRect, mosaic, tiles, toFrame, type Pixels } from './blur'
import { capture, CaptureRefused, isBlurred, type CameraTools, type PoseResult } from './capture'
import { person } from './__fixtures__/people'
import type { Person } from './pose'
import { ftinTyped, toldHeightTenths } from './measurements'

afterEach(() => vi.restoreAllMocks())

/** Fake camera tools: the given people; every face search returns `faces` (per tile). */
function tools(people: Person[], faces: { x: number; y: number; w: number; h: number }[] = [], calls?: string[]): CameraTools {
  return {
    pose: async (): Promise<PoseResult> => {
      calls?.push('pose')
      return { people, masks: people.map(() => null) }
    },
    faces: async () => {
      calls?.push('faces')
      return faces
    },
  }
}

describe('level lock (Amendment A: pitch ± 3°, roll ± 2°)', () => {
  it('from gravity: upright is level on Android and iPhone (opposite signs)', () => {
    expect(isLevel(tiltFromGravity({ x: 0, y: 9.81, z: 0 }))).toBe(true)
    expect(isLevel(tiltFromGravity({ x: 0, y: -9.81, z: 0 }))).toBe(true)
  })

  it('from gravity: Android and iPhone (all signs opposite) give the same tilt, with the orientation signs', () => {
    const a = (d: number) => 9.81 * Math.sin((d * Math.PI) / 180)
    const b = (d: number) => 9.81 * Math.cos((d * Math.PI) / 180)
    // screen tipped up (top leaning away) by 5°: Android z > 0; iPhone the same with every sign flipped
    const android = tiltFromGravity({ x: 0, y: b(5), z: a(5) })!
    const iphone = tiltFromGravity({ x: 0, y: -b(5), z: -a(5) })!
    expect(android.pitch).toBeCloseTo(-5, 5)
    expect(iphone.pitch).toBeCloseTo(-5, 5)
    expect(tiltFromOrientation(85, 0)!.pitch).toBe(-5) // same sign as beta 85°
    // right edge lower by 3°: Android x < 0
    expect(tiltFromGravity({ x: -a(3), y: b(3), z: 0 })!.roll).toBeCloseTo(3, 5)
    expect(tiltFromGravity({ x: a(3), y: -b(3), z: 0 })!.roll).toBeCloseTo(3, 5)
  })

  it('from gravity: 3.5° forward or 2.5° sideways is not level; 2.5° / 1.5° is; flat is unknown', () => {
    const s = (d: number) => 9.81 * Math.sin((d * Math.PI) / 180)
    expect(isLevel(tiltFromGravity({ x: 0, y: 9.8, z: s(3.5) }))).toBe(false)
    expect(isLevel(tiltFromGravity({ x: s(2.5), y: 9.8, z: 0 }))).toBe(false)
    expect(isLevel(tiltFromGravity({ x: s(1.5), y: 9.8, z: s(2.5) }))).toBe(true)
    expect(tiltFromGravity({ x: 0, y: 0.2, z: 9.8 })).toBeNull()
    expect(tiltFromGravity({ x: NaN, y: 9, z: 0 })).toBeNull()
  })

  it('from orientation angles; limits and hints', () => {
    expect(isLevel(tiltFromOrientation(90.5, -0.5))).toBe(true)
    expect(isLevel(tiltFromOrientation(92.9, 1.9))).toBe(true)
    expect(isLevel(tiltFromOrientation(93.5, 0))).toBe(false)
    expect(tiltFromOrientation(null, 0)).toBeNull()
    expect(LIMITS).toEqual({ pitch: 3, roll: 2 })
    expect(levelHint(null)).toMatch(/upright/)
    expect(levelHint({ pitch: 4, roll: 0 })).toMatch(/away from you/)
    expect(levelHint({ pitch: -4, roll: 0 })).toMatch(/towards you/)
    expect(levelHint({ pitch: 0, roll: 3 })).toMatch(/sideways/)
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

describe('photo frame: 3:4, digital zoom', () => {
  it('a 9:16 camera image gives its centred 3:4 area; zoom takes the centre of that', () => {
    expect(frameRect(1080, 1920)).toEqual({ x: 0, y: 240, w: 1080, h: 1440 })
    expect(frameRect(1080, 1920, 2)).toEqual({ x: 270, y: 600, w: 540, h: 720 })
    expect(frameRect(1500, 1600)).toEqual({ x: 150, y: 0, w: 1200, h: 1600 }) // wider than 3:4
    expect(frameRect(1080, 1920, 9).w).toBe(270) // at most 4x
    expect(frameRect(1080, 1920, 0.2).w).toBe(1080) // at least 1x
  })

  it('capture draws only that area, at its own size (no upscaling)', async () => {
    const draws: unknown[][] = []
    const ctx = {
      drawImage: vi.fn((...a: unknown[]) => void draws.push(a)),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
      putImageData: vi.fn(),
      clearRect: vi.fn(),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff])]))
    })
    const p = await capture({} as CanvasImageSource, 1080, 1920, tools([person({ w: 540, h: 720, cx: 270, top: 40, bottom: 690 })]), 2)
    expect(draws[0].slice(1)).toEqual([270, 600, 540, 720, 0, 0, 540, 720])
    expect(p).toMatchObject({ width: 540, height: 720 })
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

describe('capture (Amendment A): find every head, refuse when unsure, blur before any file exists', () => {
  const W = 1200
  const H = 1600

  /** Image data that changes from pixel to pixel, so a mosaic block is visible. */
  function fakeCanvas() {
    const calls: string[] = []
    let blurred: Uint8ClampedArray | null = null
    const ctx = {
      drawImage: vi.fn(() => calls.push('draw')),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
        calls.push('read')
        const data = new Uint8ClampedArray(w * h * 4)
        for (let i = 0; i < w * h; i++) data[i * 4] = (i * 37) % 251
        return { data, width: w, height: h }
      }),
      putImageData: vi.fn((img: { data: Uint8ClampedArray }) => {
        calls.push('blurred')
        blurred = img.data
      }),
      clearRect: vi.fn(() => calls.push('cleared')),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      calls.push('jpeg')
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])]))
    })
    /** Is the pixel at (x, y) the same as its right neighbour (inside a mosaic block)? */
    const flat = (x: number, y: number) => {
      const d = blurred!
      return d[(y * W + x) * 4] === d[(y * W + x + 1) * 4]
    }
    return { calls, flat }
  }

  const participant = (top = 100, bottom = 1500, cx = 600) => person({ w: W, h: H, cx, top, bottom })

  it('order: draw → people → faces everywhere → blur → JPEG → cleared; marks and counts kept', async () => {
    const { calls } = fakeCanvas()
    const t = tools([participant()], [{ x: 10, y: 10, w: 30, h: 30 }], calls)
    const photo = await capture({} as CanvasImageSource, 3000, 4000, t)
    expect(calls.indexOf('pose')).toBe(1) // right after the frame is drawn
    expect(calls.filter((c) => c === 'faces').length).toBe(tiles(W, H).length) // every tile searched
    expect(calls.slice(-4)).toEqual(['read', 'blurred', 'jpeg', 'cleared'])
    expect(calls.indexOf('jpeg')).toBeGreaterThan(calls.lastIndexOf('faces'))
    expect(photo).toMatchObject({ width: W, height: H, peopleDetected: 1, blurVersion: 2, bytes: 5 })
    expect(photo.facesDetected).toBe(tiles(W, H).length) // the fake finds one per tile
    expect(photo.headTopY).toBeLessThan(120)
    expect(photo.heelY).toBe(1500)
    expect(isBlurred(photo)).toBe(true)
  })

  it('the 12 Nov failure: a person low in the frame has their face blurred (not just the outline zone)', async () => {
    const { flat } = fakeCanvas()
    // Big enough (60% of the height) but standing low: face at about y = 640, far below the fixed zone.
    const low = participant(560, 1560, 650)
    await capture({} as CanvasImageSource, W, H, tools([low]))
    const eyes = 560 + 0.065 * 1000
    expect(flat(650, Math.round(eyes))).toBe(true) // face mosaicked
    expect(flat(650, Math.round(560 + 0.1 * 1000))).toBe(true) // mouth and chin
    expect(flat(650, 1200)).toBe(false) // the body (legs) untouched
    const z = faceZone(W, H)
    expect(eyes).toBeGreaterThan(z.y + z.h) // the old fixed zone alone would have missed it
  })

  it('the head is blurred from the side and from the back too', async () => {
    for (const view of ['side', 'back'] as const) {
      const { flat } = fakeCanvas()
      const p = person({ w: W, h: H, cx: 600, top: 300, bottom: 1500, view })
      await capture({} as CanvasImageSource, W, H, tools([p]))
      expect(flat(600, Math.round(300 + 0.065 * 1200))).toBe(true)
      vi.restoreAllMocks()
    }
  })

  it('DENY: nobody found → no photo, no JPEG, canvas cleared', async () => {
    const { calls } = fakeCanvas()
    await expect(capture({} as CanvasImageSource, W, H, tools([]))).rejects.toMatchObject({ reason: 'no_person' })
    expect(calls).not.toContain('jpeg')
    expect(calls.at(-1)).toBe('cleared')
  })

  it('DENY: someone behind the participant, head or feet cut off, or too small → no photo', async () => {
    fakeCanvas()
    const bystander = person({ w: W, h: H, cx: 1000, top: 600, bottom: 1000 })
    await expect(capture({} as CanvasImageSource, W, H, tools([participant(), bystander]))).rejects.toMatchObject({ reason: 'other_people' })
    await expect(capture({} as CanvasImageSource, W, H, tools([participant(-80, 1500)]))).rejects.toMatchObject({ reason: 'not_whole' })
    await expect(capture({} as CanvasImageSource, W, H, tools([participant(700, 1300)]))).rejects.toMatchObject({ reason: 'too_small' })
  })

  it('DENY (fail closed): no camera tools, or an error in the pose model or the face detector → no photo', async () => {
    const { calls } = fakeCanvas()
    await expect(capture({} as CanvasImageSource, W, H, null)).rejects.toBeInstanceOf(CaptureRefused)
    await expect(capture({} as CanvasImageSource, W, H, null)).rejects.toMatchObject({ reason: 'no_tools' })
    const broken: CameraTools = { pose: async () => Promise.reject(new Error('x')), faces: async () => [] }
    await expect(capture({} as CanvasImageSource, W, H, broken)).rejects.toMatchObject({ reason: 'tools_failed' })
    const noFaces: CameraTools = { ...tools([participant()]), faces: async () => Promise.reject(new Error('x')) }
    await expect(capture({} as CanvasImageSource, W, H, noFaces)).rejects.toMatchObject({ reason: 'tools_failed' })
    expect(calls).not.toContain('jpeg')
  })

  it('faces the detector finds anywhere (e.g. a bystander far behind) are blurred too', async () => {
    const { flat } = fakeCanvas()
    // In the tile at (600, 1000), a face at 20–60 detector px → about 647–741, 1047–1141 in the photo.
    await capture({} as CanvasImageSource, W, H, tools([participant()], [{ x: 20, y: 20, w: 40, h: 40 }]))
    expect(flat(694, 1094)).toBe(true)
  })

  it('DENY: anything not made by capture is not "blurred" (so it can never be queued)', () => {
    expect(isBlurred({ jpeg: new Uint8Array([1]), width: 1, height: 1, bytes: 1, facesDetected: 0 })).toBe(false)
    expect(isBlurred(null)).toBe(false)
    expect(isBlurred('photo')).toBe(false)
  })
})

describe('face search everywhere: overlapping tiles', () => {
  it('cover the whole frame, overlap by half, and stay inside it', () => {
    const t = tiles(1200, 1600)
    for (const b of t) {
      expect(b.x + b.w).toBeLessThanOrEqual(1200)
      expect(b.y + b.h).toBeLessThanOrEqual(1600)
    }
    for (const [x, y] of [[0, 0], [1199, 1599], [600, 800], [1199, 0], [0, 1599]]) {
      expect(t.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)).toBe(true)
    }
    expect(t[1].x - t[0].x).toBe(t[0].w / 2)
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
