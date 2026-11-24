/** F7 offline sync: single sender, retries, stuck items, one failure doesn't hold up others, kill mid-send. */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FieldDb, flushConsents, saveJob, type ConsentApi, type ConsentJob } from './consentQueue'
import { flushMeasurements, saveEntry, startDraft, type Entry, type MeasureApi } from './measureQueue'
import { createSender, errorCode, isRefusal, issueReporter, keepDataOnPhone, reasonText, RETRY_MINUTES, STUCK_AFTER, syncSummary } from './sync'

let db: FieldDb
afterEach(async () => {
  vi.useRealTimers()
  await db?.delete()
})

const job = (participantId: string, createdAt = '2026-11-13T09:00:00Z'): ConsentJob => ({
  participantId,
  collectorId: 'me',
  createdAt,
  isPractice: true,
  ageGroup: 'adult',
  receiptCode: 'R7K2MPQ',
  rejected: false,
  consent: { participantName: 'Practice Person', guardianName: null, language: 'en', consentVersion: 'practice', childAssent: null, signedAt: createdAt },
  signatures: { participant: new Uint8Array([1, 2, 3, 4]) },
  done: { participant: false, consent: false, signatures: [] },
})

function consentApi(over: Partial<ConsentApi> = {}) {
  const calls: string[] = []
  const api: ConsentApi = {
    insertParticipant: vi.fn(async (j) => void calls.push(`participant:${j.participantId}`)),
    insertConsent: vi.fn(async (j) => void calls.push(`consent:${j.participantId}`)),
    uploadSignature: vi.fn(async (id) => void calls.push(`signature:${id}`)),
    markSignature: vi.fn(async (id) => void calls.push(`mark:${id}`)),
    ...over,
  }
  return { api, calls }
}

const refused = Object.assign(new Error('x'), { code: '23514' })

describe('error codes: short, no data; refusals vs no signal', () => {
  it('codes', () => {
    expect(errorCode(new TypeError('Failed to fetch'))).toBe('network')
    expect(errorCode(new Error('upload_409'))).toBe('upload_409')
    expect(errorCode(refused)).toBe('db_23514')
    expect(errorCode(new Error('Kofi Mensah could not be saved'))).toBe('other') // never the message
    expect(errorCode(new Error('signed_out'))).toBe('signed_out')
  })
  it('only real refusals count towards "needs attention"', () => {
    expect(isRefusal('db_23514')).toBe(true)
    expect(isRefusal('upload_403')).toBe(true)
    expect(isRefusal('network')).toBe(false)
    expect(isRefusal('upload_503')).toBe(false)
    expect(isRefusal('upload_401')).toBe(false)
    expect(reasonText('upload_409')).toMatch(/waiting for something sent before/)
    expect(reasonText('network')).toMatch(/try again by itself/)
  })
})

describe('one participant failing does not hold up the others', () => {
  it('consents: a refused one is reported and the next still goes; nothing deleted', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    await saveJob(db, job('p1', '2026-11-13T09:00:00Z'))
    await saveJob(db, job('p2', '2026-11-13T09:05:00Z'))
    const { api, calls } = consentApi({
      insertConsent: vi.fn(async (j: ConsentJob) => {
        if (j.participantId === 'p1') throw refused
        calls.push(`consent:${j.participantId}`)
      }),
    })
    expect(await flushConsents(db, 'me', api, issueReporter(db, 'me'))).toBe(1)
    expect(calls).toContain('consent:p2')
    expect(await db.jobs.get('p1')).toBeDefined() // still on the phone
    expect((await db.issues.get('consent:p1'))?.tries).toBe(1)
  })

  it('measurements: a failing participant keeps its order; others still go; skipped ones are not failures', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    const entry = (code: Entry['code']): Entry => ({ code, unit: 'cm', readingsTyped: ['35.0'], skipped: false, skipReason: null, skipNote: null, confirmedUnusual: false, heightMethod: null, hairAddsHeight: null, measuredAt: 'x' })
    for (const id of ['p1', 'p2', 'p3']) {
      const d = await startDraft(db, { participantId: id, collectorId: 'me', isPractice: true, ageGroup: 'adult', intimateOk: true })
      const d2 = await saveEntry(db, d, entry('neck_girth'))
      await saveEntry(db, d2, entry('wrist_girth'))
    }
    const sent: string[] = []
    const api = {
      saveEntry: vi.fn(async (id: string, e: Entry) => {
        if (id === 'p1') throw refused
        sent.push(`${id}:${e.code}`)
      }),
    } as unknown as MeasureApi
    await flushMeasurements(db, 'me', api, issueReporter(db, 'me'), new Set(['p3']))
    expect(sent).toEqual(['p2:neck_girth', 'p2:wrist_girth'])
    expect(api.saveEntry).toHaveBeenCalledTimes(3) // p1 tried once, its second change waits behind it
    expect(await db.ops.where('participantId').equals('p1').count()).toBe(2)
    expect(await db.ops.where('participantId').equals('p3').count()).toBe(2)
    expect(await db.issues.get('measurement:p3')).toBeUndefined()
  })
})

