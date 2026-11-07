/**
 * Finger signature (F4). Draws on a canvas and hands back PNG bytes; nothing leaves the phone
 * from here. The image is kept only in the offline queue until the server confirms it.
 */
import { useEffect, useRef, useState } from 'react'

export interface PadProps {
  label: string
  onChange: (png: Uint8Array | null) => void
}

export function SignaturePad({ label, onChange }: PadProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const [signed, setSigned] = useState(false)

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget
    const r = c.getBoundingClientRect()
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height] as const
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const [x, y] = point(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const [x, y] = point(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    setSigned(true)
    canvas.current?.toBlob((blob) => {
      if (!blob) return onChange(null)
      void blob.arrayBuffer().then((b) => onChange(new Uint8Array(b)))
    }, 'image/png')
  }

  function clear() {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (c && ctx) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, c.width, c.height)
    }
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
        className="w-full touch-none rounded-xl border-2 border-slate-300 bg-white"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{signed ? 'Signed.' : 'Sign with your finger in the box.'}</span>
        <button type="button" onClick={clear} className="rounded-lg border-2 border-slate-300 bg-white px-3 py-1 font-semibold">
          Clear
        </button>
      </div>
    </div>
  )
}
