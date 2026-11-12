/** F6 Amendment A: camera tools downloaded once, on first camera use, then kept for offline use. */
import { describe, expect, it, vi } from 'vitest'
import { CAMERA_FILES, prepareCameraFiles, type CacheLike } from './cameraFiles'

function fakeCache(have: string[] = []) {
  const stored = new Set(have)
  const cache: CacheLike = {
    match: vi.fn(async (u: string) => (stored.has(u) ? new Response('x') : undefined)),
    put: vi.fn(async (u: string) => void stored.add(u)),
  }
  return { cache, stored }
}

describe('camera tools: one-time download', () => {
  it('first use: every file is fetched and kept; progress counts up', async () => {
    const { cache, stored } = fakeCache()
    const fetchFn = vi.fn(async () => new Response('bytes'))
    const progress: number[] = []
    expect(await prepareCameraFiles(true, async () => cache, fetchFn, (d) => progress.push(d))).toBe('ready')
    expect(fetchFn).toHaveBeenCalledTimes(CAMERA_FILES.length)
    expect([...stored].sort()).toEqual([...CAMERA_FILES].sort())
    expect(progress).toEqual([0, 1, 2, 3, 4])
    expect(CAMERA_FILES.every((f) => f.startsWith('/'))).toBe(true) // self-hosted, never Google
  })

  it('next time: already on the phone → ready, nothing downloaded (works in airplane mode)', async () => {
    const { cache } = fakeCache([...CAMERA_FILES])
    const fetchFn = vi.fn(async () => Promise.reject(new Error('offline')))
    expect(await prepareCameraFiles(true, async () => cache, fetchFn)).toBe('ready')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('no signal the first time → "no_signal"; files already fetched are kept for next time', async () => {
    const { cache, stored } = fakeCache()
    let n = 0
    const fetchFn = vi.fn(async () => (++n > 2 ? Promise.reject(new Error('offline')) : new Response('bytes')))
    expect(await prepareCameraFiles(true, async () => cache, fetchFn)).toBe('no_signal')
    expect(stored.size).toBe(2)
    expect(await prepareCameraFiles(true, async () => cache, async () => new Response('', { status: 503 }))).toBe('no_signal')
  })

  it('DENY: a browser that can’t run the tools → "unsupported", nothing downloaded', async () => {
    const fetchFn = vi.fn()
    expect(await prepareCameraFiles(false, async () => fakeCache().cache, fetchFn)).toBe('unsupported')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('no cache storage (private window) → the files load when needed', async () => {
    expect(await prepareCameraFiles(true, null, vi.fn())).toBe('ready')
    expect(await prepareCameraFiles(true, async () => Promise.reject(new Error('x')), vi.fn())).toBe('ready')
  })
})
