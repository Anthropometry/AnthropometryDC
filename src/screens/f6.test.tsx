// @vitest-environment jsdom
/** F6 camera screens (with Amendment A) with a fake camera, motion sensor and body check: download, level lock, body check, auto-shutter, review, skip back. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PhotoFlow } from './Photos'
import { PracticeList } from './Practice'
import type { CameraEnv } from '../cameraEnv'
import type { Tilt } from '../lib/level'
import { CaptureRefused } from '../lib/capture'
import type { Framing } from '../lib/pose'
import type { PracticeRow } from '../lib/practice'

afterEach(cleanup)
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:blurred')
  URL.revokeObjectURL = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined)
})

const WHOLE: Framing = { problem: null, people: 1, headTop: 40, feet: 1500 }

function fakeEnv(over: Partial<CameraEnv> = {}) {
  let feed: ((t: Tilt | null) => void) | null = null
  let bodyFeed: ((f: Framing | null) => void) | null = null
  let clock = 0
  const env: CameraEnv = {
    prepare: vi.fn(async () => 'ready' as const),
    start: vi.fn(async () => vi.fn()),
    watchBody: vi.fn((_v, _z, cb) => {
      bodyFeed = cb
      cb(WHOLE) // the whole person is in the picture unless a test says otherwise
      return () => {
        bodyFeed = null
      }
    }),
    watchTilt: vi.fn((cb) => {
      feed = cb
      return () => {
        feed = null
      }
    }),
    grab: vi.fn(async () => ({ jpeg: new Uint8Array([0xff, 0xd8, 0xff]), width: 1200, height: 1600, bytes: 3, facesDetected: 1, peopleDetected: 1, headTopY: 40, heelY: 1500, blurVersion: 2 as const })),
    now: () => clock,
    phoneModel: null,
    ...over,
  }
  /** Sensor readings at these times (ms). */
  const tilt = (t: Tilt | null, at: number) =>
    act(() => {
      clock = at
      feed?.(t)
    })
  /** What the live body check says now. */
  const body = (f: Framing | null) => act(() => bodyFeed?.(f))
  return { env, tilt, body }
}

const LEVEL = { pitch: 0.3, roll: -0.2 }
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement

async function holdLevel(tilt: (t: Tilt | null, at: number) => void, from: number) {
  for (const at of [from, from + 1000, from + 2000, from + 3000]) tilt(LEVEL, at)
}

function setup(over: Partial<CameraEnv> = {}) {
  const f = fakeEnv(over)
  const save = vi.fn(async () => {})
  const finish = vi.fn(async () => {})
  const onDone = vi.fn()
  const onLater = vi.fn()
  render(
    <PhotoFlow participant={{ participantId: 'p1', sex: 'female', ageGroup: 'adult' }} env={f.env} fromFinish save={save} finish={finish} onDone={onDone} onLater={onLater} />,
  )
  return { ...f, save, finish, onDone, onLater }
}

async function toCamera(env: CameraEnv) {
  fireEvent.click(btn('Take photos'))
  screen.getByText(/2\.5 to 3 m/)
  screen.getByText(/kneel on one knee/)
  screen.getByText(/Shoes off/)
  screen.getByText(/Nobody behind the person/)
  screen.getByText(/plain A4 sheet/)
  fireEvent.click(btn('Open the camera'))
  await waitFor(() => expect(env.watchTilt).toHaveBeenCalled())
  screen.getByText(/Front photo · 1 of 3/)
}

