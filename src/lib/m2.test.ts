/** F2 settings + phone check and F3 practice queue (specs/F2-home-settings.md, specs/F3-practice-mode.md). */
import { describe, expect, it, vi } from 'vitest'
import type { KeyValueStore, Profile } from './profile'
import { flushSettings, loadPendingSettings, saveSettings, withSettings } from './settings'
import { describeDevice, fixFor, runPhoneCheck, type CheckEnv, type StreamLike } from './phonecheck'
import {
  addPractice,
  flushPractice,
  loadWaiting,
  mergePractice,
  practiceLabel,
  removePractice,
  type PracticeApi,
  type PracticeRow,
} from './practice'

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

const P: Profile = { id: 'u', displayName: 'Ama', status: 'approved', role: 'collector', unit: 'cm', language: 'en', settingsChosen: false }

describe('F2 settings', () => {
  it('ALLOW: saved and sent at once when online; nothing left waiting', async () => {
    const s = memoryStore()
    const send = vi.fn(async () => {})
    expect(await saveSettings(s, { unit: 'in', language: 'tw' }, send)).toBe('saved')
    expect(send).toHaveBeenCalledWith({ unit: 'in', language: 'tw' })
    expect(loadPendingSettings(s)).toBeNull()
  })

  it('offline: kept on the phone, sent later', async () => {
    const s = memoryStore()
    expect(await saveSettings(s, { unit: 'in', language: 'fr' }, async () => Promise.reject(new Error('offline')))).toBe('waiting')
    expect(loadPendingSettings(s)).toEqual({ unit: 'in', language: 'fr' })
    const send = vi.fn(async () => {})
    expect(await flushSettings(s, send)).toBe('saved')
    expect(loadPendingSettings(s)).toBeNull()
    expect(await flushSettings(s, send)).toBe('saved')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('a newer choice made while sending is not lost', async () => {
    const s = memoryStore()
    await saveSettings(s, { unit: 'in', language: 'fr' }, async () => Promise.reject(new Error('offline')))
    await flushSettings(s, async () => {
      await saveSettings(s, { unit: 'cm', language: 'tw' }, async () => Promise.reject(new Error('offline')))
    })
    expect(loadPendingSettings(s)).toEqual({ unit: 'cm', language: 'tw' })
  })

  it('DENY: junk in storage is ignored', () => {
    const s = memoryStore()
    s.setItem('anthro-collect.settings-pending.v1', JSON.stringify({ unit: 'yards', language: 'en' }))
    expect(loadPendingSettings(s)).toBeNull()
  })

  it('withSettings marks setup done and shows the chosen values', () => {
    expect(withSettings(P, { unit: 'in', language: 'tw' })).toMatchObject({ unit: 'in', language: 'tw', settingsChosen: true })
    expect(withSettings(P, null)).toBe(P)
  })
})

describe('F2 phone model', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 13; TECNO KI5 Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36', undefined, 'TECNO KI5', 'Android 13', 'Chrome 120'],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', { model: 'SM-A055F', platformVersion: '14.0.0' }, 'SM-A055F', 'Android 14', 'Chrome 140'],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', undefined, null, 'Android 10', 'Chrome 140'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1', undefined, 'iPhone', 'iOS 18.5', 'Safari 18'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1', undefined, 'iPhone', 'iOS 17.4', 'Chrome 126'],
    ['Mozilla/5.0 (Linux; Android 12; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36', undefined, 'SM-A125F', 'Android 12', 'Samsung Internet 25'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0', undefined, null, 'Windows', 'Edge 140'],
    ['something odd', undefined, null, null, null],
  ])('%#: %s', (ua, high, model, os, browser) => {
    expect(describeDevice(ua, high)).toEqual({ phoneModel: model, os, browser })
  })
})

const stop = vi.fn()
function env(over: Partial<CheckEnv> = {}): CheckEnv {
  stop.mockClear()
  const stream: StreamLike = {
    getVideoTracks: () => [{ getSettings: () => ({ width: 1920, height: 1080 }), stop }],
    getTracks: () => [{ getSettings: () => ({}), stop }],
  }
  return {
    getUserMedia: vi.fn(async () => stream),
    waitForMotion: vi.fn(async () => true),
    hasIndexedDB: true,
    estimateStorage: async () => ({ quota: 2048 * 1_048_576 }),
    userAgent: 'Mozilla/5.0 (Linux; Android 13; TECNO KI5) Chrome/120.0 Mobile Safari/537.36',
    ...over,
  }
}

