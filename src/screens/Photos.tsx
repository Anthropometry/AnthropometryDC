/**
 * F6 camera screens (specs/F6-camera.md with Amendment A): set-up card → the one-time camera tools
 * download → for each pose, the live back camera with the pose outline, the body check (whole person
 * in, big enough, alone), the level lock and the 3-second auto-shutter → review of the BLURRED photo
 * only: "Is the face completely hidden?" (No discards it), whole body, A4 → Use photo / Retake.
 * Front and side are required; the back photo can be skipped.
 * Nothing from the live view is kept: env.grab() checks and blurs inside the capture function before
 * a JPEG exists, and only that blurred photo is shown and saved.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Choice, ErrorText, Page, Title } from '../components/ui'
import { PoseGuide } from '../components/PoseGuide'
import type { CameraEnv } from '../cameraEnv'
import { CaptureRefused, type BlurredPhoto } from '../lib/capture'
import { CAMERA_DOWNLOAD_MB } from '../lib/cameraFiles'
import { framingHint, type Framing } from '../lib/pose'
import { FRAME_ASPECT, ZOOM } from '../lib/blur'
import { createSteadyTimer, isLevel, levelHint, type Tilt } from '../lib/level'
import type { PhotoSlot, Shot } from '../lib/photoQueue'

export interface PhotoFlowProps {
  participant: { participantId: string; sex: 'female' | 'male' | null; ageGroup: 'adult' | 'child' }
  env: CameraEnv
  /** Opened straight after Finish on the measurements: ask first ("Take photos" / "Later"). */
  fromFinish?: boolean
  save: (slot: PhotoSlot, shot: Shot) => Promise<void>
  /** Front and side are saved (sent after the photos). */
  finish: () => Promise<void>
  onDone: () => void
  onLater: () => void
}

type Step = 'ask' | 'setup' | 'camera' | 'review' | 'done'

const TOOLS_FAILED = 'The face blur could not run, so no photo was made. Close the app, open it again and retry.'
/** Why a photo was not made, in plain words. */
function refusalText(e: unknown): string {
  if (e instanceof CaptureRefused) {
    if (e.reason === 'no_tools' || e.reason === 'tools_failed') return TOOLS_FAILED
    return `No photo was made. ${framingHint(e.reason)}`
  }
  return 'The photo could not be made. Try again.'
}

const ORDER: PhotoSlot[] = ['front', 'side', 'back']
const LABEL: Record<PhotoSlot, string> = { front: 'Front photo', side: 'Side photo', back: 'Back photo (optional)' }
const POSE_TEXT: Record<PhotoSlot, string> = {
  front: 'Facing the camera, standing upright, feet hip-width apart, arms out to the sides (an "A" shape, not touching the body), looking straight ahead.',
  side: 'Left side towards the camera, upright, feet together, looking straight ahead. The arm nearer the camera straight forward at shoulder height.',
  back: 'Back to the camera, same stance as the front photo.',
}
const A4_TEXT: Record<PhotoSlot, string> = {
  front: 'A4 sheet flat on the floor just in front of the toes.',
  side: 'A4 sheet flat on the floor beside the feet, long side towards the camera.',
  back: 'A4 sheet flat on the floor beside the feet, long side towards the camera.',
}