describe('photos after Finish', () => {
  it('asks first; Later leaves without opening the camera', () => {
    const s = setup()
    screen.getByRole('heading', { name: 'Measurements saved' })
    fireEvent.click(btn('Later'))
    expect(s.onLater).toHaveBeenCalled()
    expect(s.env.start).not.toHaveBeenCalled()
  })

  it('DENY: not level → red guide, no countdown, no photo; tilting cancels the countdown', async () => {
    const s = setup()
    await toCamera(s.env)
    s.tilt({ pitch: 4, roll: 0 }, 0)
    expect(screen.getByRole('status', { name: 'Level' }).textContent).toMatch(/away from you/)
    s.tilt({ pitch: 4, roll: 0 }, 5000)
    expect(s.env.grab).not.toHaveBeenCalled()
    s.tilt(LEVEL, 6000)
    s.tilt(LEVEL, 7100)
    screen.getByText('2')
    s.tilt({ pitch: 0, roll: 2.5 }, 7500) // sideways: cancelled
    expect(screen.queryByText('2')).toBeNull()
    s.tilt(LEVEL, 8000)
    s.tilt(LEVEL, 10500) // only 2.5 s level since the tilt
    expect(s.env.grab).not.toHaveBeenCalled()
    s.tilt(null, 11000) // no reading → not level
    expect(screen.getByRole('status', { name: 'Level' }).textContent).toMatch(/upright/)
  })

  it('front → side → skip back: level and whole person for 3 s takes the photo; review shows only the blurred photo; three questions', async () => {
    const s = setup()
    await toCamera(s.env)
    screen.getByTestId('guide-front')
    fireEvent.click(btn('Zoom in'))
    fireEvent.click(btn('Zoom in'))
    screen.getByText('Zoom 1.7×')
    await holdLevel(s.tilt, 0)
    await waitFor(() => screen.getByRole('heading', { name: 'Check the photo' }))
    expect(s.env.grab).toHaveBeenCalledTimes(1)
    expect(vi.mocked(s.env.grab).mock.calls[0][1]).toBe(1.7)
    expect((screen.getByRole('img', { name: /head blurred/ }) as HTMLImageElement).src).toBe('blob:blurred')
    expect(btn('Use photo').disabled).toBe(true)
    fireEvent.click(within(screen.getByRole('group', { name: /face completely hidden/ })).getByRole('button', { name: 'Yes' }))
    fireEvent.click(within(screen.getByRole('group', { name: /whole body visible/ })).getByRole('button', { name: 'No' }))
    screen.getByText(/Retake so the whole body/)
    fireEvent.click(within(screen.getByRole('group', { name: /whole body visible/ })).getByRole('button', { name: 'Yes' }))
    expect(btn('Use photo').disabled).toBe(true) // A4 not answered
    fireEvent.click(within(screen.getByRole('group', { name: /A4 sheet/ })).getByRole('button', { name: 'Yes' }))
    fireEvent.click(btn('Use photo'))
    await waitFor(() => screen.getByText(/Side photo · 2 of 3/))
    expect(s.save).toHaveBeenCalledWith('front', expect.objectContaining({ levelPitch: 0.3, levelRoll: -0.2, a4Confirmed: true, faceHidden: true, zoom: 1.7 }))
    screen.getByTestId('guide-side')
    expect(screen.queryByRole('button', { name: 'Skip back photo' })).toBeNull() // side is required

    await holdLevel(s.tilt, 20000)
    await waitFor(() => screen.getByRole('heading', { name: 'Check the photo' }))
    fireEvent.click(btn('Retake'))
    await waitFor(() => screen.getByText(/Side photo · 2 of 3/))
    await holdLevel(s.tilt, 30000)
    await waitFor(() => screen.getByRole('heading', { name: 'Check the photo' }))
    fireEvent.click(within(screen.getByRole('group', { name: /face completely hidden/ })).getByRole('button', { name: 'Yes' }))
    fireEvent.click(within(screen.getByRole('group', { name: /whole body visible/ })).getByRole('button', { name: 'Yes' }))
    fireEvent.click(within(screen.getByRole('group', { name: /A4 sheet/ })).getByRole('button', { name: 'No' }))
    screen.getByText(/Lay the sheet flat/)
    expect(btn('Use photo').disabled).toBe(true) // all three must be Yes
    fireEvent.click(within(screen.getByRole('group', { name: /A4 sheet/ })).getByRole('button', { name: 'Yes' }))
    fireEvent.click(btn('Use photo'))
    await waitFor(() => screen.getByText(/Back photo \(optional\) · 3 of 3/))
    expect(s.save).toHaveBeenLastCalledWith('side', expect.objectContaining({ a4Confirmed: true, faceHidden: true }))

    fireEvent.click(btn('Skip back photo'))
    await waitFor(() => screen.getByRole('heading', { name: 'Photos saved' }))
    expect(s.save).toHaveBeenCalledTimes(2)
    expect(s.finish).toHaveBeenCalledTimes(1)
    expect(s.env.start).toHaveBeenCalledTimes(1) // camera opened once for all poses
  })

  it('DENY: the whole person not in the picture, or someone behind → hint, no countdown, no photo', async () => {
    const s = setup()
    await toCamera(s.env)
    s.body({ problem: 'not_whole', people: 1, headTop: 0, feet: 1600 })
    expect(screen.getByRole('status', { name: 'Person' }).textContent).toMatch(/Zoom out/)
    await holdLevel(s.tilt, 0)
    expect(s.env.grab).not.toHaveBeenCalled()
    s.body({ problem: 'other_people', people: 2, headTop: 40, feet: 1500 })
    expect(screen.getByRole('status', { name: 'Person' }).textContent).toMatch(/Wait until nobody is behind/)
    await holdLevel(s.tilt, 5000)
    expect(s.env.grab).not.toHaveBeenCalled()
    s.body(WHOLE)
    screen.getByText(/Whole person in the picture/)
    await holdLevel(s.tilt, 10000)
    await waitFor(() => expect(s.env.grab).toHaveBeenCalledTimes(1))
  })

  it('slow phone: no live check, the shutter goes on level only; the photo itself is still checked', async () => {
    const s = setup({ grab: vi.fn(async () => Promise.reject(new CaptureRefused('no_person'))) })
    await toCamera(s.env)
    s.body(null)
    screen.getByText(/checks each photo after taking it/)
    await holdLevel(s.tilt, 0)
    await waitFor(() => screen.getByText(/No photo was made\. Can’t see the whole person/))
    screen.getByText(/Front photo · 1 of 3/)
    expect(s.save).not.toHaveBeenCalled()
  })

  it('DENY: "Is the face completely hidden?" No → the photo is thrown away, never saved', async () => {
    const s = setup()
    await toCamera(s.env)
    await holdLevel(s.tilt, 0)
    await waitFor(() => screen.getByRole('heading', { name: 'Check the photo' }))
    fireEvent.click(within(screen.getByRole('group', { name: /face completely hidden/ })).getByRole('button', { name: 'No' }))
    await waitFor(() => screen.getByText(/Front photo · 1 of 3/))
    screen.getByText(/photo was deleted and not kept/)
    expect(s.save).not.toHaveBeenCalled()
  })

  it('DENY (fail closed): the face blur can’t run → no photo, a clear message', async () => {
    const s = setup({ grab: vi.fn(async () => Promise.reject(new CaptureRefused('tools_failed'))) })
    await toCamera(s.env)
    await holdLevel(s.tilt, 0)
    await waitFor(() => screen.getByText(/face blur could not run, so no photo was made/))
    expect(s.save).not.toHaveBeenCalled()
  })

  it('first use: the camera tools download once, with a message; no signal or an old phone → clear messages, no camera', async () => {
    let finish: (v: 'ready') => void = () => undefined
    const s = setup({
      prepare: vi.fn((onProgress: (d: number, t: number) => void) => {
        onProgress(1, 4)
        return new Promise<'ready'>((r) => (finish = r))
      }),
    })
    fireEvent.click(btn('Take photos'))
    fireEvent.click(btn('Open the camera'))
    await waitFor(() => screen.getByText(/Getting the camera ready \(one time, about 18 MB\)… 1 of 4/))
    expect(screen.queryByText(/Wi-?Fi/i)).toBeNull()
    await act(async () => finish('ready'))
    await waitFor(() => expect(s.env.start).toHaveBeenCalled())
    cleanup()

    const noSignal = setup({ prepare: vi.fn(async () => 'no_signal' as const) })
    fireEvent.click(btn('Take photos'))
    fireEvent.click(btn('Open the camera'))
    await waitFor(() => screen.getByText(/needs signal once to get ready/))
    expect(noSignal.env.start).not.toHaveBeenCalled()
    cleanup()

    const old = setup({ prepare: vi.fn(async () => 'unsupported' as const) })
    fireEvent.click(btn('Take photos'))
    fireEvent.click(btn('Open the camera'))
    await waitFor(() => screen.getByText(/can’t take study photos/))
    screen.getByText(/Consent and measurements still work/)
    expect(old.env.start).not.toHaveBeenCalled()
  })

  it('camera refused: a clear message, still on the set-up card', async () => {
    setup({ start: vi.fn(async () => Promise.reject(new Error('NotAllowedError'))) })
    fireEvent.click(btn('Take photos'))
    fireEvent.click(btn('Open the camera'))
    await waitFor(() => screen.getByText(/camera could not open/))
    screen.getByRole('heading', { name: 'Set up' })
  })
})

