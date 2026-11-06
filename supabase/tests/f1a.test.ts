/**
 * F1 Amendment A database rules (specs/F1-login.md): any-country phones, referral codes
 * (3 joins / 10 days / max 2 active), "Invited by" for admins. In-memory PGlite only.
 */
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, runAs, seed } from './helpers'

const ADMIN = '00000000-0000-4000-8000-0000000000ad'
let db: PGlite

const as = <T = Record<string, unknown>>(who: string, sql: string, params: unknown[] = []) =>
  runAs<T>(db, who, sql, params)

const loginId = (digits: string) => `${digits}@phone.anthro-collect.invalid`

async function adminInvite(maxUses?: number, days?: number) {
  const sql =
    maxUses === undefined ? `select public.create_invite('Pilot') as code` : `select public.create_invite('Pilot', $1, $2) as code`
  const { rows } = await as<{ code: string }>(ADMIN, sql, maxUses === undefined ? [] : [maxUses, days])
  return rows[0].code
}

async function signUp(digits: string, code: string, name = 'Ama Mensah') {
  const id = crypto.randomUUID()
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    loginId(digits),
    JSON.stringify({ invite_code: code, display_name: name }),
  ])
  return id
}

async function approved(digits: string, name = 'Kofi Boateng') {
  const id = await signUp(digits, await adminInvite(), name)
  await as(ADMIN, `select public.approve_collector($1, 'approved')`, [id])
  return id
}

const myInvite = (who: string) =>
  as<{ code: string }>(who, `select public.create_my_invite() as code`).then((r) => r.rows[0].code)

beforeEach(async () => {
  db = await createDb()
  await seed(
    db,
    `insert into auth.users (id, email) values ('${ADMIN}', '${loginId('233243333333')}');
     insert into public.collectors (id, phone, role, status, display_name)
       values ('${ADMIN}', '+233243333333', 'admin', 'approved', 'Lead')`,
  )
})

describe('A1: phone numbers from any country', () => {
  it.each([
    ['Nigeria', '2348031234567'],
    ['UK', '447700900123'],
    ['US', '12025550123'],
    ['Ghana', '233241234567'],
  ])('ALLOW: %s number joins; phone stored as +digits', async (_c, digits) => {
    const id = await signUp(digits, await adminInvite())
    const { rows } = await db.query<{ phone: string }>(`select phone from public.collectors where id = $1`, [id])
    expect(rows[0].phone).toBe(`+${digits}`)
  })

  it.each(['1234567', '0241234567', '1234567890123456', '+2348031234567'])(
    'DENY: malformed hidden id %s',
    async (digits) => {
      await expect(signUp(digits, await adminInvite())).rejects.toThrow(/invalid_login/)
    },
  )

  it('DENY: the phone column refuses anything but +digits', async () => {
    await expect(
      db.query(`insert into public.collectors (id, phone) values (gen_random_uuid(), '0241234567')`),
    ).rejects.toThrow(/collectors_phone_check|violates/)
  })

  it('ALLOW: admin PIN reset works for an international number', async () => {
    const id = await signUp('2348031234567', await adminInvite())
    await db.query(`select public.admin_reset_pin('+234 803 123 4567', '482916')`)
    const u = await db.query<{ p: string }>(`select encrypted_password as p from auth.users where id = $1`, [id])
    expect(u.rows[0].p).toBe('crypt:482916')
    await db.query(`select public.admin_reset_pin('00234 803 123 4567', '592817')`)
    await expect(db.query(`select public.admin_reset_pin('803 123 4567', '482916')`)).rejects.toThrow(/no collector|country code/)
  })
})

describe('A3: defaults', () => {
  it('admin codes now default to 3 joins and 10 days', async () => {
    await adminInvite()
    const { rows } = await db.query<{ max_uses: number; days: number }>(
      `select max_uses, round(extract(epoch from expires_at - created_at) / 86400)::int as days from public.invite_codes`,
    )
    expect(rows[0]).toEqual({ max_uses: 3, days: 10 })
  })

  it('a code allows exactly 3 joins', async () => {
    const code = await adminInvite()
    await signUp('233241000001', code)
    await signUp('233241000002', code)
    await signUp('233241000003', code)
    await expect(signUp('233241000004', code)).rejects.toThrow(/invalid_invite/)
  })
})

