/**
 * F1 database rules (specs/F1-login.md): invite-code sign-up, pending approval, admin powers,
 * PIN-lockout counters and admin PIN reset. In-memory PGlite only; no real data.
 */
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, runAs, seed } from './helpers'

const ADMIN = '00000000-0000-4000-8000-0000000000ad'
const GUARD_SECRET = 'g'.repeat(48)
const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)

let db: PGlite

const as = <T = Record<string, unknown>>(who: string, sql: string, params: unknown[] = []) =>
  runAs<T>(db, who, sql, params)

const loginId = (n: string) => `233${n}@phone.anthro-collect.invalid`

async function createInvite(maxUses = 10, days = 14) {
  const { rows } = await as<{ code: string }>(ADMIN, `select public.create_invite('Pilot', $1, $2) as code`, [
    maxUses,
    days,
  ])
  return rows[0].code
}

/** What Supabase Auth does on sign-up: insert into auth.users (the trigger then runs). */
async function signUp(phone9: string, code: string | null, name: string | null = 'Ama Mensah') {
  const id = crypto.randomUUID()
  const meta: Record<string, string> = {}
  if (code !== null) meta.invite_code = code
  if (name !== null) meta.display_name = name
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    loginId(phone9),
    JSON.stringify(meta),
  ])
  return id
}

/** What Supabase Auth sends the Before User Created hook. */
async function hook(email: string, meta: Record<string, unknown>) {
  const event = { user: { email, user_metadata: meta } }
  const { rows } = await as<{ r: { error?: { message: string } } }>(
    'auth',
    `select public.hook_before_user_created($1::jsonb) as r`,
    [JSON.stringify(event)],
  )
  return rows[0].r
}

const statusOf = async (id: string) =>
  (await db.query<{ status: string }>(`select status from public.collectors where id = $1`, [id])).rows[0]?.status

beforeEach(async () => {
  db = await createDb()
  await seed(
    db,
    `insert into auth.users (id, email) values ('${ADMIN}', '${loginId('243333333')}');
     insert into public.collectors (id, phone, role, status, display_name)
       values ('${ADMIN}', '+233243333333', 'admin', 'approved', 'Ryan');
     insert into private.settings values
       ('login_guard_secret_sha256', encode(sha256(convert_to('${GUARD_SECRET}', 'UTF8')), 'hex'))`,
  )
})

describe('Before User Created hook', () => {
  it('ALLOW: valid code, name and hidden login id', async () => {
    const code = await createInvite()
    expect(await hook(loginId('241234567'), { invite_code: code, display_name: 'Ama' })).toEqual({})
  })

  it('ALLOW: code in lower case with a dash', async () => {
    const code = await createInvite()
    const messy = `${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()}`
    expect(await hook(loginId('241234567'), { invite_code: messy, display_name: 'Ama' })).toEqual({})
  })

  it.each([
    ['no code', {}],
    ['wrong code', { invite_code: 'AAAA2222' }],
  ])('DENY: %s', async (_label, meta) => {
    const r = await hook(loginId('241234567'), { display_name: 'Ama', ...meta })
    expect(r.error?.message).toBe('invalid_invite')
  })

  it('DENY: revoked, expired and used-up codes', async () => {
    const revoked = await createInvite()
    await db.query(`update public.invite_codes set revoked = true`)
    expect((await hook(loginId('241234567'), { invite_code: revoked, display_name: 'Ama' })).error?.message).toBe(
      'invalid_invite',
    )
    const expired = await createInvite()
    await db.query(`update public.invite_codes set revoked = false, expires_at = now() - interval '1 minute'`)
    expect((await hook(loginId('241234567'), { invite_code: expired, display_name: 'Ama' })).error?.message).toBe(
      'invalid_invite',
    )
    const used = await createInvite(1)
    await db.query(`update public.invite_codes set uses = max_uses`)
    expect((await hook(loginId('241234567'), { invite_code: used, display_name: 'Ama' })).error?.message).toBe(
      'invalid_invite',
    )
  })

  it.each([['missing', undefined], ['1 character', 'A'], ['61 characters', 'x'.repeat(61)], ['only spaces', '   ']])(
    'DENY: name %s',
    async (_label, name) => {
      const code = await createInvite()
      const r = await hook(loginId('241234567'), { invite_code: code, display_name: name })
      expect(r.error?.message).toBe('invalid_name')
    },
  )

  it.each(['someone@gmail.com', '0241234567@phone.anthro-collect.invalid', '1234567@phone.anthro-collect.invalid', '233241234567@phone.anthro-collect.invalid.evil.com'])(
    'DENY: email that is not a hidden login id (%s)',
    async (email) => {
      const code = await createInvite()
      expect((await hook(email, { invite_code: code, display_name: 'Ama' })).error?.message).toBe('invalid_login')
    },
  )

  it('DENY: app users and anon cannot call the hook', async () => {
    await expect(as('anon', `select public.hook_before_user_created('{}'::jsonb)`)).rejects.toThrow(/permission denied/)
    await expect(as(ADMIN, `select public.hook_before_user_created('{}'::jsonb)`)).rejects.toThrow(/permission denied/)
  })
})