describe('list (F6)', () => {
  const row = (over: Partial<PracticeRow>): PracticeRow => ({ id: 'a', practiceNo: 1, ageGroup: 'adult', status: 'draft', createdAt: '2026-11-09T09:00:00Z', waiting: false, hasConsent: true, ...over })

  it('Photos only for measured participants without photos; Complete has none', async () => {
    const onPhotos = vi.fn()
    render(
      <PracticeList
        load={async () => [row({ id: 'a', practiceNo: 1 }), row({ id: 'b', practiceNo: 2, measured: true }), row({ id: 'c', practiceNo: 3, measured: true, photosDone: true })]}
        remove={vi.fn()}
        onNew={vi.fn()}
        onBack={vi.fn()}
        onMeasure={vi.fn()}
        onPhotos={onPhotos}
      />,
    )
    const b = await waitFor(() => screen.getByRole('listitem', { name: 'Practice P-0002' }))
    within(b).getByText(/Measured · photos needed/)
    fireEvent.click(within(b).getByRole('button', { name: 'Photos' }))
    expect(onPhotos).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
    expect(within(screen.getByRole('listitem', { name: 'Practice P-0001' })).queryByRole('button', { name: 'Photos' })).toBeNull()
    const c = screen.getByRole('listitem', { name: 'Practice P-0003' })
    within(c).getByText(/Complete/)
    expect(within(c).queryByRole('button', { name: 'Photos' })).toBeNull()
  })
})
