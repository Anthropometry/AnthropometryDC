import { describe, expect, it } from 'vitest'
import { pwaOptions } from '../pwa.config'

describe('service worker caching', () => {
  it('DENY: no runtime caching, so Turnstile, Supabase and /api are never served from cache', () => {
    expect(pwaOptions.workbox?.runtimeCaching).toBeUndefined()
  })
  it('precaches only local build files', () => {
    for (const p of pwaOptions.workbox?.globPatterns ?? []) expect(p).not.toMatch(/https?:/)
  })
  it('never answers /api navigations from cache', () => {
    const deny = pwaOptions.workbox?.navigateFallbackDenylist ?? []
    expect(deny.some((r) => r.test('/api/login'))).toBe(true)
  })
})