export function PhotoFlow({ participant, env, fromFinish = false, save, finish, onDone, onLater }: PhotoFlowProps) {
  const [step, setStep] = useState<Step>(fromFinish ? 'ask' : 'setup')
  const [slot, setSlot] = useState<PhotoSlot>('front')
  const [error, setError] = useState('')
  const [tilt, setTilt] = useState<Tilt | null>(null)
  const [count, setCount] = useState<number | null>(null)
  /** Digital zoom, kept for all poses (same distance). */
  const [zoom, setZoom] = useState(1.5)
  const zoomNow = useRef(1.5)
  const changeZoom = (d: number) => {
    const z = Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, zoomNow.current + d)) * 10) / 10
    zoomNow.current = z
    setZoom(z)
  }
  const [shot, setShot] = useState<{ photo: BlurredPhoto; tilt: Tilt | null; takenAt: string; zoom: number; url: string } | null>(null)
  const [face, setFace] = useState<boolean | null>(null)
  const [body, setBody] = useState<boolean | null>(null)
  const [a4, setA4] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  /** One-time camera tools download: files done / total, or null when not downloading. */
  const [getting, setGetting] = useState<[number, number] | null>(null)
  /** Live body check: undefined = not known yet; null = slow phone (the photo is checked after). */
  const [framing, setFraming] = useState<Framing | null | undefined>(undefined)
  const framingNow = useRef<Framing | null | undefined>(undefined)

  const video = useRef<HTMLVideoElement>(null)
  const stop = useRef<(() => void) | null>(null)
  const timer = useRef(createSteadyTimer())
  const shooting = useRef(false)
  const lastTilt = useRef<Tilt | null>(null)

  // Camera off when leaving the screen; the review image is released.
  useEffect(
    () => () => {
      stop.current?.()
      stop.current = null
    },
    [],
  )
  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot])

  const shoot = useCallback(async () => {
    if (shooting.current || !video.current) return
    shooting.current = true
    try {
      const z = zoomNow.current
      const photo = await env.grab(video.current, z)
      const url = URL.createObjectURL(new Blob([photo.jpeg as BlobPart], { type: 'image/jpeg' }))
      setShot({ photo, tilt: lastTilt.current, takenAt: new Date(env.now()).toISOString(), zoom: z, url })
      setFace(null)
      setBody(null)
      setA4(null)
      setError('')
      setStep('review')
    } catch (e) {
      setError(refusalText(e))
    } finally {
      shooting.current = false
      timer.current.reset()
      setCount(null)
    }
  }, [env])

  // Body check while the live camera is showing (slow phones: none; the photo is checked after).
  useEffect(() => {
    if (step !== 'camera' || !video.current) return
    framingNow.current = undefined
    setFraming(undefined)
    return env.watchBody(
      video.current,
      () => zoomNow.current,
      (f) => {
        framingNow.current = f
        setFraming(f)
      },
    )
  }, [step, env])

  // Level lock + body check + auto-shutter while the live camera is showing.
  useEffect(() => {
    if (step !== 'camera') return
    timer.current.reset()
    return env.watchTilt((t) => {
      lastTilt.current = t
      setTilt(t)
      if (shooting.current) return
      const f = framingNow.current
      const bodyOk = f === null || (f !== undefined && f.problem === null)
      const left = timer.current.feed(isLevel(t) && bodyOk, env.now())
      setCount(left)
      if (left === 0) void shoot()
    })
  }, [step, env, shoot])

  async function openCamera() {
    setError('')
    setBusy(true)
    try {
      // The camera tools come once, the first time (about 18 MB); then they stay on the phone.
      const ready = await env.prepare((done, total) => setGetting(done < total ? [done, total] : null))
      setGetting(null)
      if (ready === 'unsupported') {
        setError('This phone can’t take study photos: its browser is too old for the face blur. Use another phone for the photos. Consent and measurements still work on this phone.')
        return
      }
      if (ready === 'no_signal') {
        setError('The camera needs signal once to get ready. Try again when you have signal.')
        return
      }
      if (!stop.current) stop.current = await env.start(video.current!)
      else await video.current?.play().catch(() => undefined)
      setStep('camera')
    } catch {
      setError('The camera could not open. Allow the camera for this site in the browser settings, then try again.')
    } finally {
      setGetting(null)
      setBusy(false)
    }
  }

  function retake() {
    setShot(null)
    setStep('camera')
    void video.current?.play().catch(() => undefined)
  }

  /** "Is the face completely hidden?" No → the photo is thrown away, never kept. */
  function discard() {
    setShot(null)
    setError('The photo was deleted and not kept. Take it again: make sure only the participant is in the picture, whole, and facing as shown.')
    setStep('camera')
    void video.current?.play().catch(() => undefined)
  }

  async function done() {
    stop.current?.()
    stop.current = null
    try {
      await finish()
      setStep('done')
    } catch {
      setError('Could not save on this phone. Try again.')
    }
  }

  async function use() {
    if (!shot || face !== true || body !== true || a4 !== true) return
    setBusy(true)
    try {
      await save(slot, { photo: shot.photo, levelPitch: shot.tilt?.pitch ?? null, levelRoll: shot.tilt?.roll ?? null, a4Confirmed: true, faceHidden: true, takenAt: shot.takenAt, zoom: shot.zoom })
      setShot(null)
      const next = ORDER[ORDER.indexOf(slot) + 1]
      if (next) {
        setSlot(next)
        retake()
      } else await done()
    } catch {
      setError('Could not save on this phone. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const level = isLevel(tilt)
  const bodyOk = framing === null || (framing !== undefined && framing.problem === null)

  return (
    <Page>
      {step === 'ask' && (
        <>
          <Title>Measurements saved</Title>
          <p>Next: the photos (front, side, and back if possible). Every face is blurred before a photo is kept.</p>
          <Button onClick={() => setStep('setup')}>Take photos</Button>
          <Button variant="secondary" onClick={onLater}>
            Later
          </Button>
        </>
      )}

      {step === 'setup' && (
        <>
          <p className="text-sm font-semibold text-slate-600">Photos · before you start</p>
          <Title>Set up</Title>
          <SetupDrawing />
          <ul className="list-disc space-y-1 pl-5">
            <li>A plain wall behind, the floor visible. Good light from the front, not behind the person.</li>
            <li>
              <b>Nobody behind the person.</b> If people pass, wait.
            </li>
            <li>
              <b>Shoes off.</b> Close-fitting clothing if the person is comfortable; never ask anyone to undress.
            </li>
            <li>
              Stand about <b>2.5 to 3 m</b> away and <b>kneel on one knee</b>, holding the phone upright (about 1 m from the floor). Use the zoom, not your feet.
            </li>
            <li>
              A <b>plain A4 sheet</b> flat on the floor at the feet: clean, flat, no folds. Keep it in a folder; replace it when creased.
            </li>
            <li>Tell the person what you are doing before each photo.</li>
            {participant.ageGroup === 'child' && <li>The guardian stays present for every photo.</li>}
          </ul>
          <p className="text-sm text-slate-600">The phone takes each photo by itself when the whole person is in the picture and the phone is level and still for 3 seconds. Every head is blurred before anything is kept.</p>
          {getting && (
            <p role="status" className="rounded-lg bg-slate-100 p-3 text-center">
              Getting the camera ready (one time, about {CAMERA_DOWNLOAD_MB} MB)… {getting[0]} of {getting[1]}
            </p>
          )}
          {error && <ErrorText>{error}</ErrorText>}
          <Button disabled={busy} onClick={() => void openCamera()}>
            {busy ? (getting ? 'Getting the camera ready…' : 'Opening the camera…') : 'Open the camera'}
          </Button>
          <Button variant="secondary" onClick={onLater}>
            Back
          </Button>
        </>
      )}

      {/* The video stays mounted (hidden when not framing) so the camera is not re-opened for each pose. */}
      <div className={step === 'camera' ? 'flex flex-col gap-3' : 'hidden'}>
        <p className="text-sm font-semibold text-slate-600">
          {LABEL[slot]} · {ORDER.indexOf(slot) + 1} of 3
        </p>
        <p className="text-sm">{POSE_TEXT[slot]}</p>
        <p className="text-sm font-semibold">{A4_TEXT[slot]}</p>
        {/* The box shows exactly what the photo will be: the centred 3:4 area, zoomed (see frameRect). */}
        <div className="relative mx-auto overflow-hidden rounded-xl bg-black" style={{ aspectRatio: String(FRAME_ASPECT), width: `min(100%, calc(58vh * ${FRAME_ASPECT}))` }}>
          <video ref={video} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" style={{ transform: `scale(${zoom})` }} />
          <PoseGuide pose={slot} sex={participant.sex} aspect={FRAME_ASPECT} level={level && bodyOk} />
          {count !== null && count > 0 && (
            <div className="absolute inset-0 flex items-center justify-center" aria-live="assertive">
              <span className="rounded-full bg-black/60 px-8 py-4 font-mono text-7xl font-bold text-white">{count}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <button type="button" aria-label="Zoom out" disabled={zoom <= ZOOM.min} onClick={() => changeZoom(-ZOOM.step)} className="rounded-xl border-2 border-brand bg-white py-3 text-2xl font-bold text-brand disabled:opacity-40">
            −
          </button>
          <span className="text-center text-sm font-semibold" aria-live="polite">
            Zoom {zoom.toFixed(1)}×
          </span>
          <button type="button" aria-label="Zoom in" disabled={zoom >= ZOOM.max} onClick={() => changeZoom(ZOOM.step)} className="rounded-xl border-2 border-brand bg-white py-3 text-2xl font-bold text-brand disabled:opacity-40">
            +
          </button>
        </div>
        <p className="text-center text-xs text-slate-600">Zoom (don&apos;t walk closer) until the hint says the whole person is in the picture.</p>
        <div
          role="status"
          aria-label="Person"
          className={`rounded-xl border-2 p-3 text-center font-semibold ${bodyOk ? 'border-green-600 bg-green-50 text-green-800' : 'border-red-600 bg-red-50 text-red-800'}`}
        >
          {framing === undefined ? 'Looking for the person…' : framing === null ? 'This phone checks each photo after taking it.' : framingHint(framing.problem)}
        </div>
        <div role="status" aria-label="Level" className={`rounded-xl border-2 p-3 text-center font-semibold ${level ? 'border-green-600 bg-green-50 text-green-800' : 'border-red-600 bg-red-50 text-red-800'}`}>
          {levelHint(tilt)}
          {tilt && (
            <span className="block text-xs font-normal">
              forward/back {tilt.pitch.toFixed(1)}° · sideways {tilt.roll.toFixed(1)}°
            </span>
          )}
        </div>
        {step === 'camera' && error && <ErrorText>{error}</ErrorText>}
        {slot === 'back' && (
          <Button variant="secondary" onClick={() => void done()}>
            Skip back photo
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            stop.current?.()
            stop.current = null
            setStep('setup')
          }}
        >
          Back
        </Button>
      </div>

      {step === 'review' && shot && (
        <>
          <p className="text-sm font-semibold text-slate-600">{LABEL[slot]} · check</p>
          <Title>Check the photo</Title>
          <img src={shot.url} alt={`${LABEL[slot]}, head blurred`} className="mx-auto max-h-[55vh] rounded-xl border border-slate-300" />
          <Question
            label="Is the face completely hidden?"
            value={face}
            onChange={(v) => {
              setFace(v)
              if (!v) discard()
            }}
          />
          <Question label="Is the whole body visible, head to heel?" value={body} onChange={setBody} />
          {body === false && <p className="text-sm font-semibold text-red-700">Retake so the whole body is in the photo.</p>}
          <Question label="Is the A4 sheet fully visible and flat?" value={a4} onChange={setA4} />
          {a4 === false && <p className="text-sm font-semibold text-red-700">Lay the sheet flat (no folds) where shown, then retake.</p>}
          {error && <ErrorText>{error}</ErrorText>}
          <Button disabled={busy || face !== true || body !== true || a4 !== true} onClick={() => void use()}>
            Use photo
          </Button>
          <Button variant="secondary" onClick={retake}>
            Back: retake
          </Button>
        </>
      )}

      {step === 'done' && (
        <>
          <Title>Photos saved</Title>
          <p>They are kept on this phone and sent when there is a connection. Consent, measurements and photos are complete for this participant.</p>
          <Button onClick={onDone}>Back to the list</Button>
        </>
      )}
    </Page>
  )
}

function Question({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-semibold">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <Choice chosen={value === true} onClick={() => onChange(true)}>
          Yes
        </Choice>
        <Choice chosen={value === false} onClick={() => onChange(false)}>
          No
        </Choice>
      </div>
    </fieldset>
  )
}

/** Simple set-up drawing: wall, floor, person with the A4 sheet, phone upright 2.5–3 m away at ~1 m. */
function SetupDrawing() {
  return (
    <svg viewBox="0 0 360 170" className="w-full rounded-xl border border-slate-300 bg-white" role="img" aria-label="Set-up: person against a plain wall, A4 sheet at the feet, phone upright 2.5 to 3 metres away at about 1 metre high">
      <rect x="0" y="0" width="60" height="140" fill="#e2e8f0" />
      <text x="30" y="20" textAnchor="middle" fontSize="11" fill="#334155">wall</text>
      <line x1="0" y1="140" x2="360" y2="140" stroke="#334155" strokeWidth="2" />
      {/* person */}
      <circle cx="85" cy="42" r="9" fill="none" stroke="#0f172a" strokeWidth="2" />
      <line x1="85" y1="51" x2="85" y2="100" stroke="#0f172a" strokeWidth="2" />
      <line x1="85" y1="100" x2="78" y2="140" stroke="#0f172a" strokeWidth="2" />
      <line x1="85" y1="100" x2="92" y2="140" stroke="#0f172a" strokeWidth="2" />
      <line x1="85" y1="62" x2="72" y2="88" stroke="#0f172a" strokeWidth="2" />
      <line x1="85" y1="62" x2="98" y2="88" stroke="#0f172a" strokeWidth="2" />
      {/* A4 */}
      <rect x="96" y="136" width="26" height="4" fill="#fff" stroke="#0f172a" />
      <text x="109" y="156" textAnchor="middle" fontSize="10" fill="#334155">A4</text>
      {/* phone at ~1 m */}
      <rect x="300" y="78" width="9" height="16" rx="2" fill="#0f172a" />
      <line x1="304" y1="94" x2="304" y2="140" stroke="#94a3b8" strokeDasharray="3 3" />
      <text x="318" y="120" fontSize="10" fill="#334155">≈ 1 m</text>
      {/* distance */}
      <line x1="92" y1="162" x2="304" y2="162" stroke="#334155" markerEnd="url(#arr)" markerStart="url(#arr)" />
      <text x="198" y="158" textAnchor="middle" fontSize="11" fill="#334155">2.5 – 3 m</text>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#334155" />
        </marker>
      </defs>
    </svg>
  )
}
