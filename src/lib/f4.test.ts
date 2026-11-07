/** F4: receipt codes, consent text, offline consent queue (fake IndexedDB). */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanReceipt, formatReceipt, isReceiptCode, newReceiptCode, RECEIPT_ALPHABET } from './receipt'
import { consentText } from './consentText'
import { FieldDb, flushConsents, saveJob, waitingCount, waitingJobs, type ConsentApi, type ConsentJob } from './consentQueue'

describe('receipt codes', () => {
  it('7 characters from the easy alphabet, formatted XXX-XXXX, cleaned back', () => {
    for (let i = 0; i < 200; i++) expect(isReceiptCode(newReceiptCode())).toBe(true)
    expect(formatReceipt('R7K2MPQ')).toBe('R7K-2MPQ')
    expect(formatReceipt('ABC')).toBe('ABC')
    expect(cleanReceipt(' r7k-2mpq ')).toBe('R7K2MPQ')
    expect(RECEIPT_ALPHABET).not.toMatch(/[01OIL]/)
  })

  it('unbiased: bytes 248-255 are thrown away', () => {
    let calls = 0
    const bytes = () => {
      calls++
      return calls === 1 ? new Uint8Array(14).fill(255) : new Uint8Array(14).fill(0)
    }
    expect(newReceiptCode(bytes)).toBe('AAAAAAA')
    expect(calls).toBe(2)
  })

  it('DENY: look-alike letters, wrong length, dashes', () => {
    expect(isReceiptCode('O0I1LAB')).toBe(false)
    expect(isReceiptCode('R7K2MP')).toBe(false)
    expect(isReceiptCode('R7K-2MPQ')).toBe(false)
  })
})

describe('consent text (practice only for now)', () => {
  it('practice text starts with PRACTICE, names Ashesi, covers blur, withdrawal and future app use', () => {
    const t = consentText('practice')!
    const adult = t.body(false).join(' ')
    expect(t.body(false)[0]).toMatch(/^PRACTICE ONLY/)
    expect(adult).toMatch(/student research project at Ashesi University/)
    expect(adult).toMatch(/face is blurred/)
    expect(adult).toMatch(/receipt code/)
    expect(adult).toMatch(/withdraw/)
    expect(adult).toMatch(/app/)
    expect(t.body(true).join(' ')).toMatch(/your child/)
    expect(t.tickData(true)).toMatch(/my child/)
    expect(t.tickPhotos(false)).toMatch(/blurred/)
    expect(t.assent.join(' ')).toMatch(/You can say no/)
  })

  it('DENY: no text for a version this app does not have (v1 before Gate B) or none', () => {
    expect(consentText('v1')).toBeNull()
    expect(consentText(null)).toBeNull()
  })
})

let n = 0
const job = (over: Partial<ConsentJob> = {}): ConsentJob => {
  n++
  return {
    participantId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    collectorId: 'me',
    createdAt: new Date(Date.UTC(2026, 10, 7, 9, n)).toISOString(),
    isPractice: true,
    ageGroup: 'adult',
    receiptCode: 'R7K2MPQ',
    rejected: false,
    consent: { participantName: 'Practice Person', guardianName: null, language: 'en', consentVersion: 'practice', childAssent: null, signedAt: '2026-11-07T09:00:00Z' },
    signatures: { participant: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    done: { participant: false, consent: false, signatures: [] },
    ...over,
  }
}

function api(over: Partial<ConsentApi> = {}) {
  const calls: string[] = []
  const a = {
    insertParticipant: vi.fn(async (j: ConsentJob) => void calls.push(`participant:${j.participantId.slice(-2)}`)),
    insertConsent: vi.fn(async (j: ConsentJob) => void calls.push(`consent:${j.participantId.slice(-2)}`)),
    uploadSignature: vi.fn(async (id: string, slot: string) => void calls.push(`upload:${id.slice(-2)}:${slot}`)),
    markSignature: vi.fn(async (id: string, slot: string) => void calls.push(`mark:${id.slice(-2)}:${slot}`)),
    ...over,
  }
  return { api: a, calls }
}

let db: FieldDb
afterEach(async () => {
  await db?.delete()
})
const fresh = () => {
  db = new FieldDb(`test-${Math.random()}`)
  return db
}

describe('offline consent queue', () => {
  it('ALLOW: sends participant → consent → signature → slot, then removes it from the phone', async () => {
    fresh()
    const j = job()
    await saveJob(db, j)
    expect(await waitingCount(db, 'me')).toBe(1)
    const { api: a, calls } = api()
    expect(await flushConsents(db, 'me', a)).toBe(1)
    const id = j.participantId.slice(-2)
    expect(calls).toEqual([`participant:${id}`, `consent:${id}`, `upload:${id}:participant`, `mark:${id}:participant`])
    expect(await waitingCount(db, 'me')).toBe(0)
  })

  it('child: guardian and assent signatures in a fixed order', async () => {
    fresh()
    const png = new Uint8Array([1])
    await saveJob(db, job({ ageGroup: 'child', signatures: { assent: png, guardian: png } }))
    const { api: a, calls } = api()
    await flushConsents(db, 'me', a)
    expect(calls.filter((c) => c.startsWith('upload')).map((c) => c.split(':')[2])).toEqual(['guardian', 'assent'])
  })

  it('a failure keeps the job and what was done; the retry continues where it stopped', async () => {
    fresh()
    const j = job()
    await saveJob(db, j)
    const { api: broken } = api({ uploadSignature: vi.fn(async () => Promise.reject(new Error('offline'))) })
    expect(await flushConsents(db, 'me', broken)).toBe(0)
    const kept = (await waitingJobs(db, 'me'))[0]
    expect(kept.done).toEqual({ participant: true, consent: true, signatures: [] })
    expect(kept.consent?.participantName).toBe('Practice Person')
    const { api: a, calls } = api()
    await flushConsents(db, 'me', a)
    expect(calls.map((c) => c.split(':')[0])).toEqual(['upload', 'mark'])
    expect(await waitingCount(db, 'me')).toBe(0)
  })

  it('oldest first; stops at the first failing job so order is kept', async () => {
    fresh()
    const first = job()
    const second = job()
    await saveJob(db, second)
    await saveJob(db, first)
    let k = 0
    const { api: a } = api({ insertParticipant: vi.fn(async () => (++k === 1 ? undefined : Promise.reject(new Error('x')))) })
    expect(await flushConsents(db, 'me', a)).toBe(1)
    expect((await waitingJobs(db, 'me')).map((j) => j.participantId)).toEqual([second.participantId])
  })

  it('child said No: only the rejected participant is sent; no consent, no signatures', async () => {
    fresh()
    await saveJob(db, job({ rejected: true, consent: null, signatures: {}, ageGroup: 'child' }))
    const { api: a, calls } = api()
    await flushConsents(db, 'me', a)
    expect(calls.map((c) => c.split(':')[0])).toEqual(['participant'])
  })

  it("DENY: another collector's waiting jobs on a shared phone are never sent or counted", async () => {
    fresh()
    await saveJob(db, job({ collectorId: 'someone-else' }))
    const { api: a } = api()
    expect(await flushConsents(db, 'me', a)).toBe(0)
    expect(a.insertParticipant).not.toHaveBeenCalled()
    expect(await waitingCount(db, 'me')).toBe(0)
    expect(await waitingCount(db, 'someone-else')).toBe(1)
  })
})