describe('sign-up trigger (backup for the hook)', () => {
  it('ALLOW: creates a pending collector, uses one invite, strips code and name from auth metadata', async () => {
    const code = await createInvite()
    const id = await signUp('241234567', code, '  Ama Mensah ')
    const c = await db.query<{ status: string; phone: string; display_name: string }>(
      `select status, phone, display_name from public.collectors where id = $1`,
      [id],
    )
    expect(c.rows[0]).toEqual({ status: 'pending', phone: '+233241234567', display_name: 'Ama Mensah' })
    const inv = await db.query<{ uses: number }>(`select uses from public.invite_codes`)
    expect(inv.rows[0].uses).toBe(1)
    const meta = await db.query<{ m: Record<string, unknown> }>(`select raw_user_meta_data as m from auth.users where id = $1`, [id])
    expect(meta.rows[0].m).toEqual({})
  })

  it('DENY: bad code creates no auth user and no collector', async () => {
    await createInvite()
    await expect(signUp('241234567', 'AAAA2222')).rejects.toThrow(/invalid_invite/)
    const n = await db.query<{ n: number }>(`select count(*)::int as n from auth.users`)
    expect(n.rows[0].n).toBe(1) // only the seeded admin
  })

  it('DENY: no name or no code', async () => {
    const code = await createInvite()
    await expect(signUp('241234567', code, null)).rejects.toThrow(/invalid_name/)
    await expect(signUp('241234568', null)).rejects.toThrow(/invalid_invite/)
  })

  it('DENY: the last use of a code can be taken only once', async () => {
    const code = await createInvite(1)
    await signUp('241234567', code)
    await expect(signUp('241234568', code)).rejects.toThrow(/invalid_invite/)
  })
})

describe('pending, rejected and disabled collectors get nothing', () => {
  it.each(['pending', 'rejected', 'disabled'])('DENY: %s collector', async (status) => {
    const code = await createInvite()
    const id = await signUp('241234567', code)
    await db.query(`update public.collectors set status = $1 where id = $2`, [status, id])
    await seed(db, `insert into public.participants (collector_id, is_practice, age_group) values ('${id}', true, 'adult')`)

    expect((await as(id, `select id from public.participants`)).rows).toHaveLength(0)
    await expect(
      as(id, `insert into public.participants (collector_id, is_practice, age_group) values ('${id}', true, 'adult')`),
    ).rejects.toThrow(/row-level security/)
    expect((await as(id, `update public.collectors set unit = 'in' where id = $1`, [id])).affectedRows).toBe(0)
    // ...but they can see their own row, to show "Waiting for approval".
    expect((await as<{ status: string }>(id, `select status from public.collectors`)).rows).toEqual([{ status }])
  })
})

