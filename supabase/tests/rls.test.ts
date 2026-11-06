/**
 * Database-rule tests for the core tables. Every migration in supabase/migrations is applied, in
 * order, to an in-memory PGlite database (see helpers.ts). No real data is touched.
 * Deny cases first: that is where security bugs hide. F1 onboarding rules: f1.test.ts.
 */
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, runAs, seed } from './helpers'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const ADMIN = '00000000-0000-4000-8000-0000000000ad'
const PA = '10000000-0000-4000-8000-00000000000a' // A practice participant
const PB = '10000000-0000-4000-8000-00000000000b' // B practice participant

let db: PGlite

async function freshDb() {
  const pg = await createDb()
  // Seed as the database owner with triggers off, like an admin import. All approved.
  await seed(pg, `
    insert into auth.users (id) values ('${A}'), ('${B}'), ('${ADMIN}');
    insert into public.collectors (id, phone, role, status) values
      ('${A}', '+233241111111', 'collector', 'approved'),
      ('${B}', '+233242222222', 'collector', 'approved'),
      ('${ADMIN}', '+233243333333', 'admin', 'approved');
    insert into public.participants (id, collector_id, is_practice, age_group) values
      ('${PA}', '${A}', true, 'adult'),
      ('${PB}', '${B}', true, 'child');
    insert into public.consents
      (participant_id, collector_id, participant_name, language, consent_version,
       agreed_data, agreed_photos, signed_at)
    values ('${PA}', '${A}', 'Test Person', 'en', 'practice', true, true, now())
  `)
  return pg
}

/** Run SQL as a logged-in user (role authenticated, auth.uid() = id), or as anon. */
const as = <T = Record<string, unknown>>(who: string, sql: string, params: unknown[] = []) =>
  runAs<T>(db, who, sql, params)

const newParticipant = (collector: string, practice: boolean, id = crypto.randomUUID()) =>
  `insert into public.participants (id, collector_id, is_practice, age_group)
   values ('${id}', '${collector}', ${practice}, 'adult')`

const newConsent = (participant: string) =>
  `insert into public.consents
     (participant_id, participant_name, language, consent_version, agreed_data, agreed_photos, signed_at)
   values ('${participant}', 'Someone', 'en', 'practice', true, true, now())`

beforeEach(async () => {
  db = await freshDb()
})

describe('participants: collectors see and change only their own', () => {
  it('collector A sees only A participants', async () => {
    const { rows } = await as<{ id: string }>(A, `select id from public.participants`)
    expect(rows.map((r) => r.id)).toEqual([PA])
  })

  it('DENY: A cannot read B participant by id', async () => {
    const { rows } = await as(A, `select id from public.participants where id = $1`, [PB])
    expect(rows).toHaveLength(0)
  })

  it('DENY: A cannot create a participant owned by B', async () => {
    await expect(as(A, newParticipant(B, true))).rejects.toThrow(/row-level security/)
  })

  it('DENY: A cannot change B participant (no rows touched)', async () => {
    const res = await as(A, `update public.participants set status = 'rejected' where id = $1`, [PB])
    expect(res.affectedRows).toBe(0)
  })

  it('DENY: A cannot move own participant to B', async () => {
    await expect(as(A, `update public.participants set collector_id = $1 where id = $2`, [B, PA])).rejects.toThrow(
      /permission denied/,
    )
  })

  it('DENY: collectors cannot delete participants', async () => {
    await expect(as(A, `delete from public.participants where id = $1`, [PA])).rejects.toThrow(/permission denied/)
  })

  it('ALLOW: A creates an own practice participant', async () => {
    await as(A, newParticipant(A, true))
    const { rows } = await as(A, `select id from public.participants`)
    expect(rows).toHaveLength(2)
  })

  it('ALLOW: admin sees every participant', async () => {
    const { rows } = await as(ADMIN, `select id from public.participants`)
    expect(rows).toHaveLength(2)
  })
})

