/**
 * Finger signature (F4). Draws on a canvas and hands back PNG bytes; nothing leaves the phone
 * from here. The image is kept only in the offline queue until the server confirms it.
 *
 * Robust on phones: pointer capture is optional (Safari may refuse it), a stroke that ends outside
 * the box still counts, and if the browser can't export a PNG blob we fall back to a data URL.
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

export function SignaturePad({ label, onChange }: PadProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const drew = useRef(false)
  const [signed, setSigned] = useState(false)

  const ctx = () => {
    const c = canvas.current?.getContext('2d') ?? null
    if (c) {
      c.lineWidth = 4
      c.lineCap = 'round'
      c.lineJoin = 'round'
      c.strokeStyle = '#0f172a'
    }
    return c
  }

  const blank = () => {
    const c = canvas.current
    const g = c?.getContext('2d')
    if (c && g) {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, c.width, c.height)
    }
  }

  useEffect(blank, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget
    const r = c.getBoundingClientRect()
    const w = r.width || c.width
    const h = r.height || c.height
    return [((e.clientX - r.left) * c.width) / w, ((e.clientY - r.top) * c.height) / h] as const
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    drawing.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Optional: without capture we still draw, and leaving the box ends the stroke.
    }
    const g = ctx()
    if (!g) return
    const [x, y] = point(e)
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 0.1, y + 0.1)
    g.stroke()
    drew.current = true
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    e.preventDefault()
    const g = ctx()
    if (!g) return
    const [x, y] = point(e)
    g.lineTo(x, y)
    g.stroke()
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    if (!drew.current || !canvas.current) return
    void canvasToPng(canvas.current).then((png) => {
      setSigned(png !== null)
      onChange(png)
    })
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
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
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
