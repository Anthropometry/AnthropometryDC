/**
 * F4 database rules (specs/F4-consent.md): consent rules, receipt codes, has_consent, signatures
 * list, admin withdrawal. In-memory PGlite only.
 */
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, runAs, seed } from './helpers'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const ADMIN = '00000000-0000-4000-8000-0000000000ad'
let db: PGlite

const as = <T = Record<string, unknown>>(who: string, sql: string, params: unknown[] = []) =>
  runAs<T>(db, who, sql, params)

async function participant(who: string, opts: { practice?: boolean; age?: 'adult' | 'child'; receipt?: string } = {}) {
  const id = crypto.randomUUID()
  await as(
    who,
    `insert into public.participants (id, collector_id, is_practice, age_group, receipt_code) values ($1, $2, $3, $4, $5)`,
    [id, who, opts.practice ?? true, opts.age ?? 'adult', opts.receipt ?? null],
  )
  return id
}

function consent(who: string, participantId: string, over: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    participant_id: participantId,
    participant_name: 'Practice Person',
    language: 'en',
    consent_version: 'practice',
    agreed_data: true,
    agreed_photos: true,
    signed_at: new Date().toISOString(),
    ...over,
  }
  const cols = Object.keys(row)
  const marks = cols.map((_, i) => `$${i + 1}`).join(', ')
  return as(who, `insert into public.consents (${cols.join(', ')}) values (${marks})`, Object.values(row))
}

// Gate B is done by Ryan in the SQL editor (database owner); the app's admin login can't set the version.
const openGateB = () => db.query(`update public.app_settings set collection_open = true, consent_version = 'v1'`)

beforeEach(async () => {
  db = await createDb()
  await seed(
    db,
    `insert into auth.users (id) values ('${A}'), ('${B}'), ('${ADMIN}');
     insert into public.collectors (id, phone, role, status, display_name) values
       ('${A}', '+233241111111', 'collector', 'approved', 'Ama'),
       ('${B}', '+233242222222', 'collector', 'approved', 'Kofi'),
       ('${ADMIN}', '+233243333333', 'admin', 'approved', 'Lead')`,
  )
})

describe('F4 consent rules', () => {
  it('ALLOW: adult practice consent; the collector still cannot read it back; admin can', async () => {
    const p = await participant(A)
    await consent(A, p)
    expect((await as(A, `select * from public.consents`)).rows).toHaveLength(0)
    expect((await as(ADMIN, `select participant_name from public.consents`)).rows).toEqual([{ participant_name: 'Practice Person' }])
  })

  it('ALLOW: child consent with guardian and assent', async () => {
    const p = await participant(A, { age: 'child' })
    await consent(A, p, { guardian_name: 'Parent Person', child_assent: true })
  })

  it('DENY: child without guardian, without assent, or with assent false', async () => {
    const p = await participant(A, { age: 'child' })
    await expect(consent(A, p, { child_assent: true })).rejects.toThrow(/guardian/)
    await expect(consent(A, p, { guardian_name: 'Parent' })).rejects.toThrow(/assent/)
    await expect(consent(A, p, { guardian_name: 'Parent', child_assent: false })).rejects.toThrow(/assent/)
  })

  it('DENY: adult with a guardian or an assent value', async () => {
    const p = await participant(A)
    await expect(consent(A, p, { guardian_name: 'Someone' })).rejects.toThrow(/themself/)
    await expect(consent(A, p, { child_assent: true })).rejects.toThrow(/themself/)
  })

  it('DENY: practice consent with a real version; one consent per participant; one tick missing', async () => {
    const p = await participant(A)
    await expect(consent(A, p, { consent_version: 'v1' })).rejects.toThrow(/version practice/)
    await expect(consent(A, p, { agreed_photos: false })).rejects.toThrow(/check/)
    await consent(A, p)
    await expect(consent(A, p)).rejects.toThrow(/duplicate|unique/)
  })

  it('DENY: real consent before Gate B; ALLOW with the approved version after', async () => {
    await as(ADMIN, `update public.app_settings set collection_open = true`)
    const p = await participant(A, { practice: false })
    await expect(consent(A, p, { consent_version: 'v1' })).rejects.toThrow(/approved consent version/)
    await expect(as(ADMIN, `update public.app_settings set consent_version = 'v1'`)).rejects.toThrow(/permission denied/)
    await db.query(`update public.app_settings set consent_version = 'v1'`)
    await expect(consent(A, p, { consent_version: 'practice' })).rejects.toThrow(/approved consent version/)
    await consent(A, p, { consent_version: 'v1' })
  })

  it("DENY: consent for another collector's participant, for a rejected one, signed in the future", async () => {
    const pb = await participant(B)
    await expect(consent(A, pb)).rejects.toThrow(/row-level security/)
    const pr = await participant(A)
    await as(A, `update public.participants set status = 'rejected' where id = $1`, [pr])
    await expect(consent(A, pr)).rejects.toThrow(/rejected/)
    const pf = await participant(A)
    await expect(consent(A, pf, { signed_at: new Date(Date.now() + 3600_000).toISOString() })).rejects.toThrow(/future/)
  })

  it('DENY: collectors cannot change or delete a consent, or set signatures directly', async () => {
    const p = await participant(A)
    await consent(A, p, { signatures: ['participant'] })
    expect((await db.query(`select signatures from public.consents`)).rows).toEqual([{ signatures: [] }])
    await expect(as(A, `update public.consents set participant_name = 'X'`)).rejects.toThrow(/permission denied/)
    await expect(as(A, `delete from public.consents`)).rejects.toThrow(/permission denied/)
  })
})