describe('admin powers', () => {
  it('ALLOW: admin approves; the collector can then work', async () => {
    const id = await signUp('241234567', await createInvite())
    await as(ADMIN, `select public.approve_collector($1, 'approved')`, [id])
    expect(await statusOf(id)).toBe('approved')
    await as(id, `insert into public.participants (collector_id, is_practice, age_group) values ('${id}', true, 'adult')`)
    expect((await as(id, `select id from public.participants`)).rows).toHaveLength(1)
  })

  it('ALLOW: admin sees names of all collectors and invite codes (hash only)', async () => {
    await signUp('241234567', await createInvite())
    expect((await as(ADMIN, `select display_name from public.collectors`)).rows).toHaveLength(2)
    expect((await as(ADMIN, `select label, uses from public.invite_codes`)).rows).toEqual([{ label: 'Pilot', uses: 1 }])
  })

  it('ALLOW: create_invite returns 8 characters from the safe alphabet; revoke stops it', async () => {
    const code = await createInvite()
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/)
    const { rows } = await as<{ id: string }>(ADMIN, `select id from public.invite_codes`)
    await as(ADMIN, `select public.revoke_invite($1)`, [rows[0].id])
    await expect(signUp('241234567', code)).rejects.toThrow(/invalid_invite/)
  })

  it('DENY: a collector cannot approve, change status, create invites or read invites', async () => {
    const code = await createInvite()
    const a = await signUp('241234567', code)
    const b = await signUp('241234568', code)
    await as(ADMIN, `select public.approve_collector($1, 'approved')`, [a])

    await expect(as(a, `select public.approve_collector($1, 'approved')`, [b])).rejects.toThrow(/not allowed/)
    await expect(as(a, `select public.approve_collector($1, 'approved')`, [a])).rejects.toThrow(/not allowed/)
    await expect(as(a, `update public.collectors set status = 'approved' where id = $1`, [b])).rejects.toThrow(
      /permission denied/,
    )
    await expect(as(a, `update public.collectors set display_name = 'X' where id = $1`, [a])).rejects.toThrow(
      /permission denied/,
    )
    await expect(as(a, `select public.create_invite('mine')`)).rejects.toThrow(/not allowed/)
    await expect(as(a, `select public.admin_rename_collector($1, 'Boss')`, [a])).rejects.toThrow(/not allowed/)
    expect((await as(a, `select * from public.invite_codes`)).rows).toHaveLength(0)
    expect(await statusOf(b)).toBe('pending')
  })

  it('DENY: a collector cannot read other collectors (names included)', async () => {
    const code = await createInvite()
    const a = await signUp('241234567', code)
    await signUp('241234568', code)
    await as(ADMIN, `select public.approve_collector($1, 'approved')`, [a])
    expect((await as(a, `select display_name from public.collectors`)).rows).toEqual([{ display_name: 'Ama Mensah' }])
  })

  it('DENY: an admin cannot change their own status; a disabled admin is no admin', async () => {
    await expect(as(ADMIN, `select public.approve_collector($1, 'disabled')`, [ADMIN])).rejects.toThrow(/own status/)
    await db.query(`update public.collectors set status = 'disabled' where id = $1`, [ADMIN])
    await expect(as(ADMIN, `select public.create_invite('x')`)).rejects.toThrow(/not allowed/)
  })

  it('DENY: anon cannot call admin functions', async () => {
    await expect(as('anon', `select public.create_invite('x')`)).rejects.toThrow(/permission denied/)
  })
})

