// @vitest-environment jsdom
/** The phone's own Back goes back one screen instead of closing the app. */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useBackButton, type WindowLike } from './backButton'

type V = 'main' | 'list' | 'measure'
const parentOf = (v: V): V => (v === 'measure' ? 'list' : 'main')

/** A tiny browser history: entries with state, a position, and popstate on back(). */
function fakeWindow() {
  const entries: unknown[] = [null]
  let at = 0
  const listeners = new Set<() => void>()
  const win: WindowLike = {
    history: {
      get state() {
        return entries[at]
      },
      pushState: (data) => {
        entries.splice(at + 1)
        entries.push(data)
        at++
      },
      back: () => {
        if (at === 0) return
        at--
        listeners.forEach((l) => l())
      },
    },
    addEventListener: (_t, fn) => void listeners.add(fn),
    removeEventListener: (_t, fn) => void listeners.delete(fn),
  }
  return { win, length: () => entries.length, position: () => at }
}

function setup() {
  const w = fakeWindow()
  let view: V = 'main'
  const setView = (v: V) => {
    view = v
    rerender({ v })
  }
  const { rerender } = renderHook(({ v }: { v: V }) => useBackButton(v, setView, parentOf, 'main', w.win), { initialProps: { v: 'main' as V } })
  const go = (v: V) => act(() => setView(v))
  const phoneBack = () => act(() => w.win.history.back())
  return { w, go, phoneBack, view: () => view }
}

describe('phone Back button', () => {
  it('on Home nothing is added: the phone Back leaves the app as usual', () => {
    const s = setup()
    expect(s.w.length()).toBe(1)
  })

  it('from a screen, phone Back goes to its parent (measurement → list → Home), not out of the app', () => {
    const s = setup()
    s.go('list')
    s.go('measure')
    expect(s.w.position()).toBe(1) // one extra entry, however deep
    s.phoneBack()
    expect(s.view()).toBe('list')
    expect(s.w.position()).toBe(1) // kept for the next Back
    s.phoneBack()
    expect(s.view()).toBe('main')
    expect(s.w.position()).toBe(0)
  })

  it('going Home with an on-screen button drops the extra entry quietly (no jump elsewhere)', () => {
    const s = setup()
    s.go('list')
    s.go('main')
    expect(s.view()).toBe('main')
    expect(s.w.position()).toBe(0)
    s.go('list')
    s.phoneBack()
    expect(s.view()).toBe('main')
  })

  it('without a browser window (tests, server) it does nothing', () => {
    expect(() => renderHook(() => useBackButton<V>('list', () => undefined, parentOf, 'main', undefined))).not.toThrow()
  })
})
