/**
 * DIAGNOSTIC ONLY (part of ?pad-test). Box C: the app's real consent screen (ConsentFlow) with the
 * real SignaturePad, wrapped so we can see on an iPhone whether the box is rebuilt, which events it
 * gets, and which element each touch on the page lands on. Nothing is saved or sent.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ConsentFlow } from './screens/Consent'
import { consentText } from './lib/consentText'
import { SignaturePad, type PadProps } from './components/SignaturePad'

const lines: string[] = []
let listeners: (() => void)[] = []
const t = () => (performance.now() / 1000).toFixed(2) + 's'
function log(s: string) {
  lines.push(`${t()} ${s}`)
  if (lines.length > 60) lines.shift()
  listeners.forEach((l) => l())
}

function describe(el: EventTarget | null): string {
  if (!(el instanceof Element)) return String(el)
  const label = el.getAttribute('aria-label') ?? el.getAttribute('type') ?? ''
  return `${el.tagName.toLowerCase()}${label ? `[${label}]` : ''}`
}

let mounts = 0

/** The real SignaturePad, plus logging. Passed to ConsentFlow as its Pad. */
function DiagPad(props: PadProps) {
  const wrap = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    mounts++
    log(`PAD MOUNTED (#${mounts}) "${props.label}"`)
    const c = wrap.current?.querySelector('canvas')
    const types = ['pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture', 'touchstart', 'touchend', 'touchcancel']
    let moves = 0
    const onMove = () => {
      moves++
    }
    const h = (e: Event) => {
      const pe = e as PointerEvent
      log(`canvas ${e.type}${'pointerType' in pe ? ' ' + pe.pointerType : ''}${e.type.endsWith('up') || e.type.endsWith('end') ? ` (moves so far ${moves})` : ''}`)
    }
    types.forEach((ty) => c?.addEventListener(ty, h, { passive: true }))
    c?.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      log(`PAD REMOVED "${props.label}"`)
      types.forEach((ty) => c?.removeEventListener(ty, h))
      c?.removeEventListener('pointermove', onMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, [])
  return (
    <div ref={wrap}>
      <SignaturePad
        label={props.label}
        onChange={(png) => {
          log(`pad onChange: ${png ? png.length + ' bytes' : 'null'}`)
          props.onChange(png)
        }}
      />
    </div>
  )
}

export function BoxC(): ReactNode {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.push(l)
    // Where does each touch on the page land, and was the page scrolled by it?
    const onDocTouch = (e: TouchEvent) => {
      const touch = e.touches[0] ?? e.changedTouches[0]
      const under = touch ? document.elementFromPoint(touch.clientX, touch.clientY) : null
      log(`page touchstart on ${describe(e.target)} · element under finger: ${describe(under)} · scrollY ${Math.round(scrollY)}`)
    }
    const onFocus = (e: FocusEvent) => log(`focus ${describe(e.target)}`)
    const onBlur = (e: FocusEvent) => log(`blur ${describe(e.target)}`)
    const vv = window.visualViewport
    const onVv = () => log(`viewport height ${Math.round(vv?.height ?? 0)} (keyboard?)`)
    document.addEventListener('touchstart', onDocTouch, { capture: true, passive: true })
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    vv?.addEventListener('resize', onVv)
    return () => {
      listeners = listeners.filter((x) => x !== l)
      document.removeEventListener('touchstart', onDocTouch, { capture: true })
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
      vv?.removeEventListener('resize', onVv)
    }
  }, [])

  return (
    <section className="flex flex-col gap-2 rounded-xl border-2 border-emerald-400 p-3">
      <h2 className="font-semibold">Box C: the app&apos;s consent screen</h2>
      <p className="text-sm text-slate-600">
        Do it like in the app: Adult → Next → tick both → type a name → sign. Then screenshot this box and its log.
      </p>
      <div className="rounded-xl border border-slate-200">
        <ConsentFlow
          isPractice
          text={consentText('practice')!}
          collectorId="diagnostic"
          Pad={DiagPad}
          onSave={async () => {
            log('SAVE pressed: would save (nothing is stored on this test page)')
          }}
          onDone={() => log('done')}
          onBack={() => log('back')}
        />
      </div>
      <div className="rounded-xl bg-slate-100 p-3 font-mono text-xs leading-5">
        <p className="font-bold">Box C log (latest 60):</p>
        {lines.length === 0 ? <p>none yet</p> : lines.map((l, i) => <p key={i}>{l}</p>)}
      </div>
    </section>
  )
}
