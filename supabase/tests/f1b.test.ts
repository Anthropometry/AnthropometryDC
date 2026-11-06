/**
 * F1 Amendment B database rules (specs/F1-login.md): admins can show an active admin-made code
 * again; the plain code lives in the private schema and is erased once the code can't be used.
 * In-memory PGlite only.
 */
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, runAs, seed } from './helpers'

const ADMIN = '00000000-0000-4000-8000-0000000000ad'
let db: PGlite

const as = <T = Record<string, unknown>>(who: string, sql: string, params: unknown[] = []) =>
  runAs<T>(db, who, sql, params)

const loginId = (digits: string) => `${digits}@phone.anthro-collect.invalid`

async function adminInvite(maxUses = 3, days = 10) {
  const { rows } = await as<{ code: string }>(ADMIN, `select public.create_invite('Pilot', $1, $2) as code`, [maxUses, days])
  return rows[0].code
}

async function inviteId(code: string) {
  const { rows } = await db.query<{ id: string }>(`select id from public.invite_codes where code_hash = public.invite_code_hash($1)`, [code])
  return rows[0].id
}

async function signUp(digits: string, code: string) {
  const id = crypto.randomUUID()
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    loginId(digits),
    JSON.stringify({ invite_code: code, display_name: 'Ama Mensah' }),
  ])
  return id
}

async function approved(digits: string) {
  const id = await signUp(digits, await adminInvite())
  await as(ADMIN, `select public.approve_collector($1, 'approved')`, [id])
  return id
}

const show = (who: string, id: string) =>
  as<{ code: string }>(who, `select public.admin_show_invite($1) as code`, [id]).then((r) => r.rows[0].code)

const kept = async (id: string) =>
  (await db.query(`select 1 from private.invite_code_plain where invite_id = $1`, [id])).rows.length

beforeEach(async () => {
  db = await createDb()
  await seed(
    db,
    `insert into auth.users (id, email) values ('${ADMIN}', '${loginId('233243333333')}');
     insert into public.collectors (id, phone, role, status, display_name)
       values ('${ADMIN}', '+233243333333', 'admin', 'approved', 'Lead')`,
  )
})

describe('B1: admin shows a code again', () => {
  it('ALLOW: admin sees the same code that was returned at creation; list says it can be shown', async () => {
    const code = await adminInvite()
    const id = await inviteId(code)
    expect(await show(ADMIN, id)).toBe(code)
    const { rows } = await as<{ id: string; can_show: boolean }>(ADMIN, `select id, can_show from public.admin_list_invites()`)
    expect(rows.find((r) => r.id === id)?.can_show).toBe(true)
  })

  it('the code still works for joining after it was shown', async () => {
    const code = await adminInvite()
    await show(ADMIN, await inviteId(code))
    await expect(signUp('233241000001', code)).resolves.toBeTruthy()
  })

  it('DENY: collector, pending admin and anon cannot show or list', async () => {
    const id = await inviteId(await adminInvite())
    const kofi = await approved('233241000002')
    await expect(show(kofi, id)).rejects.toThrow(/not allowed/)
    await expect(as(kofi, `select * from public.admin_list_invites()`)).rejects.toThrow(/not allowed/)
    await db.query(`update public.collectors set role = 'admin', status = 'pending' where id = $1`, [kofi])
    await expect(show(kofi, id)).rejects.toThrow(/not allowed/)
    await expect(show('anon', id)).rejects.toThrow(/permission denied/)
    await expect(as('anon', `select * from public.admin_list_invites()`)).rejects.toThrow(/permission denied/)
  })

  it('DENY: nobody but the owner can read the private table directly', async () => {
    await adminInvite()
    const kofi = await approved('233241000003')
    await expect(as(kofi, `select code from private.invite_code_plain`)).rejects.toThrow(/permission denied/)
    await expect(as(ADMIN, `select code from private.invite_code_plain`)).rejects.toThrow(/permission denied/)
    await expect(as('anon', `select code from private.invite_code_plain`)).rejects.toThrow(/permission denied/)
  })

  it('DENY: collector referral codes and SQL-made (bootstrap) codes have nothing to show', async () => {
    const kofi = await approved('233241000004')
    const ref = (await as<{ code: string }>(kofi, `select public.create_my_invite() as code`)).rows[0].code
    await expect(show(ADMIN, await inviteId(ref))).resolves.toBeNull()
    await db.query(
      `insert into public.invite_codes (code_hash, label, max_uses, expires_at) values (public.invite_code_hash('BOOT2345'), 'Bootstrap', 1, now() + interval '1 day')`,
    )
    await expect(show(ADMIN, await inviteId('BOOT2345'))).resolves.toBeNull()
  })

  it('DENY: revoked code is erased at once and cannot be shown', async () => {
    const id = await inviteId(await adminInvite())
    await as(ADMIN, `select public.revoke_invite($1)`, [id])
    expect(await kept(id)).toBe(0)
    await expect(show(ADMIN, id)).resolves.toBeNull()
  })

  it('DENY: used-up code is erased at the last join', async () => {
    const code = await adminInvite(1)
    const id = await inviteId(code)
    await signUp('233241000005', code)
    expect(await kept(id)).toBe(0)
    await expect(show(ADMIN, id)).resolves.toBeNull()
  })

  it('DENY: expired code is erased the next time an admin lists or shows codes', async () => {
    const id = await inviteId(await adminInvite())
    await db.query(`update public.invite_codes set expires_at = now() - interval '1 minute' where id = $1`, [id])
    expect(await kept(id)).toBe(1)
    await as(ADMIN, `select * from public.admin_list_invites()`)
    expect(await kept(id)).toBe(0)
    await expect(show(ADMIN, id)).resolves.toBeNull()
  })

  it('DENY: when the admin who made it is disabled, the code is erased', async () => {
    const lead2 = await approved('233241000006')
    await db.query(`update public.collectors set role = 'admin' where id = $1`, [lead2])
    const id = await inviteId((await as<{ code: string }>(lead2, `select public.create_invite('X') as code`)).rows[0].code)
    await as(ADMIN, `select public.approve_collector($1, 'disabled')`, [lead2])
    await expect(show(ADMIN, id)).resolves.toBeNull()
    expect(await kept(id)).toBe(0)
  })
})
