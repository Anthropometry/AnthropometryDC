/**
 * F6 photo records + F5 Amendment B (stated height and weight). In-memory PGlite only.
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

/** A consented practice participant; optionally with measurements finished (set directly as owner). */
async function participant(who: string, opts: { measured?: boolean; weight?: boolean } = {}) {
  const id = crypto.randomUUID()
  await as(who, `insert into public.participants (id, collector_id, is_practice, age_group) values ($1, $2, true, 'adult')`, [id, who])
  await as(
    who,
    `insert into public.consents (participant_id, participant_name, language, consent_version, agreed_data, agreed_photos, agreed_weight, signed_at)
     values ($1, 'Practice Person', 'en', 'practice', true, true, $2, now())`,
    [id, opts.weight ?? false],
  )
  if (opts.measured) {
    await db.query(`alter table public.participants disable trigger participants_guard_measuring`)
    await db.query(`update public.participants set measurements_done_at = now() where id = $1`, [id])
    await db.query(`alter table public.participants enable trigger participants_guard_measuring`)
  }
  return id
}

function photo(who: string, participantId: string, slot: string, over: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    participant_id: participantId,
    slot,
    width: 1200,
    height: 1600,
    bytes: 350000,
    taken_at: new Date().toISOString(),
    faces_detected: 1,
    level_pitch: 0.4,
    level_roll: -0.2,
    phone_model: 'TECNO KI5',
    a4_confirmed: true,
    ...over,
  }
  const cols = Object.keys(row)
  const marks = cols.map((_, i) => `$${i + 1}`).join(', ')
  return as(who, `insert into public.photos (${cols.join(', ')}) values (${marks})`, Object.values(row))
}

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

describe('F5 Amendment B: stated height and weight', () => {
  const told = async (id: string) =>
    (await db.query<{ cm: string | null }>(`select height_told_cm::text as cm from public.participants where id = $1`, [id])).rows[0].cm

  it('stated height in cm or feet+inches is recomputed by the database; "doesn\'t know" is null', async () => {
    const p = await participant(A)
    await as(A, `update public.participants set height_told_typed = '170.5', height_told_unit = 'cm' where id = $1`, [p])
    expect(await told(p)).toBe('170.5')
    await as(A, `update public.participants set height_told_typed = '5 7 1/2', height_told_unit = 'ftin' where id = $1`, [p])
    expect(await told(p)).toBe('171.5')
    await as(A, `update public.participants set height_told_typed = '5 7', height_told_unit = 'ftin' where id = $1`, [p])
    expect(await told(p)).toBe('170.2')
    await as(A, `update public.participants set height_told_typed = null, height_told_unit = null where id = $1`, [p])
    expect(await told(p)).toBeNull()
  })

  it.each([
    ['5 12', 'ftin'],
    ['5 7 2/8', 'ftin'],
    ['9 0', 'ftin'],
    ['1 2', 'ftin'], // 35.6 cm: below 50
    ['170.55', 'cm'],
    ['300', 'cm'],
  ])('DENY: stated height %s (%s)', async (typed, unit) => {
    const p = await participant(A)
    await expect(as(A, `update public.participants set height_told_typed = $2, height_told_unit = $3 where id = $1`, [p, typed, unit])).rejects.toThrow(/stated height refused/)
  })

  it('DENY: typed without a unit; collectors cannot write height_told_cm', async () => {
    const p = await participant(A)
    await expect(as(A, `update public.participants set height_told_typed = '170' where id = $1`, [p])).rejects.toThrow(/height_told_pair|stated height refused/)
    await expect(as(A, `update public.participants set height_told_cm = 170 where id = $1`, [p])).rejects.toThrow(/permission denied/)
  })

  it('stated weight only with the weight tick; both stated and scale weight can be stored', async () => {
    const no = await participant(A)
    await expect(as(A, `update public.participants set weight_told_kg = 70 where id = $1`, [no])).rejects.toThrow(/not agreed/)
    const yes = await participant(A, { weight: true })
    await as(A, `update public.participants set weight_told_kg = 70, weight_kg = 72.4, weight_source = 'scale' where id = $1`, [yes])
    const { rows } = await db.query<Record<string, unknown>>(`select weight_told_kg::text as t, weight_kg::text as k from public.participants where id = $1`, [yes])
    expect(rows[0]).toEqual({ t: '70.0', k: '72.4' })
  })
})

describe('F6: photo records', () => {
  it('DENY: before measurements are finished; ALLOW after', async () => {
    const p = await participant(A)
    await expect(photo(A, p, 'front')).rejects.toThrow(/finish the measurements/)
    const q = await participant(A, { measured: true })
    await photo(A, q, 'front')
    expect((await as(A, `select slot from public.photos`)).rows).toEqual([{ slot: 'front' }])
  })

  it('a retake updates the same slot; slot and participant are fixed; no deletes', async () => {
    const p = await participant(A, { measured: true })
    await photo(A, p, 'front')
    await expect(photo(A, p, 'front')).rejects.toThrow(/duplicate|unique/)
    await as(A, `update public.photos set bytes = 400000, a4_confirmed = false, zoom = 2.3 where participant_id = $1 and slot = 'front'`, [p])
    await expect(as(A, `update public.photos set slot = 'side'`)).rejects.toThrow(/permission denied/)
    await expect(as(A, `delete from public.photos`)).rejects.toThrow(/permission denied/)
  })

  it('DENY: bad slot, too large, no A4 answer; another collector; anon; collectors read only their own', async () => {
    const p = await participant(A, { measured: true })
    await expect(photo(A, p, 'top')).rejects.toThrow(/slot_check/)
    await expect(photo(A, p, 'front', { bytes: 5_000_000 })).rejects.toThrow(/bytes_check/)
    await expect(photo(A, p, 'front', { a4_confirmed: null })).rejects.toThrow(/null value|not-null/)
    await expect(photo(A, p, 'front', { zoom: 5 })).rejects.toThrow(/zoom_check/)
    await expect(photo(B, p, 'front')).rejects.toThrow(/row-level security/)
    await expect(photo('anon', p, 'front')).rejects.toThrow(/permission denied/)
    await photo(A, p, 'front')
    expect((await as(B, `select 1 from public.photos`)).rows).toHaveLength(0)
    expect((await as(ADMIN, `select 1 from public.photos`)).rows).toHaveLength(1)
  })

  it('photos done only with front and side (back optional); the list shows it', async () => {
    const p = await participant(A, { measured: true })
    const done = () => as(A, `update public.participants set photos_done_at = now() where id = $1`, [p])
    await photo(A, p, 'front')
    await expect(done()).rejects.toThrow(/front and side/)
    await photo(A, p, 'side')
    await done()
    const { rows } = await as<{ photos_done: boolean }>(A, `select photos_done from public.my_participants(true) where id = $1`, [p])
    expect(rows[0].photos_done).toBe(true)
  })

  it('withdrawal deletes photo records; exports include the new columns', async () => {
    const p = await participant(A, { measured: true })
    await photo(A, p, 'front')
    await db.query(`update public.participants set receipt_code = 'R7K2MPQ' where id = $1`, [p])
    await as(ADMIN, `select public.admin_withdraw('R7K2MPQ')`)
    expect((await db.query(`select 1 from public.photos`)).rows).toHaveLength(0)
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'real_participants' and column_name in ('height_told_cm', 'weight_told_kg', 'photos_done_at')`,
    )
    expect(cols.rows).toHaveLength(3)
  })
})
