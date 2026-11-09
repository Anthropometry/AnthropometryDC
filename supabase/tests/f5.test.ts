/**
 * F5 database rules (specs/F5-measurements.md): consent first, sets by sex and age, intimate tick,
 * cm recomputed by the database, ×2 readings, Finish completeness, cascade on withdrawal.
 * In-memory PGlite only.
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

/** A consented practice participant of `who`, with sex and age recorded. */
async function ready(
  who: string,
  opts: { sex?: 'female' | 'male'; age?: number; child?: boolean; intimate?: boolean; consent?: boolean } = {},
) {
  const id = crypto.randomUUID()
  const child = opts.child ?? false
  await as(who, `insert into public.participants (id, collector_id, is_practice, age_group) values ($1, $2, true, $3)`, [
    id,
    who,
    child ? 'child' : 'adult',
  ])
  if (opts.consent !== false) {
    await as(
      who,
      `insert into public.consents (participant_id, participant_name, guardian_name, language, consent_version, agreed_data, agreed_photos, agreed_intimate, child_assent, signed_at)
       values ($1, 'Practice Person', $2, 'en', 'practice', true, true, $3, $4, now())`,
      [id, child ? 'Guardian' : null, opts.intimate ?? true, child ? true : null],
    )
  }
  if (opts.sex !== undefined || opts.age !== undefined) {
    await as(who, `update public.participants set sex = $2, age_years = $3, clothing = 'light' where id = $1`, [
      id,
      opts.sex ?? 'female',
      opts.age ?? (child ? 10 : 30),
    ])
  }
  return id
}

function measure(
  who: string,
  participant: string,
  code: string,
  typed: string[],
  over: Record<string, unknown> = {},
) {
  const row: Record<string, unknown> = {
    participant_id: participant,
    code,
    unit: 'cm',
    readings_typed: typed,
    ...(code === 'height' ? { height_method: 'steel_tape' } : {}),
    ...over,
  }
  const cols = Object.keys(row)
  const marks = cols.map((_, i) => `$${i + 1}`).join(', ')
  return as(who, `insert into public.measurements (${cols.join(', ')}) values (${marks})`, Object.values(row))
}

const value = async (participant: string, code: string) =>
  (
    await db.query<{ value_cm: string | null; readings_cm: string[] }>(
      `select value_cm::text, readings_cm::text[] from public.measurements where participant_id = $1 and code = $2`,
      [participant, code],
    )
  ).rows[0]

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

describe('F5: consent first, then sex and age', () => {
  it('DENY: no consent; no sex/age yet; rejected participant', async () => {
    const noConsent = await ready(A, { consent: false })
    await db.query(`update public.participants set sex = 'female', age_years = 30 where id = $1`, [noConsent])
    await expect(measure(A, noConsent, 'neck_girth', ['34.5'])).rejects.toThrow(/no consent/)
    const noSex = await ready(A)
    await expect(measure(A, noSex, 'neck_girth', ['34.5'])).rejects.toThrow(/sex and age/)
    const rej = await ready(A, { sex: 'female' })
    await db.query(`update public.participants set status = 'rejected' where id = $1`, [rej])
    await expect(measure(A, rej, 'neck_girth', ['34.5'])).rejects.toThrow(/rejected/)
  })

  it('age must fit the group; children from 8; collectors cannot set intimate_ok', async () => {
    const adult = await ready(A)
    await expect(as(A, `update public.participants set age_years = 17 where id = $1`, [adult])).rejects.toThrow(/age_fits_group/)
    const child = await ready(A, { child: true })
    await expect(as(A, `update public.participants set age_years = 7 where id = $1`, [child])).rejects.toThrow(/age_fits_group/)
    await as(A, `update public.participants set age_years = 8 where id = $1`, [child])
    await expect(as(A, `update public.participants set intimate_ok = true where id = $1`, [child])).rejects.toThrow(/permission denied/)
  })

  it("the consent's intimate answer is copied to the participant", async () => {
    const yes = await ready(A, { intimate: true })
    const no = await ready(A, { intimate: false })
    const { rows } = await db.query<{ id: string; intimate_ok: boolean }>(
      `select id, intimate_ok from public.participants where id in ($1, $2)`,
      [yes, no],
    )
    expect(Object.fromEntries(rows.map((r) => [r.id, r.intimate_ok]))).toEqual({ [yes]: true, [no]: false })
  })
})

