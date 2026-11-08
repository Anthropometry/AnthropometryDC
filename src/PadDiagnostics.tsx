/**
 * DIAGNOSTIC PAGE ONLY (open with ?pad-test). Not linked from the app, no login, no data saved or
 * sent. It shows what an iPhone does with the signature box, to find why signing fails there.
 *   A = the app's real SignaturePad, with every event the canvas receives logged.
 *   B = a minimal box drawn from raw touch events (non-passive listeners), as signature libraries do.
 */
import { useEffect, useRef, useState } from 'react'
import { SignaturePad } from './components/SignaturePad'

const EVENTS = [
  'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerout', 'pointerleave',
  'gotpointercapture', 'lostpointercapture', 'touchstart', 'touchmove', 'touchend', 'touchcancel',
] as const

function useLog() {
  const [lines, setLines] = useState<string[]>([])
  const counts = useRef<Record<string, number>>({})
  const add = (s: string) => setLines((l) => [...l.slice(-39), s])
  return { lines, add, counts }
}

export function PadDiagnostics() {
  const a = useLog()
  const wrapA = useRef<HTMLDivElement | null>(null)
  const [aResult, setAResult] = useState('nothing yet')
  const [moves, setMoves] = useState<Record<string, number>>({})

  // Log what box A's canvas receives (moves are counted, not listed).
  useEffect(() => {
    const c = wrapA.current?.querySelector('canvas')
    if (!c) return
    const handler = (e: Event) => {
      const pe = e as PointerEvent
      if (e.type === 'pointermove' || e.type === 'touchmove') {
        setMoves((m) => ({ ...m, [e.type]: (m[e.type] ?? 0) + 1 }))
        return
      }
      const extra = 'pointerType' in pe ? ` ${pe.pointerType} id=${pe.pointerId}` : ''
      a.add(`${(performance.now() / 1000).toFixed(2)}s ${e.type}${extra}${e.cancelable ? '' : ' (not cancelable)'}`)
    }
    EVENTS.forEach((t) => c.addEventListener(t, handler, { passive: true }))
    return () => EVENTS.forEach((t) => c.removeEventListener(t, handler))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attach once
  }, [])

  // Box B: raw touch events, preventDefault so the page never scrolls while signing.
  const canvasB = useRef<HTMLCanvasElement | null>(null)
  const [bResult, setBResult] = useState('nothing yet')
  useEffect(() => {
    const c = canvasB.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    g.lineWidth = 4
    g.lineCap = 'round'
    g.strokeStyle = '#0f172a'
    let down = false
    let points = 0
    const at = (t: Touch | MouseEvent) => {
      const r = c.getBoundingClientRect()
      return [((t.clientX - r.left) * c.width) / r.width, ((t.clientY - r.top) * c.height) / r.height] as const
    }
    const start = (x: number, y: number) => {
      down = true
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + 0.1, y + 0.1)
      g.stroke()
      points++
    }
    const move = (x: number, y: number) => {
      if (!down) return
      g.lineTo(x, y)
      g.stroke()
      points++
    }
    const end = () => {
      if (!down) return
      down = false
      setBResult(`stroke ended, ${points} points drawn`)
    }
    const ts = (e: TouchEvent) => {
      e.preventDefault()
      start(...at(e.touches[0]))
    }
    const tm = (e: TouchEvent) => {
      e.preventDefault()
      move(...at(e.touches[0]))
    }
    const te = (e: TouchEvent) => {
      e.preventDefault()
      end()
    }
    const md = (e: MouseEvent) => start(...at(e))
    const mm = (e: MouseEvent) => move(...at(e))
    c.addEventListener('touchstart', ts, { passive: false })
    c.addEventListener('touchmove', tm, { passive: false })
    c.addEventListener('touchend', te, { passive: false })
    c.addEventListener('touchcancel', te, { passive: false })
    c.addEventListener('mousedown', md)
    c.addEventListener('mousemove', mm)
    window.addEventListener('mouseup', end)
    return () => {
      c.removeEventListener('touchstart', ts)
      c.removeEventListener('touchmove', tm)
      c.removeEventListener('touchend', te)
      c.removeEventListener('touchcancel', te)
      c.removeEventListener('mousedown', md)
      c.removeEventListener('mousemove', mm)
      window.removeEventListener('mouseup', end)
    }
  }, [])

  const css = (sel: string) => {
    const el = document.querySelector(sel)
    return el ? getComputedStyle(el).touchAction : 'n/a'
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6 text-slate-900">
      <h1 className="text-xl font-bold">Signature test (diagnostic)</h1>
      <p className="text-sm text-slate-600">
        Nothing here is saved or sent. Draw one line in box A, then one in box B, then take a screenshot of the whole
        page (scroll down for the log).
      </p>

      <section ref={wrapA} className="flex flex-col gap-2 rounded-xl border-2 border-sky-300 p-3">
        <h2 className="font-semibold">Box A: the app&apos;s signature box</h2>
        <SignaturePad label="Box A" onChange={(png) => setAResult(png ? `image ready, ${png.length} bytes` : 'cleared / no image')} />
        <p className="text-sm">
          <b>A result:</b> {aResult}
        </p>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border-2 border-violet-300 p-3">
        <h2 className="font-semibold">Box B: raw touch drawing</h2>
        <canvas ref={canvasB} width={600} height={240} className="w-full rounded-xl border-2 border-slate-300 bg-white" style={{ touchAction: 'none' }} />
        <p className="text-sm">
          <b>B result:</b> {bResult}
        </p>
      </section>

      <section className="rounded-xl bg-slate-100 p-3 font-mono text-xs leading-5">
        <p>UA: {navigator.userAgent}</p>
        <p>
          PointerEvent: {typeof PointerEvent !== 'undefined' ? 'yes' : 'no'} · touch points: {navigator.maxTouchPoints} ·
          standalone: {String((navigator as Navigator & { standalone?: boolean }).standalone ?? false)}
        </p>
        <p>touch-action on A canvas: {css('section canvas')}</p>
        <p>
          moves counted on A: pointermove {moves.pointermove ?? 0} · touchmove {moves.touchmove ?? 0}
        </p>
        <p className="mt-2 font-bold">Box A events (latest 40):</p>
        {a.lines.length === 0 ? <p>none yet</p> : a.lines.map((l, i) => <p key={i}>{l}</p>)}
      </section>
    </main>
  )
}
