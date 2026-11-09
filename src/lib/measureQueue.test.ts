/** F5 offline saving: order, resume, per collector, draft kept until finished and sent. */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FieldDb } from './consentQueue'
import { finishDraft, flushMeasurements, loadDraft, saveAbout, saveEntry, startDraft, waitingOps, type Entry, type MeasureApi } from './measureQueue'

let db: FieldDb
afterEach(async () => {
  await db?.delete()
})

const entry = (code: Entry['code'], typed: string[] = ['34.5']): Entry => ({
  code,
  unit: 'cm',
  readingsTyped: typed,
  skipped: false,
  skipReason: null,
  skipNote: null,
  confirmedUnusual: false,
  heightMethod: null,
  hairAddsHeight: null,
  measuredAt: '2026-11-09T10:00:00Z',
})

function api(over: Partial<MeasureApi> = {}) {
  const calls: string[] = []
  const a: MeasureApi = {
    saveAbout: vi.fn(async (id) => void calls.push(`about:${id}`)),
    saveEntry: vi.fn(async (id, e) => void calls.push(`entry:${id}:${e.code}`)),
    finish: vi.fn(async (id) => void calls.push(`finish:${id}`)),
    ...over,
  }
  return { api: a, calls }
}

async function draft(id = 'p1', collectorId = 'me') {
  db ??= new FieldDb(`test-${Math.random()}`)
  return startDraft(db, { participantId: id, collectorId, isPractice: true, ageGroup: 'adult', intimateOk: true })
}

describe('measurement queue', () => {
  it('ALLOW: about → entries → finish, sent in order; draft cleared once finished and sent', async () => {
    db = new FieldDb(`test-${Math.random()}`)
    let d = await draft()
    d = await saveAbout(db, d, { sex: 'female', ageYears: 30, clothing: 'light' })
    d = await saveEntry(db, d, entry('neck_girth'))
    d = await saveEntry(db, d, entry('neck_girth', ['35.0'])) // a change is sent too, in order
    await finishDraft(db, d, '2026-11-09T10:05:00Z')
    expect(await waitingOps(db, 'me')).toBe(4)
    const { api: a, calls } = api()
    expect(await flushMeasurements(db, 'me', a)).toBe(4)
    expect(calls).toEqual(['about:p1', 'entry:p1:neck_girth', 'entry:p1:neck_girth', 'finish:p1'])
    expect(await waitingOps(db, 'me')).toBe(0)
    expect(await loadDraft(db, 'p1')).toBeUndefined()
  })

  it('the draft keeps what was entered (the screens read it) until finished', async () => {
    db = new FieldDb(`test-${Math.random()}`)
    const d = await draft()
    await saveEntry(db, d, entry('waist_girth', ['78.0', '78.4']))
    const back = await loadDraft(db, 'p1')
    expect(back?.entries.waist_girth?.readingsTyped).toEqual(['78.0', '78.4'])
    expect(await startDraft(db, { participantId: 'p1', collectorId: 'me', isPractice: true, ageGroup: 'adult', intimateOk: false })).toEqual(back)
  })

  it('offline: nothing is lost; the retry continues where it stopped', async () => {
    db = new FieldDb(`test-${Math.random()}`)
    let d = await draft()
    d = await saveAbout(db, d, { sex: 'male', ageYears: 40, clothing: 'medium' })
    await saveEntry(db, d, entry('neck_girth'))
    const down = api({ saveEntry: vi.fn(async () => Promise.reject(new Error('offline'))) })
    expect(await flushMeasurements(db, 'me', down.api)).toBe(1)
    expect(await waitingOps(db, 'me')).toBe(1)
    const up = api()
    await flushMeasurements(db, 'me', up.api)
    expect(up.calls).toEqual(['entry:p1:neck_girth'])
  })

  it("DENY: another collector's waiting measurements on a shared phone are never sent", async () => {
    db = new FieldDb(`test-${Math.random()}`)
    const d = await draft('p2', 'someone-else')
    await saveEntry(db, d, entry('neck_girth'))
    const { api: a } = api()
    expect(await flushMeasurements(db, 'me', a)).toBe(0)
    expect(a.saveEntry).not.toHaveBeenCalled()
    expect(await waitingOps(db, 'someone-else')).toBe(1)
  })

  it('a finished draft stays while anything for it is still waiting', async () => {
    db = new FieldDb(`test-${Math.random()}`)
    let d = await draft()
    d = await finishDraft(db, d, 'x')
    await saveEntry(db, d, entry('neck_girth'))
    const { api: a } = api({ saveEntry: vi.fn(async () => Promise.reject(new Error('offline'))) })
    await flushMeasurements(db, 'me', a)
    expect(await loadDraft(db, 'p1')).toBeDefined()
  })
})