describe('F5: sets by sex and age', () => {
  it('women 24, men 18, children 8-12: 9; 13-17 the full set for their sex', async () => {
    const set = async (sex: string, age: number) =>
      (await db.query<{ n: number }>(`select array_length(private.measurement_set($1, $2), 1) as n`, [sex, age])).rows[0].n
    expect(await set('female', 30)).toBe(24)
    expect(await set('male', 30)).toBe(18)
    expect(await set('female', 10)).toBe(9)
    expect(await set('male', 12)).toBe(9)
    expect(await set('female', 13)).toBe(24)
    expect(await set('male', 17)).toBe(18)
  })

  it('DENY: a code outside the set (bust for a man; chest for a woman; outseam for a 10-year-old)', async () => {
    const man = await ready(A, { sex: 'male' })
    await expect(measure(A, man, 'bust_girth', ['90.0', '90.4'])).rejects.toThrow(/not in the set/)
    const woman = await ready(A, { sex: 'female' })
    await expect(measure(A, woman, 'chest_girth', ['90.0', '90.4'])).rejects.toThrow(/not in the set/)
    const kid = await ready(A, { child: true, sex: 'female', age: 10 })
    await expect(measure(A, kid, 'outseam', ['80.0'])).rejects.toThrow(/not in the set/)
    await measure(A, kid, 'chest_girth', ['70.0', '70.5'])
  })

  it('DENY: intimate measurement without the tick; ALLOW its automatic skip', async () => {
    const no = await ready(A, { sex: 'female', intimate: false })
    await expect(measure(A, no, 'bust_girth', ['92.0', '92.4'])).rejects.toThrow(/not agreed/)
    await expect(measure(A, no, 'inseam', ['76.0'])).rejects.toThrow(/not agreed/)
    await measure(A, no, 'bust_girth', [], { skipped: true, skip_reason: 'declined_at_consent', unit: null })
    expect((await value(no, 'bust_girth')).value_cm).toBeNull()
  })

  it('sex and age are fixed once measuring started', async () => {
    const p = await ready(A, { sex: 'female' })
    await measure(A, p, 'neck_girth', ['34.5'])
    await expect(as(A, `update public.participants set sex = 'male' where id = $1`, [p])).rejects.toThrow(/fixed/)
    await expect(as(A, `update public.participants set age_years = 31 where id = $1`, [p])).rejects.toThrow(/fixed/)
  })
})

describe('F5: values recomputed by the database', () => {
  it('cm to 0.1; inches with eighths → cm; a cm value sent by the phone is ignored', async () => {
    const p = await ready(A, { sex: 'female' })
    await measure(A, p, 'neck_girth', ['34.5'], { value_cm: 99.9, readings_cm: ['99.9'] })
    expect((await value(p, 'neck_girth')).value_cm).toBe('34.5')
    await measure(A, p, 'waist_girth', ['30 3/8', '30 1/2'], { unit: 'in' })
    expect(await value(p, 'waist_girth')).toEqual({ readings_cm: ['77.2', '77.5'], value_cm: '77.4' })
    await measure(A, p, 'shoulder_width', ['15 1/4'], { unit: 'in' })
    expect((await value(p, 'shoulder_width')).value_cm).toBe('38.7')
  })

  it.each([
    ['cm with two decimals', 'cm', '87.35'],
    ['cm with a letter', 'cm', '87a'],
    ['inches not in lowest terms', 'in', '34 2/8'],
    ['inches with a sixteenth', 'in', '34 3/16'],
    ['zero', 'cm', '0'],
    ['over 300 cm', 'cm', '301'],
  ])('DENY: %s', async (_name, unit, typed) => {
    const p = await ready(A, { sex: 'female' })
    await expect(measure(A, p, 'neck_girth', [typed], { unit })).rejects.toThrow(/unreadable/)
  })

  it('×2: two close readings → mean; >1 cm apart → third needed; closest pair used', async () => {
    const p = await ready(A, { sex: 'female' })
    await expect(measure(A, p, 'hip_girth', ['100.0'])).rejects.toThrow(/number of readings/)
    await expect(measure(A, p, 'hip_girth', ['100.0', '101.5'])).rejects.toThrow(/third/)
    await measure(A, p, 'hip_girth', ['100.0', '101.5', '100.3'])
    expect((await value(p, 'hip_girth')).value_cm).toBe('100.2')
    await expect(measure(A, p, 'bust_girth', ['92.0', '92.4', '92.6'])).rejects.toThrow(/third reading only/)
    await measure(A, p, 'bust_girth', ['92.0', '92.4'])
    expect((await value(p, 'bust_girth')).value_cm).toBe('92.2')
    await expect(measure(A, p, 'neck_girth', ['34.5', '34.6'])).rejects.toThrow(/number of readings/)
  })

  it('height: method required; wall_100 adds 100 cm; hair flag kept; extras dropped on other codes', async () => {
    const p = await ready(A, { sex: 'female' })
    await expect(measure(A, p, 'height', ['165.2', '165.4'], { height_method: null })).rejects.toThrow(/how height/)
    await measure(A, p, 'height', ['65.2', '65.4'], { height_method: 'wall_100', hair_adds_height: true })
    const { rows } = await db.query<Record<string, unknown>>(
      `select value_cm::text as v, hair_adds_height from public.measurements where participant_id = $1 and code = 'height'`,
      [p],
    )
    expect(rows[0]).toEqual({ v: '165.3', hair_adds_height: true })
    await measure(A, p, 'neck_girth', ['34.5'], { height_method: 'steel_tape', hair_adds_height: true })
    const n = await db.query<Record<string, unknown>>(
      `select height_method, hair_adds_height from public.measurements where participant_id = $1 and code = 'neck_girth'`,
      [p],
    )
    expect(n.rows[0]).toEqual({ height_method: null, hair_adds_height: null })
  })

  it('skips need a reason; a skip clears any values', async () => {
    const p = await ready(A, { sex: 'female' })
    await expect(measure(A, p, 'calf_girth', [], { skipped: true })).rejects.toThrow(/reason/)
    await measure(A, p, 'calf_girth', ['35.0'], { skipped: true, skip_reason: 'could_not_measure' })
    expect(await value(p, 'calf_girth')).toEqual({ readings_cm: [], value_cm: null })
  })
})

