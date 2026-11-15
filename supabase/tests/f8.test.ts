/**
 * F8 admin progress: counts only, admins only, practice and real apart. In-memory PGlite only.
 */
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, runAs, seed } from './helpers'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const ADMIN = '00000000-0000-4000-8000-0000000000ad'
let db: PGlite

const as = <T = Record<string, unknown>>(who: string, sql: string, params: unknown[] = []) => runAs<T>(db, who, sql, params)

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

interface P {
  who?: string
  practice?: boolean
  child?: boolean
  sex?: 'female' | 'male'
  range?: string
  measured?: boolean
  photos?: boolean
  consent?: boolean
  rejected?: boolean
  height?: number
  told?: number
}

/** A participant, set straight in the tables (triggers off): only the shape the counts read. */
async function participant(o: P = {}) {
  const id = crypto.randomUUID()
  const who = o.who ?? A
  await db.query(`set session_replication_role = replica`)
  await db.query(
    `insert into public.participants (id, collector_id, is_practice, age_group, status, sex, age_range, measurements_done_at, photos_done_at, height_told_cm)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, who, o.practice ?? false, o.child ? 'child' : 'adult', o.rejected ? 'rejected' : 'draft', o.sex ?? 'female', o.range ?? (o.child ? '10-12' : '25-34'),
      o.measured || o.photos ? new Date().toISOString() : null, o.photos ? new Date().toISOString() : null, o.told ?? null],
  )
  if (o.consent !== false)
    await db.query(
      `insert into public.consents (participant_id, collector_id, participant_name, language, consent_version, agreed_data, agreed_photos, signed_at)
       values ($1, $2, 'Secret Name', 'en', 'practice', true, true, now())`,
      [id, who],
    )
  if (o.height !== undefined)
    await db.query(
      `insert into public.measurements (participant_id, collector_id, code, unit, readings_typed, readings_cm, value_cm, height_method)
       values ($1, $2, 'height', 'cm', array[$3::text, $3::text], array[$3::numeric, $3::numeric], $3::numeric, 'steel_tape')`,
      [id, who, String(o.height)],
    )
  await db.query(`set session_replication_role = origin`)
  return id
}

describe('F8 admin progress', () => {
  it('totals by sex, adult/child and age range: complete, measured without photos, consent only; real and practice apart', async () => {
    await participant({ photos: true })
    await participant({ photos: true, sex: 'male', range: '35-44' })
    await participant({ measured: true })
    await participant({})
    await participant({ child: true, sex: 'female', photos: true })
    await participant({ practice: true, photos: true })
    await participant({ consent: false }) // no consent: not counted
    await participant({ rejected: true }) // child said no: not counted
    const { rows } = await as<{ sex: string; age_group: string; age_range: string; complete: number; measured_no_photos: number; consented_not_measured: number }>(
      ADMIN,
      `select * from public.admin_progress(false)`,
    )
    expect(rows).toEqual([
      { sex: 'female', age_group: 'adult', age_range: '25-34', complete: 1, measured_no_photos: 1, consented_not_measured: 1 },
      { sex: 'male', age_group: 'adult', age_range: '35-44', complete: 1, measured_no_photos: 0, consented_not_measured: 0 },
      { sex: 'female', age_group: 'child', age_range: '10-12', complete: 1, measured_no_photos: 0, consented_not_measured: 0 },
    ])
    const practice = await as<{ complete: number }>(ADMIN, `select complete from public.admin_progress(true)`)
    expect(practice.rows).toEqual([{ complete: 1 }])
    const week = await as<{ complete: number }>(ADMIN, `select complete from public.admin_weekly(false)`)
    expect(week.rows).toEqual([{ complete: 3 }])
  })

  it('per collector: complete, partial follow-ups, practice done, last sent', async () => {
    await participant({ photos: true })
    await participant({ measured: true })
    await participant({ practice: true, photos: true })
    await participant({ who: B })
    const { rows } = await as<{ collector_id: string; complete_total: number; complete_week: number; measured_no_photos: number; consented_not_measured: number; practice_complete: number; last_sent_at: string | null }>(
      ADMIN,
      `select * from public.admin_collector_progress()`,
    )
    const a = rows.find((r) => r.collector_id === A)!
    const b = rows.find((r) => r.collector_id === B)!
    expect(a).toMatchObject({ complete_total: 1, complete_week: 1, measured_no_photos: 1, consented_not_measured: 0, practice_complete: 1 })
    expect(a.last_sent_at).not.toBeNull()
    expect(b).toMatchObject({ complete_total: 0, consented_not_measured: 1 })
  })

  it('height bands, quality and space: counts only', async () => {
    await participant({ height: 171.5, told: 175, measured: true })
    await participant({ height: 158.2, measured: true })
    const bands = await as<{ sex: string; band_cm: number; n: number }>(ADMIN, `select sex, band_cm, n from public.admin_height_bands(false)`)
    expect(bands.rows).toEqual([
      { sex: 'female', band_cm: 150, n: 1 },
      { sex: 'female', band_cm: 170, n: 1 },
    ])
    const q = await as<{ item: string; detail: string | null; n: string }>(ADMIN, `select * from public.admin_quality(false)`)
    expect(q.rows.find((r) => r.item === 'height_stated_minus_measured_cm')?.n).toBe('3.5')
    expect(q.rows.find((r) => r.item === 'withdrawals')?.n).toBe('0')
    const s = await as<{ database_bytes: string; photos: number }>(ADMIN, `select * from public.admin_space()`)
    expect(Number(s.rows[0].database_bytes)).toBeGreaterThan(0)
    expect(s.rows[0].photos).toBe(0)
  })

  it('DENY: no function returns a name or receipt code (counts only)', async () => {
    await participant({ photos: true })
    for (const sql of [
      'select * from public.admin_progress(false)',
      'select * from public.admin_weekly(false)',
      'select * from public.admin_collector_progress()',
      'select * from public.admin_height_bands(false)',
      'select * from public.admin_quality(false)',
    ]) {
      const { rows } = await as(ADMIN, sql)
      expect(JSON.stringify(rows)).not.toMatch(/Secret Name|R7K/)
    }
  })

  it('DENY: a collector or anon gets nothing', async () => {
    for (const sql of [
      'select * from public.admin_progress(false)',
      'select * from public.admin_weekly(false)',
      'select * from public.admin_collector_progress()',
      'select * from public.admin_height_bands(false)',
      'select * from public.admin_quality(false)',
      'select * from public.admin_space()',
    ]) {
      await expect(as(A, sql)).rejects.toThrow(/not allowed/)
      await expect(as('anon', sql)).rejects.toThrow(/permission denied/)
    }
  })
})
