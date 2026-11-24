/** F6 Amendment A: head boxes, framing check, head top and heels. Pure functions, no phone needed. */
import { describe, expect, it } from 'vitest'
import { person } from './__fixtures__/people'
import { checkFraming, feetY, framingHint, headBox, headTopAndHeels, mainPerson, outlineTopBottom, splitFacesOnBody, type Mask } from './pose'

const W = 1200
const H = 1600
const inside = (b: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h

describe('head box: the whole head, wherever the person stands', () => {
  it.each([
    ['high in the frame', 600, 40, 1540],
    ['low and small (zoom 1.0, the 12 Nov failure)', 650, 500, 1200],
    ['to the side', 250, 300, 1500],
  ])('%s: the face and the top of the head are inside the box', (_, cx, top, bottom) => {
    const p = person({ w: W, h: H, cx, top, bottom })
    const b = headBox(p, W, H)!
    const Hb = bottom - top
    expect(inside(b, cx, top + 0.065 * Hb)).toBe(true) // eyes
    expect(inside(b, cx, top + 0.1 * Hb)).toBe(true) // mouth and chin
    expect(inside(b, cx, Math.max(0, top + 0.005 * Hb))).toBe(true) // top of the head (hair)
    expect(inside(b, cx - 0.045 * Hb, top + 0.07 * Hb)).toBe(true) // ears
    expect(b.y + b.h).toBeLessThan(top + 0.2 * Hb) // ends at the neck: shoulders and body stay visible
  })

  it('side view (narrow shoulders) and back view (ears only) still get a full-size box', () => {
    const front = headBox(person({ w: W, h: H, cx: 600, top: 100, bottom: 1500 }), W, H)!
    const side = headBox(person({ w: W, h: H, cx: 600, top: 100, bottom: 1500, view: 'side' }), W, H)!
    const back = headBox(person({ w: W, h: H, cx: 600, top: 100, bottom: 1500, view: 'back' }), W, H)!
    expect(side.w).toBeGreaterThan(front.w * 0.8)
    expect(back.w).toBeGreaterThan(front.w * 0.8)
    expect(inside(side, 600, 100 + 0.065 * 1400)).toBe(true)
    expect(inside(back, 600, 100 + 0.065 * 1400)).toBe(true)
  })

  it('DENY: no head points, or no body to size it → no box (the photo will be refused)', () => {
    const p = person({ w: W, h: H, cx: 600, top: 100, bottom: 1500 }).map((pt, i) => (i <= 10 ? { x: NaN, y: NaN } : pt))
    expect(headBox(p, W, H)).toBeNull()
    const headOnly = person({ w: W, h: H, cx: 600, top: 100, bottom: 1500 }).map((pt, i) => (i <= 10 ? pt : { x: NaN, y: NaN }))
    expect(headBox(headOnly.map((pt, i) => ([2, 5, 7, 8].includes(i) ? { x: NaN, y: NaN } : pt)), W, H)).toBeNull()
    expect(feetY(headOnly, H)).toBeNull()
  })

  it('stays inside the photo when the head is at the edge', () => {
    const b = headBox(person({ w: W, h: H, cx: 30, top: 0, bottom: 1500 }), W, H)!
    expect(b.x).toBe(0)
    expect(b.y).toBe(0)
  })
})

describe('framing: whole person, big enough, alone', () => {
  const ok = person({ w: W, h: H, cx: 600, top: 100, bottom: 1500 })

  it('ALLOW: the whole participant, filling most of the height', () => {
    const f = checkFraming([ok], W, H)
    expect(f.problem).toBeNull()
    expect(f.people).toBe(1)
    expect(framingHint(f.problem)).toMatch(/Whole person/)
  })

  it('DENY: nobody → "can’t see the whole person"', () => {
    expect(checkFraming([], W, H).problem).toBe('no_person')
    expect(framingHint('no_person')).toMatch(/Can’t see the whole person/)
  })

  it('DENY: someone else in the picture → wait', () => {
    const bystander = person({ w: W, h: H, cx: 1000, top: 500, bottom: 1000 })
    const f = checkFraming([bystander, ok], W, H)
    expect(f.problem).toBe('other_people')
    expect(framingHint(f.problem)).toMatch(/Wait until nobody is behind/)
    expect(mainPerson([bystander, ok], W, H)).toBe(ok) // the tallest is the participant
  })

  it('DENY: head or feet cut off → zoom out', () => {
    expect(checkFraming([person({ w: W, h: H, cx: 600, top: -60, bottom: 1500 })], W, H).problem).toBe('not_whole')
    expect(checkFraming([person({ w: W, h: H, cx: 600, top: 100, bottom: 1620 })], W, H).problem).toBe('not_whole')
    expect(checkFraming([person({ w: W, h: H, cx: 20, top: 100, bottom: 1500 })], W, H).problem).toBe('not_whole')
    expect(framingHint('not_whole')).toMatch(/Zoom out/)
  })

  it('DENY: too small (under 55% of the height) → zoom in', () => {
    const f = checkFraming([person({ w: W, h: H, cx: 650, top: 500, bottom: 1200 })], W, H)
    expect(f.problem).toBe('too_small')
    expect(framingHint(f.problem)).toMatch(/Zoom in/)
  })
})

describe('head top and heels, measured before the blur', () => {
  function outline(top: number, bottom: number, x0: number, x1: number, mw = 300, mh = 400): Mask {
    const data = new Float32Array(mw * mh)
    for (let r = top; r <= bottom; r++) for (let c = x0; c <= x1; c++) data[r * mw + c] = 0.9
    return { data, width: mw, height: mh }
  }

  it('from the body outline: hair or headwrap included, in photo pixels', () => {
    // outline rows 20–380 of 400 → photo 80–1523 of 1600
    expect(outlineTopBottom(outline(20, 380, 120, 180), W, H, 400, 800)).toEqual({ top: 80, bottom: 1523 })
    const p = person({ w: W, h: H, cx: 600, top: 100, bottom: 1500 })
    expect(headTopAndHeels(p, outline(20, 380, 120, 180), W, H)).toEqual({ headTopY: 80, heelY: 1523 })
  })

  it('a bystander or shadow outside the participant’s columns is ignored', () => {
    const m = outline(5, 395, 0, 10) // something at the far left
    expect(outlineTopBottom(m, W, H, 400, 800)).toBeNull()
  })

  it('without an outline: from the points; head above heels', () => {
    const p = person({ w: W, h: H, cx: 600, top: 100, bottom: 1500 })
    const m = headTopAndHeels(p, null, W, H)!
    expect(m.headTopY).toBeLessThan(100 + 20)
    expect(m.heelY).toBe(1500)
    expect(m.headTopY).toBeLessThan(m.heelY)
  })

  it('DENY: nothing usable → null', () => {
    const noFeet = person({ w: W, h: H, cx: 600, top: 100, bottom: 1500 }).map((pt, i) => (i >= 29 ? { x: NaN, y: NaN } : pt))
    expect(headTopAndHeels(noFeet, null, W, H)).toBeNull()
  })
})

describe("Amendment C: no face on the participant's own body below the neck", () => {
  // Participant 100–1500 px tall, centred at x 600; shoulders at y ≈ 352. Outline: x 450–750, y 100–1500.
  const p = person({ w: W, h: H, cx: 600, top: 100, bottom: 1500 })
  const mask: Mask = (() => {
    const mw = 120
    const mh = 160
    const data = new Float32Array(mw * mh)
    for (let r = 10; r < 150; r++) for (let c = 45; c < 75; c++) data[r * mw + c] = 1
    return { data, width: mw, height: mh }
  })()
  const at = (cx: number, cy: number, s = 80) => ({ x: cx - s / 2, y: cy - s / 2, w: s, h: s })

  it('ignores finds centred on the chest, hip, legs and feet inside the outline', () => {
    const faces = [at(600, 600), at(700, 900), at(560, 1300), at(600, 1480)]
    const r = splitFacesOnBody(faces, p, mask, W, H)
    expect(r.ignored).toHaveLength(4)
    expect(r.keep).toEqual([])
  })

  it('DENY: keeps finds on the head, above the shoulders, on the background and at the edges', () => {
    const faces = [at(600, 200), at(600, 340), at(100, 1300), at(1150, 300), at(0, 0, 40)]
    const r = splitFacesOnBody(faces, p, mask, W, H)
    expect(r.ignored).toEqual([])
    expect(r.keep).toEqual(faces)
  })

  it('DENY (fail closed): no outline, or a shoulder missing → nothing is ignored', () => {
    const faces = [at(600, 600)]
    expect(splitFacesOnBody(faces, p, null, W, H).keep).toEqual(faces)
    const noShoulder = p.map((pt, i) => (i === 12 ? { x: NaN, y: NaN } : pt))
    expect(splitFacesOnBody(faces, noShoulder, mask, W, H).keep).toEqual(faces)
    expect(splitFacesOnBody(faces, p, { data: new Float32Array(0), width: 0, height: 0 }, W, H).keep).toEqual(faces)
  })

  it('below the lower shoulder only: a find at shoulder height inside the outline is kept', () => {
    const tilted = p.map((pt, i) => (i === 11 ? { x: pt.x, y: 500 / H } : pt)) // one shoulder lower (y 500)
    const r = splitFacesOnBody([at(600, 450), at(600, 560)], tilted, mask, W, H)
    expect(r.keep).toEqual([at(600, 450)])
    expect(r.ignored).toEqual([at(600, 560)])
  })
})