describe('F5: access', () => {
  it("DENY: another collector's participant, a pending collector, anon; collectors read only their own", async () => {
    const pa = await ready(A, { sex: 'female' })
    await expect(measure(B, pa, 'neck_girth', ['34.5'])).rejects.toThrow(/row-level security/)
    await expect(measure(P, pa, 'neck_girth', ['34.5'])).rejects.toThrow(/row-level security/)
    await expect(measure('anon', pa, 'neck_girth', ['34.5'])).rejects.toThrow(/permission denied/)
    await measure(A, pa, 'neck_girth', ['34.5'])
    expect((await as(B, `select 1 from public.measurements`)).rows).toHaveLength(0)
    expect((await as(A, `select 1 from public.measurements`)).rows).toHaveLength(1)
    expect((await as(ADMIN, `select 1 from public.measurements`)).rows).toHaveLength(1)
  })

  it('updates change values (recomputed) but never participant, code or collector; no deletes', async () => {
    const p = await ready(A, { sex: 'female' })
    await measure(A, p, 'neck_girth', ['34.5'])
    await as(A, `update public.measurements set readings_typed = '{35.0}' where participant_id = $1 and code = 'neck_girth'`, [p])
    expect((await value(p, 'neck_girth')).value_cm).toBe('35.0')
    await expect(as(A, `update public.measurements set code = 'waist_girth'`)).rejects.toThrow(/permission denied/)
    await expect(as(A, `update public.measurements set value_cm = 1`)).rejects.toThrow(/permission denied/)
    await expect(as(A, `delete from public.measurements`)).rejects.toThrow(/permission denied/)
  })
})

describe('F5: Finish and withdrawal', () => {
  it('Finish only when every measurement in the set is taken or skipped', async () => {
    const kid = await ready(A, { child: true, sex: 'male', age: 9 })
    const finish = () => as(A, `update public.participants set measurements_done_at = now() where id = $1`, [kid])
    await expect(finish()).rejects.toThrow(/9 measurement/)
    const doubles = new Set(['height', 'chest_girth', 'waist_girth', 'hip_girth'])
    const codes = ['height', 'neck_girth', 'shoulder_width', 'chest_girth', 'back_length', 'waist_girth', 'hip_girth', 'arm_length']
    for (const c of codes) await measure(A, kid, c, doubles.has(c) ? ['60.0', '60.2'] : ['30.0'])
    await expect(finish()).rejects.toThrow(/1 measurement/)
    await measure(A, kid, 'inseam', [], { skipped: true, skip_reason: 'declined', unit: null })
    await finish()
    const { rows } = await as<{ measured: boolean; intimate_ok: boolean; sex: string; age_years: number }>(
      A,
      `select measured, intimate_ok, sex, age_years from public.my_participants(true) where id = $1`,
      [kid],
    )
    expect(rows[0]).toEqual({ measured: true, intimate_ok: true, sex: 'male', age_years: 9 })
  })

  it('withdrawal deletes the measurements too', async () => {
    const p = await ready(A, { sex: 'female' })
    await db.query(`update public.participants set receipt_code = 'R7K2MPQ' where id = $1`, [p])
    await measure(A, p, 'neck_girth', ['34.5'])
    await as(ADMIN, `select public.admin_withdraw('R7K2MPQ')`)
    expect((await db.query(`select 1 from public.measurements`)).rows).toHaveLength(0)
  })

  it('real_participants still excludes practice and now has the new columns', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'real_participants' and column_name in ('age_years', 'clothing', 'measurements_done_at')`,
    )
    expect(rows).toHaveLength(3)
    await ready(A, { sex: 'female' })
    expect((await as(A, `select 1 from public.real_participants`)).rows).toHaveLength(0)
  })
})
