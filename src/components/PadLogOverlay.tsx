/** Shows the hidden diagnostic log (src/lib/padLog.ts) at the bottom of the screen. */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { describeElement, padLog, padLogLines, subscribePadLog } from '../lib/padLog'

let version = 0
const subscribe = (fn: () => void) =>
  subscribePadLog(() => {
    version++
    fn()
  })

export function PadLogOverlay() {
  useSyncExternalStore(subscribe, () => version)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Where each touch lands (element type only), and when the keyboard opens or closes.
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0] ?? e.changedTouches[0]
      const under = t ? document.elementFromPoint(t.clientX, t.clientY) : null
      padLog(`touch on ${describeElement(e.target)} · under finger ${describeElement(under)}`)
    }
    const vv = window.visualViewport
    let lastH = vv?.height ?? 0
    const onResize = () => {
      const h = vv?.height ?? 0
      if (Math.abs(h - lastH) > 80) {
        padLog(h < lastH ? `keyboard opened (view ${Math.round(h)})` : `keyboard closed (view ${Math.round(h)})`)
        lastH = h
      }
    }
    const onVisibility = () => padLog(`page ${document.visibilityState}`)
    document.addEventListener('touchstart', onTouch, { capture: true, passive: true })
    vv?.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    padLog(`log on · ${navigator.userAgent.match(/(iPhone OS [\d_]+|Android [\d.]+|Windows|Mac OS X [\d_]+)/)?.[0] ?? 'device'}`)
    return () => {
      document.removeEventListener('touchstart', onTouch, { capture: true })
      vv?.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const lines = padLogLines()
  return (
    <div
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, maxHeight: open ? '40vh' : 'auto', overflowY: 'auto' }}
      className="border-t-2 border-amber-500 bg-amber-50 p-2 font-mono text-[11px] leading-4 text-slate-900"
    >
      <div className="flex items-center justify-between">
        <b>Diagnostic log (no names or values)</b>
        <button type="button" className="rounded border border-slate-400 bg-white px-2" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && [...lines].reverse().map((l, i) => <div key={lines.length - i}>{l}</div>)}
    </div>
  )
}
