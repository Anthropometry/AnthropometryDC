/**
 * M2 database rules: F2 settings + phone checks, F3 practice mode (specs/F2-home-settings.md,
 * specs/F3-practice-mode.md). In-memory PGlite only.
 */
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, runAs, seed } from './helpers'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const P = '00000000-0000-4000-8000-00000000000c' // pending
const ADMIN = '00000000-0000-4000-8000-0000000000ad'
let db: PGlite

const as = <T = Record<string, unknown>>(who: string, sql: string, params: unknown[] = []) =>
  runAs<T>(db, who, sql, params)

const practice = (who: string, id = crypto.randomUUID()) =>
  as<{ practice_no: number }>(
    who,
    `insert into public.participants (id, collector_id, is_practice, age_group) values ($1, $2, true, 'adult') returning practice_no`,
    [id, who],
  ).then((r) => ({ id, no: r.rows[0].practice_no }))

const real = (who: string) =>
  as(who, `insert into public.participants (collector_id, is_practice, age_group) values ($1, false, 'adult')`, [who])

const openCollection = () => as(ADMIN, `update public.app_settings set collection_open = true`)

const check = (who: string, over: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = {
    phone_model: 'TECNO KI5',
    os: 'Android 14',
    browser: 'Chrome 140',
    camera_ok: true,
    camera_resolution: '1920x1080',
    motion_ok: true,
    storage_ok: true,
    storage_mb: 2048,
    passed: true,
    ...over,
  }
  const cols = Object.keys(row)
  const marks = cols.map((_, i) => `$${i + 1}`).join(', ')
  return as(who, `insert into public.device_checks (${cols.join(', ')}) values (${marks})`, Object.values(row))
}

beforeEach(async () => {
  db = await createDb()
  await seed(
    db,
    `insert into auth.users (id) values ('${A}'), ('${B}'), ('${P}'), ('${ADMIN}');
     insert into public.collectors (id, phone, role, status, display_name) values
       ('${A}', '+233241111111', 'collector', 'approved', 'Ama'),
       ('${B}', '+233242222222', 'collector', 'approved', 'Kofi'),
       ('${P}', '+233244444444', 'collector', 'pending', 'Esi'),
       ('${ADMIN}', '+233243333333', 'admin', 'approved', 'Lead')`,
  )
})

describe('F2: settings chosen once', () => {
  it('ALLOW: saving unit and language sets settings_chosen_at (even with the default values)', async () => {
    await as(A, `update public.collectors set unit = 'cm', language = 'en' where id = $1`, [A])
    const { rows } = await as<{ settings_chosen_at: string | null }>(
      A,
      `select settings_chosen_at from public.collectors where id = $1`,
      [A],
    )
    expect(rows[0].settings_chosen_at).not.toBeNull()
  })

  it('DENY: a collector cannot write settings_chosen_at, role or status', async () => {
    for (const col of [`settings_chosen_at = now()`, `role = 'admin'`, `status = 'approved'`]) {
      await expect(as(A, `update public.collectors set ${col} where id = $1`, [A])).rejects.toThrow(/permission denied/)
    }
  })

  it('DENY: a pending collector cannot save settings', async () => {
    const res = await as(P, `update public.collectors set unit = 'in' where id = $1`, [P])
    expect(res.affectedRows).toBe(0)
  })
})

describe('F2: phone checks', () => {
  it('ALLOW: an approved collector saves and reads own checks; admin sees the latest per collector', async () => {
    await check(A, { passed: false, camera_ok: false })
    await check(A)
    await check(B)
    expect((await as(A, `select * from public.device_checks`)).rows).toHaveLength(2)
    const { rows } = await as<{ display_name: string; passed: boolean }>(ADMIN, `select * from public.admin_phone_checks()`)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.display_name === 'Ama')?.passed).toBe(true)
  })

  it("DENY: another collector's checks are invisible; pending and anon cannot save", async () => {
    await check(B)
    expect((await as(A, `select * from public.device_checks`)).rows).toHaveLength(0)
    await expect(check(P)).rejects.toThrow(/row-level security/)
    await expect(check('anon')).rejects.toThrow(/permission denied/)
    await expect(as('anon', `select * from public.device_checks`)).rejects.toThrow(/permission denied/)
  })

  it('DENY: checks for someone else, a passed flag that does not match, bad resolution', async () => {
    await expect(check(A, { collector_id: B })).rejects.toThrow(/row-level security/)
    await expect(check(A, { camera_ok: false, passed: true })).rejects.toThrow(/check/)
    await expect(check(A, { camera_resolution: 'big' })).rejects.toThrow(/check/)
  })

  it('DENY: checks cannot be changed or deleted; collectors cannot use the admin list', async () => {
    await check(A)
    await expect(as(A, `update public.device_checks set passed = false`)).rejects.toThrow(/permission denied/)
    await expect(as(A, `delete from public.device_checks`)).rejects.toThrow(/permission denied/)
    await expect(as(A, `select * from public.admin_phone_checks()`)).rejects.toThrow(/not allowed/)
  })
})

