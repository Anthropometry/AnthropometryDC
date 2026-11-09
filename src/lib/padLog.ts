/**
 * Temporary, hidden diagnostic log for the iPhone signature problem (F4). OFF for everyone.
 * Turned on only for this browser tab by opening the app with `?pad-log` (and off with
 * `?pad-log-off`). It records events and states, never what anyone types: no names, no phone
 * numbers, no signatures. Nothing is sent anywhere; it is shown on screen only.
 * To be removed once the cause is fixed.
 */
const KEY = 'anthro-collect.pad-log'
const MAX = 80

function readSwitch(): boolean {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.has('pad-log-off')) window.sessionStorage.removeItem(KEY)
    else if (q.has('pad-log')) window.sessionStorage.setItem(KEY, '1')
    return window.sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const padLogOn: boolean = typeof window !== 'undefined' && readSwitch()

const lines: string[] = []
const subscribers = new Set<() => void>()

export function padLog(message: string): void {
  if (!padLogOn) return
  lines.push(`${(performance.now() / 1000).toFixed(2)}s ${message}`)
  if (lines.length > MAX) lines.shift()
  subscribers.forEach((s) => s())
}

export function padLogLines(): readonly string[] {
  return lines
}

export function subscribePadLog(fn: () => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

/** "canvas[Participant's signature]", "input[checkbox]", "p" … never text content or values. */
export function describeElement(el: EventTarget | null): string {
  if (!(el instanceof Element)) return el === null ? 'nothing' : 'non-element'
  const tag = el.tagName.toLowerCase()
  const label = el.getAttribute('aria-label') ?? (tag === 'input' ? el.getAttribute('type') : null)
  return label ? `${tag}[${label}]` : tag
}