describe('F4 has_consent and signatures', () => {
  it('owner gets true/false; another collector always false', async () => {
    const p = await participant(A)
    const has = (who: string) => as<{ v: boolean }>(who, `select public.has_consent($1) as v`, [p]).then((r) => r.rows[0].v)
    expect(await has(A)).toBe(false)
    await consent(A, p)
    expect(await has(A)).toBe(true)
    expect(await has(B)).toBe(false)
    expect(await has(ADMIN)).toBe(true)
    await expect(as('anon', `select public.has_consent($1)`, [p])).rejects.toThrow(/permission denied/)
  })

  it('mark_signature_uploaded: owner only, known slots, no duplicates', async () => {
    const p = await participant(A, { age: 'child' })
    await consent(A, p, { guardian_name: 'Parent', child_assent: true })
    await as(A, `select public.mark_signature_uploaded($1, 'guardian')`, [p])
    await as(A, `select public.mark_signature_uploaded($1, 'guardian')`, [p])
    await as(A, `select public.mark_signature_uploaded($1, 'assent')`, [p])
    expect((await db.query(`select signatures from public.consents`)).rows).toEqual([{ signatures: ['assent', 'guardian'] }])
    await expect(as(B, `select public.mark_signature_uploaded($1, 'guardian')`, [p])).rejects.toThrow(/no such consent/)
    await expect(as(A, `select public.mark_signature_uploaded($1, 'face')`, [p])).rejects.toThrow(/bad slot/)
  })
})

describe('F4 receipt codes', () => {
  it('ALLOW: easy-alphabet 7-character code; DENY: bad format or a duplicate', async () => {
    await participant(A, { receipt: 'R7K2MPQ' })
    await expect(participant(A, { receipt: 'R7K-2MPQ' })).rejects.toThrow(/receipt_code_check/)
    await expect(participant(A, { receipt: 'O0I1LAB' })).rejects.toThrow(/receipt_code_check/)
    await expect(participant(B, { receipt: 'R7K2MPQ' })).rejects.toThrow(/duplicate|unique/)
  })

  it('the collector can add the receipt code after creating the participant', async () => {
    const p = await participant(A)
    await as(A, `update public.participants set receipt_code = 'ABCD234' where id = $1`, [p])
    expect((await as(A, `select receipt_code from public.participants where id = $1`, [p])).rows).toEqual([{ receipt_code: 'ABCD234' }])
  })
})