describe('consents: collectors write but never read', () => {
  it('DENY: A cannot read consents, even own', async () => {
    const { rows } = await as(A, `select * from public.consents`)
    expect(rows).toHaveLength(0)
  })

  it('DENY: A cannot write a consent for B participant', async () => {
    await expect(as(A, newConsent(PB))).rejects.toThrow(/row-level security/)
  })

  it('DENY: a consent needs both ticks', async () => {
    const id = crypto.randomUUID()
    await as(A, newParticipant(A, true, id))
    await expect(as(A, newConsent(id).replace('true, true', 'true, false'))).rejects.toThrow(/check constraint/)
  })

  it('ALLOW: A writes a consent for an own participant', async () => {
    const id = crypto.randomUUID()
    await as(A, newParticipant(A, true, id))
    await expect(as(A, newConsent(id))).resolves.toBeDefined()
  })

  it('ALLOW: admin can read consents', async () => {
    const { rows } = await as(ADMIN, `select participant_id from public.consents`)
    expect(rows).toHaveLength(1)
  })
})

describe('IRB gate: no real participants until collection opens', () => {
  it('DENY: real participant refused while collection is closed', async () => {
    await expect(as(A, newParticipant(A, false))).rejects.toThrow(/collection is closed/i)
  })

  it('DENY: practice participant cannot be switched to real while closed', async () => {
    await expect(as(A, `update public.participants set is_practice = false where id = $1`, [PA])).rejects.toThrow(
      /permission denied/,
    )
  })

  it('DENY: a collector cannot open collection', async () => {
    const res = await as(A, `update public.app_settings set collection_open = true`)
    expect(res.affectedRows).toBe(0)
    const { rows } = await db.query<{ collection_open: boolean }>(`select collection_open from public.app_settings`)
    expect(rows[0].collection_open).toBe(false)
  })

  it('ALLOW: after admin opens collection, real participants are accepted', async () => {
    await as(ADMIN, `update public.app_settings set collection_open = true, updated_by = auth.uid()`)
    await expect(as(A, newParticipant(A, false))).resolves.toBeDefined()
  })
})

describe('collector settings: only unit and language', () => {
  it('ALLOW: A changes own unit and language', async () => {
    await as(A, `update public.collectors set unit = 'in', language = 'tw' where id = $1`, [A])
    const { rows } = await as<{ unit: string; language: string }>(A, `select unit, language from public.collectors`)
    expect(rows).toEqual([{ unit: 'in', language: 'tw' }])
  })

  it('DENY: A cannot promote self to admin', async () => {
    await expect(as(A, `update public.collectors set role = 'admin' where id = $1`, [A])).rejects.toThrow(
      /permission denied/,
    )
  })

  it('DENY: A cannot change own phone', async () => {
    await expect(as(A, `update public.collectors set phone = '+233249999999' where id = $1`, [A])).rejects.toThrow(
      /permission denied/,
    )
  })

  it('DENY: A cannot change B settings', async () => {
    const res = await as(A, `update public.collectors set unit = 'in' where id = $1`, [B])
    expect(res.affectedRows).toBe(0)
  })

  it('DENY: A sees only own collector row', async () => {
    const { rows } = await as(A, `select id from public.collectors`)
    expect(rows).toEqual([{ id: A }])
  })

  it('DENY: invalid unit or language is refused', async () => {
    await expect(as(A, `update public.collectors set unit = 'ft' where id = $1`, [A])).rejects.toThrow(
      /check constraint/,
    )
  })

  it('DENY: collectors cannot insert collector rows (no self sign-up)', async () => {
    await expect(
      as(A, `insert into public.collectors (id, phone) values ($1, '+233240000000')`, [A]),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('anonymous users get nothing', () => {
  it.each(['participants', 'consents', 'collectors', 'app_settings'])('DENY: anon cannot read %s', async (table) => {
    await expect(as('anon', `select * from public.${table}`)).rejects.toThrow(/permission denied/)
  })

  it('DENY: anon cannot create participants', async () => {
    await expect(as('anon', newParticipant(A, true))).rejects.toThrow(/permission denied/)
  })
})