describe('F2 phone check', () => {
  const now = () => new Date('2026-11-07T09:00:00Z')

  it('ALLOW: everything works → passed; camera closed; no picture taken', async () => {
    const e = env()
    const r = await runPhoneCheck(e, now)
    expect(r).toMatchObject({
      cameraOk: true,
      cameraResolution: '1920x1080',
      motionOk: true,
      storageOk: true,
      storageMb: 2048,
      passed: true,
      phoneModel: 'TECNO KI5',
      checkedAt: '2026-11-07T09:00:00.000Z',
    })
    expect(e.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    expect(stop).toHaveBeenCalled()
  })

  it('camera refused → denied with a settings fix; not passed', async () => {
    const denied = Object.assign(new Error('no'), { name: 'NotAllowedError' })
    const r = await runPhoneCheck(env({ getUserMedia: async () => Promise.reject(denied) }), now)
    expect(r).toMatchObject({ cameraOk: false, cameraProblem: 'denied', passed: false })
    expect(fixFor('camera', r)).toMatch(/Allow the camera/)
  })

  it('no camera API or a broken camera → "use another phone"', async () => {
    const a = await runPhoneCheck(env({ getUserMedia: undefined }), now)
    expect(a.cameraProblem).toBe('none')
    expect(fixFor('camera', a)).toMatch(/another phone/)
    const b = await runPhoneCheck(env({ getUserMedia: async () => Promise.reject(new Error('busy')) }), now)
    expect(b.cameraProblem).toBe('none')
    const c = await runPhoneCheck(env({ getUserMedia: async () => ({ getVideoTracks: () => [], getTracks: () => [] }) }), now)
    expect(c.cameraOk).toBe(false)
  })

  it('iPhone: motion permission is asked first; refusal means no motion', async () => {
    const order: string[] = []
    const r = await runPhoneCheck(
      env({
        requestMotionPermission: async () => {
          order.push('motion')
          return 'denied'
        },
        getUserMedia: async () => {
          order.push('camera')
          return { getVideoTracks: () => [{ getSettings: () => ({}), stop: () => {} }], getTracks: () => [] }
        },
      }),
      now,
    )
    expect(order).toEqual(['motion', 'camera'])
    expect(r.motionOk).toBe(false)
    expect(r.cameraResolution).toBeNull()
    expect(fixFor('motion', r)).toMatch(/Motion/)
  })

  it('no motion sensor, a throwing permission prompt, or a throwing sensor → motion not ok', async () => {
    expect((await runPhoneCheck(env({ waitForMotion: undefined }), now)).motionOk).toBe(false)
    expect((await runPhoneCheck(env({ waitForMotion: async () => false }), now)).motionOk).toBe(false)
    expect((await runPhoneCheck(env({ requestMotionPermission: async () => Promise.reject(new Error('x')) }), now)).motionOk).toBe(false)
    expect((await runPhoneCheck(env({ waitForMotion: async () => Promise.reject(new Error('x')) }), now)).motionOk).toBe(false)
  })

  it('storage: no IndexedDB, too little space, or unknown space', async () => {
    const a = await runPhoneCheck(env({ hasIndexedDB: false }), now)
    expect(a.storageOk).toBe(false)
    expect(fixFor('storage', a)).toMatch(/private browsing/)
    expect((await runPhoneCheck(env({ estimateStorage: async () => ({ quota: 10 * 1_048_576 }) }), now)).storageOk).toBe(false)
    const c = await runPhoneCheck(env({ estimateStorage: async () => Promise.reject(new Error('x')) }), now)
    expect(c).toMatchObject({ storageOk: true, storageMb: null })
    expect((await runPhoneCheck(env({ estimateStorage: undefined }), now)).storageMb).toBeNull()
  })

  it('model details from the browser are used when given; a failing lookup is ignored', async () => {
    const a = await runPhoneCheck(env({ highEntropy: async () => ({ model: 'itel A70' }) }), now)
    expect(a.phoneModel).toBe('itel A70')
    const b = await runPhoneCheck(env({ highEntropy: async () => Promise.reject(new Error('x')) }), now)
    expect(b.phoneModel).toBe('TECNO KI5')
  })

  it('no fix text for lines that passed', async () => {
    const r = await runPhoneCheck(env(), now)
    expect([fixFor('camera', r), fixFor('motion', r), fixFor('storage', r)]).toEqual([null, null, null])
  })
})

describe('F3 practice queue', () => {
  const ids = (() => {
    let n = 0
    return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  })()
  const clock = () => new Date('2026-11-07T09:00:00Z')

  function api(over: Partial<PracticeApi> = {}): PracticeApi & { insert: ReturnType<typeof vi.fn> } {
    let no = 0
    return {
      insert: vi.fn(async () => ++no),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => {}),
      ...over,
    } as PracticeApi & { insert: ReturnType<typeof vi.fn> }
  }

  it('ALLOW: online → sent at once, gets its number, nothing left waiting', async () => {
    const s = memoryStore()
    const a = api()
    const made = await addPractice(s, a, 'adult', ids, clock)
    expect(made.practiceNo).toBe(1)
    expect(loadWaiting(s)).toEqual([])
  })

  it('offline → kept on the phone; sent in order later; nothing lost', async () => {
    const s = memoryStore()
    const down = api({ insert: vi.fn(async () => Promise.reject(new Error('offline'))) })
    expect((await addPractice(s, down, 'adult', ids, clock)).practiceNo).toBeNull()
    await addPractice(s, down, 'child', ids, clock)
    expect(loadWaiting(s).map((w) => w.ageGroup)).toEqual(['adult', 'child'])
    const up = api()
    const sent = await flushPractice(s, up)
    expect([...sent.values()]).toEqual([1, 2])
    expect(up.insert.mock.calls.map((c) => (c[0] as { ageGroup: string }).ageGroup)).toEqual(['adult', 'child'])
    expect(loadWaiting(s)).toEqual([])
  })

  it('stops at the first failure and keeps the rest for later', async () => {
    const s = memoryStore()
    const down = api({ insert: vi.fn(async () => Promise.reject(new Error('offline'))) })
    await addPractice(s, down, 'adult', ids, clock)
    await addPractice(s, down, 'child', ids, clock)
    let calls = 0
    await flushPractice(s, api({ insert: vi.fn(async () => (++calls === 1 ? 5 : Promise.reject(new Error('x')))) }))
    expect(loadWaiting(s).map((w) => w.ageGroup)).toEqual(['child'])
  })

  it('DENY: junk or bad ids in storage are never sent', () => {
    const s = memoryStore()
    s.setItem('anthro-collect.practice-waiting.v1', JSON.stringify([{ id: 'x', ageGroup: 'adult', createdAt: 'now' }, null, 5]))
    expect(loadWaiting(s)).toEqual([])
    s.setItem('anthro-collect.practice-waiting.v1', JSON.stringify({ not: 'a list' }))
    expect(loadWaiting(s)).toEqual([])
  })

  it('merge shows waiting ones first, never twice, newest first', () => {
    const server: PracticeRow[] = [
      { id: 'a', practiceNo: 1, ageGroup: 'adult', status: 'draft', createdAt: '2026-11-06T09:00:00Z', waiting: false },
    ]
    const merged = mergePractice(server, [
      { id: 'a', ageGroup: 'adult', createdAt: '2026-11-06T09:00:00Z' },
      { id: 'b', ageGroup: 'child', createdAt: '2026-11-07T09:00:00Z' },
    ])
    expect(merged.map((r) => [r.id, r.waiting])).toEqual([
      ['b', true],
      ['a', false],
    ])
  })

  it('remove: a waiting one only leaves the phone; a saved one asks the server', async () => {
    const s = memoryStore()
    const down = api({ insert: vi.fn(async () => Promise.reject(new Error('offline'))) })
    const { id } = await addPractice(s, down, 'adult', ids, clock)
    const a = api()
    await removePractice(s, a, { id, practiceNo: null, ageGroup: 'adult', status: 'draft', createdAt: '', waiting: true })
    expect(loadWaiting(s)).toEqual([])
    expect(a.remove).not.toHaveBeenCalled()
    await removePractice(s, a, { id: 'z', practiceNo: 3, ageGroup: 'adult', status: 'draft', createdAt: '', waiting: false })
    expect(a.remove).toHaveBeenCalledWith('z')
  })

  it('labels', () => {
    expect(practiceLabel(7)).toBe('P-0007')
    expect(practiceLabel(null)).toBe('P-…')
  })
})