describe('F4 withdrawal', () => {
  it('ALLOW: admin previews (no name), withdraws, consent cascades, log keeps only a fingerprint', async () => {
    await openGateB()
    const p = await participant(A, { practice: false, receipt: 'R7K2MPQ' })
    await consent(A, p, { consent_version: 'v1', participant_name: 'Real Person' })
    const prev = await as<Record<string, unknown>>(ADMIN, `select * from public.admin_withdraw_preview('r7k-2mpq')`)
    expect(prev.rows[0]).toMatchObject({ is_found: true, already_withdrawn: false, is_practice: false, age_group: 'adult', collector_name: 'Ama' })
    expect(JSON.stringify(prev.rows)).not.toContain('Real Person')

    const out = await as<{ id: string }>(ADMIN, `select public.admin_withdraw('R7K 2MPQ') as id`)
    expect(out.rows[0].id).toBe(p)
    expect((await db.query(`select 1 from public.participants where id = $1`, [p])).rows).toHaveLength(0)
    expect((await db.query(`select 1 from public.consents`)).rows).toHaveLength(0)
    const log = await db.query<Record<string, unknown>>(`select * from public.withdrawals`)
    expect(log.rows).toHaveLength(1)
    expect(JSON.stringify(log.rows)).not.toContain('R7K2MPQ')

    const again = await as<Record<string, unknown>>(ADMIN, `select * from public.admin_withdraw_preview('R7K2MPQ')`)
    expect(again.rows[0]).toMatchObject({ is_found: false, already_withdrawn: true })
    expect((await as<{ id: string | null }>(ADMIN, `select public.admin_withdraw('R7K2MPQ') as id`)).rows[0].id).toBeNull()
  })

  it('unknown or malformed codes withdraw nothing', async () => {
    expect((await as<{ id: string | null }>(ADMIN, `select public.admin_withdraw('ZZZZZZZ') as id`)).rows[0].id).toBeNull()
    expect((await as<{ id: string | null }>(ADMIN, `select public.admin_withdraw('bad') as id`)).rows[0].id).toBeNull()
  })

  it('DENY: collectors and anon cannot preview, withdraw or read the log', async () => {
    await participant(A, { receipt: 'R7K2MPQ' })
    await expect(as(A, `select * from public.admin_withdraw_preview('R7K2MPQ')`)).rejects.toThrow(/not allowed/)
    await expect(as(A, `select public.admin_withdraw('R7K2MPQ')`)).rejects.toThrow(/not allowed/)
    await expect(as('anon', `select public.admin_withdraw('R7K2MPQ')`)).rejects.toThrow(/permission denied/)
    expect((await as(A, `select * from public.withdrawals`)).rows).toHaveLength(0)
    await expect(as(A, `insert into public.withdrawals (receipt_sha256, was_practice, withdrawn_by) values (repeat('a', 64), true, $1)`, [A])).rejects.toThrow(/permission denied/)
  })
})

describe('F4 my_participants', () => {
  it('own rows only (admins too), with a consent yes/no and never a name', async () => {
    const mine = await participant(A, { receipt: 'ABCD234' })
    await consent(A, mine)
    await participant(A)
    await participant(B)
    await participant(ADMIN)
    const rows = await as<Record<string, unknown>>(A, `select * from public.my_participants(true)`)
    expect(rows.rows).toHaveLength(2)
    expect(rows.rows.find((r) => r.id === mine)).toMatchObject({ receipt_code: 'ABCD234', has_consent: true })
    expect(JSON.stringify(rows.rows)).not.toContain('Practice Person')
    expect((await as(ADMIN, `select * from public.my_participants(true)`)).rows).toHaveLength(1)
    expect((await as(A, `select * from public.my_participants(false)`)).rows).toHaveLength(0)
    await expect(as('anon', `select * from public.my_participants(true)`)).rejects.toThrow(/permission denied/)
  })
})
