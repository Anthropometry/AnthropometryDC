import { describe, expect, it } from 'vitest'
import { CAMERA_CACHE_NAME, pwaOptions } from '../pwa.config'
import { CAMERA_CACHE, CAMERA_FILES } from './lib/cameraFiles'

type Rule = { urlPattern: (o: { url: URL; sameOrigin: boolean }) => boolean; handler: string; options?: { cacheName?: string } }
const rules = (pwaOptions.workbox?.runtimeCaching ?? []) as unknown as Rule[]
const cached = (href: string, sameOrigin = true) => rules.some((r) => r.urlPattern({ url: new URL(href), sameOrigin }))

describe('service worker caching', () => {
  it('DENY: /api, Supabase and Turnstile are never served from cache', () => {
    expect(cached('https://app.example/api/photos/x/front')).toBe(false)
    expect(cached('https://app.example/api/login')).toBe(false)
    expect(cached('https://abc.supabase.co/rest/v1/participants', false)).toBe(false)
    expect(cached('https://challenges.cloudflare.com/turnstile/v0/api.js', false)).toBe(false)
    expect(cached('https://evil.example/models/pose_landmarker_lite.task', false)).toBe(false) // same origin only
  })

  it('F6 Amendment A: only the camera tools have a runtime cache, the same one they are downloaded into', () => {
    expect(rules).toHaveLength(1)
    expect(rules[0].handler).toBe('CacheFirst')
    expect(rules[0].options?.cacheName).toBe(CAMERA_CACHE)
    expect(CAMERA_CACHE_NAME).toBe(CAMERA_CACHE)
    for (const f of CAMERA_FILES) expect(cached(`https://app.example${f}`)).toBe(true)
  })

  it('the install does not precache the camera tools (about 18 MB): downloaded on first camera use', () => {
    const globs = pwaOptions.workbox?.globPatterns ?? []
    expect(globs.join()).not.toMatch(/wasm|tflite|task/)
    expect(pwaOptions.workbox?.globIgnores).toEqual(expect.arrayContaining(['mediapipe/**', 'models/**']))
  })

  it('precaches only local build files', () => {
    for (const p of pwaOptions.workbox?.globPatterns ?? []) expect(p).not.toMatch(/https?:/)
  })

  it('never answers /api navigations from cache', () => {
    const deny = pwaOptions.workbox?.navigateFallbackDenylist ?? []
    expect(deny.some((r) => r.test('/api/login'))).toBe(true)
  })
})
