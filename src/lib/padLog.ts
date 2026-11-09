/**
 * Temporary, hidden diagnostic log for the iPhone signature problem (F4). OFF for everyone.
 * Switched on for this browser tab only, by opening the app with:
 *   ?pad-log        record and show the log panel (adds a bar and page-wide touch logging)
 *   ?pad-log=quiet  record silently: nothing is added to the screen or the page
 *   ?pad-log=show   show the panel again, with what was recorded so far in this tab
 *   ?pad-log-off    stop and forget
 * It records events and states, never what anyone types: no names, no phone numbers, no
 * signatures. Nothing is sent anywhere. To be removed once the cause is fixed.
 */
const KEY = 'anthro-collect.pad-log'
const LINES_KEY = 'anthro-collect.pad-log-lines'
const MAX = 120

export type PadLogMode = 'off' | 'quiet' | 'show'

function readMode(): PadLogMode {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.has('pad-log-off')) {
      window.sessionStorage.removeItem(KEY)
      window.sessionStorage.removeItem(LINES_KEY)
    } else if (q.has('pad-log')) {
      window.sessionStorage.setItem(KEY, q.get('pad-log') === 'quiet' ? 'quiet' : 'show')
    }
    const m = window.sessionStorage.getItem(KEY)
    return m === 'quiet' || m === 'show' ? m : 'off'
  } catch {
    return 'off'
  }
}

export const padLogMode: PadLogMode = typeof window !== 'undefined' ? readMode() : 'off'
export const padLogOn = padLogMode !== 'off'
/** Only in "show" mode does the app add the panel and the page-wide touch and keyboard logging. */
export const padLogPanelOn = padLogMode === 'show'

/** Lines survive a reload in the same tab, so a quiet run can be read afterwards with =show. */
const lines: string[] = (() => {
  if (!padLogOn) return []
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(LINES_KEY) ?? '[]') as unknown
    return Array.isArray(saved) ? saved.filter((l): l is string => typeof l === 'string').slice(-MAX) : []
  } catch {
    return []
  }
})()
const subscribers = new Set<() => void>()

export function padLog(message: string): void {
  if (!padLogOn) return
  lines.push(`${new Date().toISOString().slice(11, 19)} ${message}`)
  if (lines.length > MAX) lines.shift()
  try {
    window.sessionStorage.setItem(LINES_KEY, JSON.stringify(lines))
  } catch {
    // keep in memory only
  }
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
