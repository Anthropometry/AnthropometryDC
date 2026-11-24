/**
 * The phone's own Back (Android back button or gesture, iPhone swipe in the installed app) goes back
 * one screen instead of closing the app. The app has no page addresses; it switches views in memory.
 * So while any screen other than Home is open, one extra browser history entry is kept: Back removes
 * it, and the app goes to the parent screen (pushing the entry again if that is not Home either).
 * Work in progress is never lost: every step is saved on the phone as it is entered.
 */
import { useEffect, useRef } from 'react'

export interface HistoryLike {
  readonly state: unknown
  pushState: (data: unknown, unused: string) => void
  back: () => void
}

export interface WindowLike {
  history: HistoryLike
  addEventListener: (type: 'popstate', fn: () => void) => void
  removeEventListener: (type: 'popstate', fn: () => void) => void
}

const MARK = { anthroBack: true }
const isMark = (s: unknown) => !!s && typeof s === 'object' && (s as { anthroBack?: unknown }).anthroBack === true

/**
 * Keeps the extra history entry in step with the view. `parentOf` says where Back goes; `home` is the
 * screen where Back may close the app.
 */
export function useBackButton<V extends string>(view: V, setView: (v: V) => void, parentOf: (v: V) => V, home: V, win: WindowLike | undefined = typeof window !== 'undefined' ? window : undefined) {
  const current = useRef(view)
  const ignoreNext = useRef(false)

  useEffect(() => {
    current.current = view
    if (!win) return
    const h = win.history
    if (view !== home && !isMark(h.state)) h.pushState(MARK, '')
    if (view === home && isMark(h.state)) {
      // Back on screen (e.g. "Back to Home"): drop the extra entry so the next phone Back can leave.
      ignoreNext.current = true
      h.back()
    }
  }, [view, home, win])

  useEffect(() => {
    if (!win) return
    const onPop = () => {
      if (ignoreNext.current) {
        ignoreNext.current = false
        return
      }
      const v = current.current
      if (v === home) return
      setView(parentOf(v))
    }
    win.addEventListener('popstate', onPop)
    return () => win.removeEventListener('popstate', onPop)
  }, [win, home, setView, parentOf])
}