describe('F3: practice mode', () => {
  it('ALLOW: practice numbers count up per collector, whatever the phone sends', async () => {
    expect((await practice(A)).no).toBe(1)
    expect((await practice(A)).no).toBe(2)
    expect((await practice(B)).no).toBe(1)
    const { rows } = await as<{ practice_no: number }>(
      A,
      `insert into public.participants (collector_id, is_practice, age_group, practice_no) values ($1, true, 'child', 99) returning practice_no`,
      [A],
    )
    expect(rows[0].practice_no).toBe(3)
  })

  it('DENY: real participants while closed; allowed (with no practice number) once the admin opens', async () => {
    await expect(real(A)).rejects.toThrow(/IRB/)
    await openCollection()
    await real(A)
    const { rows } = await as<{ practice_no: number | null }>(
      A,
      `select practice_no from public.participants where not is_practice`,
    )
    expect(rows[0].practice_no).toBeNull()
  })

  it('DENY: is_practice and practice_no are fixed once saved, even for the database owner', async () => {
    const { id } = await practice(A)
    await openCollection()
    await expect(as(A, `update public.participants set is_practice = false where id = $1`, [id])).rejects.toThrow(
      /permission denied/,
    )
    await expect(db.query(`update public.participants set is_practice = false where id = $1`, [id])).rejects.toThrow(/fixed/)
    await expect(db.query(`update public.participants set practice_no = 7 where id = $1`, [id])).rejects.toThrow(/fixed/)
  })

  it('ALLOW: a collector deletes own practice participant, with its practice consent', async () => {
    const { id } = await practice(A)
    await as(
      A,
      `insert into public.consents (participant_id, participant_name, language, consent_version, agreed_data, agreed_photos, signed_at)
       values ($1, 'Practice Person', 'en', 'practice', true, true, now())`,
      [id],
    )
    const res = await as(A, `delete from public.participants where id = $1`, [id])
    expect(res.affectedRows).toBe(1)
    expect((await db.query(`select 1 from public.consents where participant_id = $1`, [id])).rows).toHaveLength(0)
  })

  it("DENY: no deleting real participants, others' practice, or as pending/anon", async () => {
    await openCollection()
    await real(A)
    expect((await as(A, `delete from public.participants where not is_practice`)).affectedRows).toBe(0)
    const { id } = await practice(B)
    expect((await as(A, `delete from public.participants where id = $1`, [id])).affectedRows).toBe(0)
    expect((await as(P, `delete from public.participants`)).affectedRows).toBe(0)
    await expect(as('anon', `delete from public.participants`)).rejects.toThrow(/permission denied/)
  })

  it('real_participants never shows practice rows and keeps row-level security', async () => {
    await practice(A)
    await openCollection()
    await real(A)
    await real(B)
    const mine = await as<{ is_practice: boolean }>(A, `select is_practice from public.real_participants`)
    expect(mine.rows).toEqual([{ is_practice: false }])
    expect((await as(ADMIN, `select 1 from public.real_participants`)).rows).toHaveLength(2)
    await expect(as('anon', `select 1 from public.real_participants`)).rejects.toThrow(/permission denied/)
  })

  it('DENY: a collector cannot open collection', async () => {
    const res = await as(A, `update public.app_settings set collection_open = true`)
    expect(res.affectedRows).toBe(0)
  })
})
