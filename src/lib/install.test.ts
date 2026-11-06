import { describe, expect, it } from 'vitest'
import { installMode, isIOS } from './install'

const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  iphoneWhatsApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.24',
  ipadAsMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
}

const mode = (userAgent: string, extra: { standalone?: boolean; hasPrompt?: boolean; maxTouchPoints?: number } = {}) =>
  installMode({ userAgent, standalone: false, hasPrompt: false, ...extra })

describe('installMode', () => {
  it('installed app shows nothing, on every phone', () => {
    expect(mode(UA.androidChrome, { standalone: true, hasPrompt: true })).toBe('installed')
    expect(mode(UA.iphoneSafari, { standalone: true })).toBe('installed')
  })
  it('Android Chrome with the install prompt → button', () => {
    expect(mode(UA.androidChrome, { hasPrompt: true })).toBe('android-button')
  })
  it('Android without the prompt yet → menu hint', () => {
    expect(mode(UA.androidChrome)).toBe('android-menu')
  })
  it('iPhone Safari → picture guide', () => {
    expect(mode(UA.iphoneSafari)).toBe('ios-safari')
  })
  it.each([UA.iphoneChrome, UA.iphoneWhatsApp])('iPhone other browser or in-app browser → open in Safari', (ua) => {
    expect(mode(ua)).toBe('ios-other-browser')
  })
  it('iPad that reports itself as a Mac → treated as iOS', () => {
    expect(isIOS({ userAgent: UA.ipadAsMac, maxTouchPoints: 5 })).toBe(true)
    expect(mode(UA.ipadAsMac, { maxTouchPoints: 5 })).toBe('ios-safari')
    expect(isIOS({ userAgent: UA.ipadAsMac, maxTouchPoints: 0 })).toBe(false)
  })
  it('desktop → general hint, or the button if the browser offers a prompt', () => {
    expect(mode(UA.desktop)).toBe('other')
    expect(mode(UA.desktop, { hasPrompt: true })).toBe('android-button')
  })
})
