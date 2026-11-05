/**
 * Cloudflare Turnstile check for Join and Sign in. Supabase enforces it on the server.
 * The script loads only on these screens and is never cached by the service worker.
 */
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string
      reset(id?: string): void
      remove(id?: string): void
    }
  }
}

/** Cloudflare's published test key (always passes). Used only in local development. */
const DEV_TEST_SITE_KEY = '1x00000000000000000000AA'

export const turnstileSiteKey: string | undefined =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? DEV_TEST_SITE_KEY : undefined)

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_URL
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      scriptPromise = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export interface CaptchaProps {
  /** Called with a fresh token, or '' when it expires or fails. */
  onToken: (token: string) => void
  /** Change this number to get a new check (each token works once). */
  resetKey: number
}

export function Turnstile({ onToken, resetKey }: CaptchaProps) {
  const box = useRef<HTMLDivElement>(null)
  const tokenCb = useRef(onToken)

  useEffect(() => {
    tokenCb.current = onToken
  }, [onToken])

  useEffect(() => {
    if (!turnstileSiteKey || !box.current) return
    let id: string | undefined
    let cancelled = false
    onToken('')
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return
        id = window.turnstile.render(box.current, {
          sitekey: turnstileSiteKey,
          callback: (t: string) => tokenCb.current(t),
          'expired-callback': () => tokenCb.current(''),
          'error-callback': () => tokenCb.current(''),
        })
      })
      .catch(() => tokenCb.current(''))
    return () => {
      cancelled = true
      if (id && window.turnstile) window.turnstile.remove(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-render the widget only on reset
  }, [resetKey])

  if (!turnstileSiteKey) {
    return <p className="text-sm text-red-700">Sign-in is not set up yet (safety check key missing).</p>
  }
  return <div ref={box} className="min-h-[65px]" aria-label="Safety check" />
}
