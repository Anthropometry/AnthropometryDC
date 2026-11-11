/**
 * F5 Amendment A database rules: optional weight with its own consent tick and a source.
 * In-memory PGlite only.
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

async function consented(who: string, weight: boolean) {
  const id = crypto.randomUUID()
  await as(who, `insert into public.participants (id, collector_id, is_practice, age_group) values ($1, $2, true, 'adult')`, [id, who])
  await as(
    who,
    `insert into public.consents (participant_id, participant_name, language, consent_version, agreed_data, agreed_photos, agreed_weight, signed_at)
     values ($1, 'Practice Person', 'en', 'practice', true, true, $2, now())`,
    [id, weight],
  )
  return id
}

const setWeight = (who: string, id: string, kg: number | null, source: string | null) =>
  as(who, `update public.participants set weight_kg = $2, weight_source = $3 where id = $1`, [id, kg, source])

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

describe('F5 Amendment A: weight', () => {
  it("ALLOW: with the tick, weight and its source are stored; the consent's answer is copied", async () => {
    const p = await consented(A, true)
    await setWeight(A, p, 72.4, 'scale')
    const { rows } = await as<Record<string, unknown>>(A, `select weight_ok, weight_kg::text as kg, weight_source from public.participants where id = $1`, [p])
    expect(rows[0]).toEqual({ weight_ok: true, kg: '72.4', weight_source: 'scale' })
    await setWeight(A, p, 70, 'told')
    await setWeight(A, p, null, null) // cleared (skipped after all)
  })

  it('DENY: no tick → no weight; a weight needs a source and a source needs a weight; range 2–300', async () => {
    const no = await consented(A, false)
    await expect(setWeight(A, no, 72.4, 'scale')).rejects.toThrow(/not agreed/)
    const yes = await consented(A, true)
    await expect(setWeight(A, yes, 72.4, null)).rejects.toThrow(/weight_has_source/)
    await expect(setWeight(A, yes, null, 'scale')).rejects.toThrow(/weight_has_source/)
    await expect(setWeight(A, yes, 1.5, 'scale')).rejects.toThrow(/weight_kg_check/)
    await expect(setWeight(A, yes, 301, 'scale')).rejects.toThrow(/weight_kg_check/)
    await expect(setWeight(A, yes, 70, 'guess')).rejects.toThrow(/weight_source_check/)
  })

  it("DENY: collectors cannot set weight_ok; another collector cannot set someone else's weight", async () => {
    const p = await consented(A, false)
    await expect(as(A, `update public.participants set weight_ok = true where id = $1`, [p])).rejects.toThrow(/permission denied/)
    const q = await consented(A, true)
    const res = await setWeight(B, q, 70, 'scale')
    expect(res.affectedRows).toBe(0)
  })

  it('the list shows weight_ok (yes/no only); withdrawal deletes the weight with the participant; exports include it', async () => {
    const p = await consented(A, true)
    await setWeight(A, p, 72.4, 'scale')
    const list = await as<{ weight_ok: boolean }>(A, `select weight_ok from public.my_participants(true) where id = $1`, [p])
    expect(list.rows[0].weight_ok).toBe(true)
    await db.query(`update public.participants set receipt_code = 'R7K2MPQ' where id = $1`, [p])
    await as(ADMIN, `select public.admin_withdraw('R7K2MPQ')`)
    expect((await db.query(`select 1 from public.participants where id = $1`, [p])).rows).toHaveLength(0)
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'real_participants' and column_name in ('weight_kg', 'weight_source')`,
    )
    expect(cols.rows).toHaveLength(2)
  })
})
