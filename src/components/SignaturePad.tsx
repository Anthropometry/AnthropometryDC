/**
 * Finger signature (F4). Draws on a canvas and hands back PNG bytes; nothing leaves the phone
 * from here. The image is kept only in the offline queue until the server confirms it.
 *
 * Fingers are drawn from TOUCH events, listened to on the canvas itself (not passive), and each
 * touch is claimed with preventDefault so the browser never turns it into scrolling. Ryan's iPhone
 * logs (9 Nov, see DISCUSSION.md) showed why: drawing from pointer events alone, Safari delivered
 * only the first touch (no movement) and then nothing in the app.
 * Mouse and pen still use pointer events. PNG export falls back to a data URL.
 */
import { useEffect, useRef, useState } from 'react'

export interface PadProps {
  label: string
  onChange: (png: Uint8Array | null) => void
}

/** "data:image/png;base64,…" → bytes. */
export function dataUrlToBytes(url: string): Uint8Array | null {
  const m = url.match(/^data:image\/png;base64,(.+)$/)
  if (!m) return null
  const bin = atob(m[1])
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** PNG bytes of the canvas: toBlob first, data URL if that isn't available or fails. */
export function canvasToPng(c: HTMLCanvasElement): Promise<Uint8Array | null> {
  const fallback = () => {
    try {
      return dataUrlToBytes(c.toDataURL('image/png'))
    } catch {
      return null
    }
  }
  return new Promise((resolve) => {
    if (typeof c.toBlob !== 'function') return resolve(fallback())
    try {
      c.toBlob((blob) => {
        if (!blob || typeof blob.arrayBuffer !== 'function') return resolve(fallback())
        blob.arrayBuffer().then(
          (b) => resolve(new Uint8Array(b)),
          () => resolve(fallback()),
        )
      }, 'image/png')
    } catch {
      resolve(fallback())
    }
  })
}

const hasTouch = () => typeof window !== 'undefined' && 'ontouchstart' in window

export function SignaturePad({ label, onChange }: PadProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const drew = useRef(false)
  const moves = useRef(0)
  const [signed, setSigned] = useState(false)
  // The latest onChange, for the native touch listeners (attached once).
  const changed = useRef(onChange)
  useEffect(() => {
    changed.current = onChange
  })

  const ctx = () => {
    const g = canvas.current?.getContext('2d') ?? null
    if (g) {
      g.lineWidth = 4
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.strokeStyle = '#0f172a'
    }
    return g
  }

  const toCanvas = (clientX: number, clientY: number) => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    const w = r.width || c.width
    const h = r.height || c.height
    return [((clientX - r.left) * c.width) / w, ((clientY - r.top) * c.height) / h] as const
  }

  // Stroke steps shared by touch and pointer input. Kept in a ref so the native listeners,
  // attached once, always call the current versions.
  const stroke = useRef({
    start(clientX: number, clientY: number) {
      drawing.current = true
      moves.current = 0
      const g = ctx()
      if (!g) return
      const [x, y] = toCanvas(clientX, clientY)
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + 0.1, y + 0.1)
      g.stroke()
      drew.current = true
    },
    move(clientX: number, clientY: number) {
      if (!drawing.current) return
      moves.current++
      const g = ctx()
      if (!g) return
      const [x, y] = toCanvas(clientX, clientY)
      g.lineTo(x, y)
      g.stroke()
    },
    end() {
      if (!drawing.current) return
      drawing.current = false
      if (!drew.current || !canvas.current) return
      void canvasToPng(canvas.current).then((png) => {
        setSigned(png !== null)
        changed.current(png)
      })
    },
  })

  const blank = () => {
    const c = canvas.current
    const g = c?.getContext('2d')
    if (c && g) {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, c.width, c.height)
    }
  }

  useEffect(() => {
    blank()
    const c = canvas.current
    if (!c) return
    const s = stroke.current
    // Touch: claim the touch (preventDefault, not passive) so it draws instead of scrolling.
    const touchStart = (e: TouchEvent) => {
      e.preventDefault()
      // Close the keyboard if the name field still has it open.
      if (document.activeElement instanceof HTMLElement && document.activeElement !== c) document.activeElement.blur()
      const t = e.touches[0]
      if (t && e.touches.length === 1) s.start(t.clientX, t.clientY)
    }
    const touchMove = (e: TouchEvent) => {
      e.preventDefault()
      const t = e.touches[0]
      if (t) s.move(t.clientX, t.clientY)
    }
    const touchEnd = (e: TouchEvent) => {
      e.preventDefault()
      s.end()
    }
    c.addEventListener('touchstart', touchStart, { passive: false })
    c.addEventListener('touchmove', touchMove, { passive: false })
    c.addEventListener('touchend', touchEnd, { passive: false })
    c.addEventListener('touchcancel', touchEnd, { passive: false })
    return () => {
      c.removeEventListener('touchstart', touchStart)
      c.removeEventListener('touchmove', touchMove)
      c.removeEventListener('touchend', touchEnd)
      c.removeEventListener('touchcancel', touchEnd)
    }
  }, [])

  // Mouse and pen (and touch on devices without touch events) use pointer events.
  const isFingerHandledByTouch = (e: React.PointerEvent) => e.pointerType === 'touch' && hasTouch()

  function pointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (isFingerHandledByTouch(e)) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Optional: without capture we still draw, and leaving the box ends the stroke.
    }
    stroke.current.start(e.clientX, e.clientY)
  }
  function pointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (isFingerHandledByTouch(e)) return
    stroke.current.move(e.clientX, e.clientY)
  }
  function pointerEnd(e: React.PointerEvent<HTMLCanvasElement>) {
    if (isFingerHandledByTouch(e)) return
    stroke.current.end()
  }

  function clear() {
    blank()
    drew.current = false
    setSigned(false)
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">{label}</p>
      <canvas
        ref={canvas}
        width={600}
        height={240}
        aria-label={label}
        className="w-full touch-none select-none rounded-xl border-2 border-slate-300 bg-white"
        style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
        onPointerLeave={pointerEnd}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500" role="status">
          {signed ? 'Signed.' : 'Sign with your finger in the box.'}
        </span>
        <button type="button" onClick={clear} className="rounded-lg border-2 border-slate-300 bg-white px-3 py-1 font-semibold">
          Clear
        </button>
      </div>
    </div>
  )
}
