/** F7: a new app version waits; it is applied only when the collector taps Restart now on Home. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyUpdate, isUpdateReady, onUpdateChange, resetUpdate, setUpdateReady } from './update'

afterEach(resetUpdate)

describe('app updates', () => {
  it('nothing waiting → nothing happens', async () => {
    expect(isUpdateReady()).toBe(false)
    await applyUpdate()
  })

  it('a waiting version is announced, and applied only on request', async () => {
    const listener = vi.fn()
    const off = onUpdateChange(listener)
    const apply = vi.fn()
    setUpdateReady(apply)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(isUpdateReady()).toBe(true)
    expect(apply).not.toHaveBeenCalled() // never by itself
    await applyUpdate()
    expect(apply).toHaveBeenCalledTimes(1)
    off()
    setUpdateReady(apply)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