describe('PIN lockout counters (login_guard)', () => {
  const check = (key: string, secret = GUARD_SECRET) =>
    as<{ s: number }>('anon', `select public.login_guard_check($1, $2) as s`, [key, secret]).then((r) => r.rows[0].s)
  const record = (key: string, ok: boolean, secret = GUARD_SECRET) =>
    as<{ s: number }>('anon', `select public.login_guard_record($1, $2, $3) as s`, [key, ok, secret]).then(
      (r) => r.rows[0].s,
    )

  it('DENY: wrong, short or missing guard secret', async () => {
    await expect(check(KEY_A, 'x'.repeat(48))).rejects.toThrow(/not allowed/)
    await expect(record(KEY_A, true, '')).rejects.toThrow(/not allowed/)
    await expect(
      as('anon', `select public.login_guard_check($1, null)`, [KEY_A]),
    ).rejects.toThrow(/not allowed/)
  })

  it('DENY: nobody reads or writes the table directly', async () => {
    await expect(as('anon', `select * from public.login_guard`)).rejects.toThrow(/permission denied/)
    await expect(as(ADMIN, `select * from public.login_guard`)).rejects.toThrow(/permission denied/)
    await expect(as('anon', `select * from private.settings`)).rejects.toThrow(/permission denied/)
  })

  it('locks after the 5th wrong PIN, not before; another account is unaffected', async () => {
    for (let i = 1; i <= 4; i++) expect(await record(KEY_A, false)).toBe(0)
    expect(await check(KEY_A)).toBe(0)
    expect(await record(KEY_A, false)).toBe(900)
    expect(await check(KEY_A)).toBeGreaterThan(890)
    expect(await check(KEY_B)).toBe(0)
  })

  it('the lock ends on its own after 15 minutes', async () => {
    for (let i = 0; i < 5; i++) await record(KEY_A, false)
    await db.query(`update public.login_guard set locked_until = now() - interval '1 second'`)
    expect(await check(KEY_A)).toBe(0)
  })

  it('a right PIN clears the count; old failures (over 15 min) start a new window', async () => {
    for (let i = 0; i < 4; i++) await record(KEY_A, false)
    expect(await record(KEY_A, true)).toBe(0)
    for (let i = 0; i < 4; i++) await record(KEY_A, false)
    await db.query(`update public.login_guard set window_start = now() - interval '16 minutes'`)
    expect(await record(KEY_A, false)).toBe(0) // counted as the 1st failure of a new window
  })
})

describe('admin PIN reset (SQL editor only)', () => {
  it('ALLOW: sets the new PIN, ends sessions on every phone and clears the lock', async () => {
    const id = await signUp('241234567', await createInvite())
    const key = (
      await db.query<{ k: string }>(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') as k`, [loginId('241234567')])
    ).rows[0].k
    await seed(
      db,
      `insert into auth.sessions (user_id) values ('${id}'), ('${id}');
       insert into auth.refresh_tokens (user_id, token) values ('${id}', 't1');
       insert into public.login_guard (login_key, failures, locked_until) values ('${key}', 0, now() + interval '10 minutes')`,
    )
    await db.query(`select public.admin_reset_pin('024 123 4567', '482916')`)
    const u = await db.query<{ p: string }>(`select encrypted_password as p from auth.users where id = $1`, [id])
    expect(u.rows[0].p).toBe('crypt:482916')
    const left = await db.query<{ s: number; t: number; g: number }>(
      `select (select count(*) from auth.sessions)::int as s, (select count(*) from auth.refresh_tokens)::int as t,
              (select count(*) from public.login_guard)::int as g`,
    )
    expect(left.rows[0]).toEqual({ s: 0, t: 0, g: 0 })
  })

  it.each(['000000', '123456', '654321', '12345', 'abcdef'])('DENY: weak or malformed PIN %s', async (pin) => {
    await signUp('241234567', await createInvite())
    await expect(db.query(`select public.admin_reset_pin('0241234567', $1)`, [pin])).rejects.toThrow(/PIN must be/)
  })

  it('DENY: unknown phone, and nobody but the database owner can run it', async () => {
    await expect(db.query(`select public.admin_reset_pin('0249999999', '482916')`)).rejects.toThrow(/no collector/)
    await expect(as(ADMIN, `select public.admin_reset_pin('0243333333', '482916')`)).rejects.toThrow(/permission denied/)
    await expect(as('anon', `select public.admin_reset_pin('0243333333', '482916')`)).rejects.toThrow(/permission denied/)
  })
})