describe('needs attention after 5 refusals; never deleted; network failures do not count', () => {
  it('counts refusals, marks stuck at 5, clears on success', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    const r = issueReporter(db, 'me', () => new Date('2026-11-13T10:00:00Z'))
    for (let i = 0; i < 3; i++) await r.fail('photo', 'p1', new TypeError('offline'))
    expect((await db.issues.get('photo:p1'))?.tries).toBe(0)
    for (let i = 1; i < STUCK_AFTER; i++) await r.fail('photo', 'p1', new Error('upload_415'))
    expect((await db.issues.get('photo:p1'))?.stuck).toBe(false)
    await r.fail('photo', 'p1', new Error('upload_415'))
    expect(await db.issues.get('photo:p1')).toMatchObject({ stuck: true, tries: 5, lastError: 'upload_415', lastAt: '2026-11-13T10:00:00.000Z' })
    await r.ok('photo', 'p1')
    expect(await db.issues.get('photo:p1')).toBeUndefined()
  })

  it('summary: what is on the phone, size to send, stuck participants with a plain reason', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    await saveJob(db, job('p1'))
    await saveJob(db, { ...job('p9'), collectorId: 'someone-else' })
    const r = issueReporter(db, 'me')
    for (let i = 0; i < STUCK_AFTER; i++) await r.fail('consent', 'p1', refused)
    const s = await syncSummary(db, 'me')
    expect(s).toMatchObject({ consents: 1, measurements: 0, photos: 0, bytes: 4, stuck: 1 })
    expect(s.participants).toEqual([{ participantId: 'p1', kinds: ['consent'], stuck: true, reason: expect.stringMatching(/checks refused/) }])
  })
})

describe('the sender: one round at a time, retries by itself while online', () => {
  function deps(results: boolean[], online = true) {
    const timers: { fn: () => void; ms: number }[] = []
    const run = vi.fn(async () => results.shift() ?? true)
    const sender = createSender({
      run,
      isOnline: () => online,
      setTimer: (fn, ms) => {
        timers.push({ fn, ms })
        return timers.length
      },
      clearTimer: () => undefined,
    })
    return { sender, run, timers }
  }

  it('two requests at once → one round now, one more after (never two at the same time)', async () => {
    let release: () => void = () => undefined
    let active = 0
    let maxActive = 0
    const sender = createSender({
      run: async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise<void>((r) => (release = r))
        active--
        return true
      },
      isOnline: () => true,
      setTimer: () => 0,
      clearTimer: () => undefined,
    })
    const a = sender.request()
    void sender.request()
    void sender.request()
    release()
    await new Promise((r) => setTimeout(r, 0))
    release()
    await a
    expect(maxActive).toBe(1)
  })

  it('failures retry after 1, 2, 4, 8, 15, 15 minutes; success stops it', async () => {
    const { sender, timers } = deps([false, false, false, false, false, false, true])
    await sender.request()
    for (let i = 0; i < 6; i++) await timers[i].fn()
    expect(timers.map((t) => t.ms / 60_000)).toEqual([...RETRY_MINUTES, 15])
    expect(timers).toHaveLength(6) // the 7th round succeeded: no more timers
  })

  it('offline: no timer (it starts again when the phone comes back online)', async () => {
    const { sender, timers } = deps([false], false)
    await sender.request()
    expect(timers).toHaveLength(0)
  })

  it('an error inside a round counts as a failed round, not a crash', async () => {
    const timers: number[] = []
    const sender = createSender({ run: async () => Promise.reject(new Error('x')), isOnline: () => true, setTimer: (_f, ms) => timers.push(ms), clearTimer: () => undefined })
    await sender.request()
    expect(timers).toEqual([60_000])
    sender.stop()
  })
})

describe('keep the data on the phone', () => {
  it('asks the browser once; already kept → no ask; no support or an error → false', async () => {
    const persist = vi.fn(async () => true)
    expect(await keepDataOnPhone({ persisted: async () => false, persist })).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
    const again = vi.fn(async () => true)
    expect(await keepDataOnPhone({ persisted: async () => true, persist: again })).toBe(true)
    expect(again).not.toHaveBeenCalled()
    expect(await keepDataOnPhone(undefined)).toBe(false)
    expect(await keepDataOnPhone({ persist: async () => Promise.reject(new Error('x')) })).toBe(false)
  })
})

describe('killed mid-send: nothing lost, nothing sent twice', () => {
  it('consent: participant arrived, app killed before the consent → next time only the rest is sent', async () => {
    db = new FieldDb(`t-${Math.random()}`)
    await saveJob(db, job('p1'))
    const first = consentApi({ insertConsent: vi.fn(async () => Promise.reject(new TypeError('killed'))) })
    await flushConsents(db, 'me', first.api)
    expect((await db.jobs.get('p1'))?.done.participant).toBe(true) // remembered on the phone
    const again = consentApi()
    await flushConsents(db, 'me', again.api)
    expect(again.calls).toEqual(['consent:p1', 'signature:p1', 'mark:p1']) // participant not sent twice
    expect(await db.jobs.count()).toBe(0)
  })
})