describe('A3: collectors invite collectors', () => {
  it('ALLOW: an approved collector makes a code; it always gets 3 joins, 10 days and their name', async () => {
    const kofi = await approved('233241111111')
    const code = await myInvite(kofi)
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/)
    const { rows } = await as<{ label: string; max_uses: number; uses: number }>(
      kofi,
      `select label, max_uses, uses from public.my_invites()`,
    )
    expect(rows).toEqual([{ label: 'Referral from Kofi Boateng', max_uses: 3, uses: 0 }])
    const newbie = await signUp('2348031234567', code, 'Ngozi Okafor')
    const n = await db.query<{ status: string }>(`select status from public.collectors where id = $1`, [newbie])
    expect(n.rows[0].status).toBe('pending') // still needs the admin
  })

  it('DENY: a 3rd active code; allowed again once one is revoked', async () => {
    const kofi = await approved('233241111111')
    await myInvite(kofi)
    await myInvite(kofi)
    await expect(myInvite(kofi)).rejects.toThrow(/too_many_active_codes/)
    const { rows } = await as<{ id: string }>(kofi, `select id from public.my_invites() limit 1`)
    await as(kofi, `select public.revoke_my_invite($1)`, [rows[0].id])
    await expect(myInvite(kofi)).resolves.toMatch(/^[A-Z2-9]{8}$/)
  })

  it('DENY: used-up and expired codes do not count as active', async () => {
    const kofi = await approved('233241111111')
    await myInvite(kofi)
    await myInvite(kofi)
    await db.query(`update public.invite_codes set uses = max_uses where created_by = $1`, [kofi])
    await expect(myInvite(kofi)).resolves.toBeTruthy()
  })

  it.each(['pending', 'rejected', 'disabled'])('DENY: a %s collector cannot make codes', async (status) => {
    const id = await signUp('233241111112', await adminInvite())
    if (status !== 'pending') await db.query(`update public.collectors set status = $1 where id = $2`, [status, id])
    await expect(myInvite(id)).rejects.toThrow(/not allowed/)
  })

  it('DENY: anon cannot make or list codes', async () => {
    await expect(as('anon', `select public.create_my_invite()`)).rejects.toThrow(/permission denied/)
    await expect(as('anon', `select * from public.my_invites()`)).rejects.toThrow(/permission denied/)
  })

  it('DENY: a collector sees only own codes, never hashes, and cannot revoke others', async () => {
    const kofi = await approved('233241111111', 'Kofi')
    const ama = await approved('233241111112', 'Ama')
    await myInvite(kofi)
    await myInvite(ama)
    const mine = await as<Record<string, unknown>>(kofi, `select * from public.my_invites()`)
    expect(mine.rows).toHaveLength(1)
    expect(Object.keys(mine.rows[0])).not.toContain('code_hash')
    expect((await as(kofi, `select * from public.invite_codes`)).rows).toHaveLength(0) // table stays admin-only
    const amas = await as<{ id: string }>(ama, `select id from public.my_invites()`)
    await expect(as(kofi, `select public.revoke_my_invite($1)`, [amas.rows[0].id])).rejects.toThrow(/no such code/)
  })

  it('DENY: when a collector is disabled, their codes stop working at once', async () => {
    const kofi = await approved('233241111111')
    const code = await myInvite(kofi)
    await as(ADMIN, `select public.approve_collector($1, 'disabled')`, [kofi])
    await expect(signUp('2348031234567', code)).rejects.toThrow(/invalid_invite/)
  })
})

describe('A3: admin sees who invited whom', () => {
  it('ALLOW: Invited by shows the collector, or admin', async () => {
    const kofi = await approved('233241111111', 'Kofi Boateng')
    await signUp('2348031234567', await myInvite(kofi), 'Ngozi Okafor')
    const { rows } = await as<{ display_name: string; invited_by: string | null; phone: string }>(
      ADMIN,
      `select display_name, invited_by, phone from public.admin_list_collectors()`,
    )
    const by = Object.fromEntries(rows.map((r) => [r.display_name, r.invited_by]))
    expect(by['Ngozi Okafor']).toBe('Kofi Boateng')
    expect(by['Kofi Boateng']).toBe('Lead (admin)')
    expect(by['Lead']).toBeNull() // seeded, joined with no code
    expect(rows.find((r) => r.display_name === 'Ngozi Okafor')?.phone).toBe('+2348031234567')
  })

  it('DENY: a collector cannot list collectors', async () => {
    const kofi = await approved('233241111111')
    await expect(as(kofi, `select * from public.admin_list_collectors()`)).rejects.toThrow(/not allowed/)
  })
})
