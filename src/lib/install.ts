/** Which install help to show (specs/F1-login.md, screen 5). Pure, so it is easy to test. */

export type InstallMode =
  | 'installed' // already running from the Home Screen: show nothing
  | 'android-button' // Chrome offered its prompt: show the Install app button
  | 'android-menu' // Android, no prompt yet: "Tap ⋮ → Add to Home screen"
  | 'ios-safari' // iPhone/iPad in Safari: picture guide
  | 'ios-other-browser' // iPhone/iPad in Chrome, Firefox…: "Open this link in Safari"
  | 'other' // computers and anything else: short general hint

export interface InstallEnv {
  userAgent: string
  standalone: boolean // display-mode: standalone, or navigator.standalone on iOS
  hasPrompt: boolean // a beforeinstallprompt event was captured
  maxTouchPoints?: number // iPadOS reports itself as a Mac; touch points give it away
}

export function isIOS(env: Pick<InstallEnv, 'userAgent' | 'maxTouchPoints'>): boolean {
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return true
  return /Macintosh/i.test(env.userAgent) && (env.maxTouchPoints ?? 0) > 1
}

export function installMode(env: InstallEnv): InstallMode {
  if (env.standalone) return 'installed'
  if (isIOS(env)) {
    // Every iOS browser is WebKit, but only Safari has "Add to Home Screen" reliably.
    return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|WhatsApp/i.test(env.userAgent)
      ? 'ios-other-browser'
      : 'ios-safari'
  }
  if (env.hasPrompt) return 'android-button'
  if (/Android/i.test(env.userAgent)) return 'android-menu'
  return 'other'
}
