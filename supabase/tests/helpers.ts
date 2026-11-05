/**
 * Shared PGlite setup for database-rule tests: small stand-ins for what Supabase provides
 * (roles, auth schema, extensions), then every real migration file applied in order.
 * No real data is ever touched.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role supabase_auth_admin nologin;
  create schema auth;
  create table auth.users (
    id                 uuid primary key,
    email              text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    encrypted_password text
  );
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
  create table auth.refresh_tokens (id bigserial primary key, user_id varchar(255), token text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  -- pgcrypto stand-ins (Supabase has the real ones in the extensions schema)
  create schema extensions;
  create function extensions.gen_salt(text) returns text language sql as $$ select 'salt-' || $1 $$;
  create function extensions.crypt(text, text) returns text language sql as $$ select 'crypt:' || $1 $$;
`

export async function createDb(): Promise<PGlite> {
  const pg = new PGlite()
  await pg.exec(SUPABASE_STUB)
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
  }
  return pg
}

/** Run seed SQL as the database owner with triggers off (like an admin import). */
export async function seed(pg: PGlite, sql: string) {
  await pg.exec(`set session_replication_role = replica; ${sql}; set session_replication_role = origin;`)
}

/** Run SQL as a logged-in user (role authenticated, auth.uid() = id), as anon, or as Supabase Auth. */
export async function runAs<T = Record<string, unknown>>(
  pg: PGlite,
  who: string,
  sql: string,
  params: unknown[] = [],
) {
  const role = who === 'anon' ? 'anon' : who === 'auth' ? 'supabase_auth_admin' : 'authenticated'
  const sub = who === 'anon' || who === 'auth' ? '' : who
  await pg.exec(`set role ${role}`)
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub])
  try {
    return await pg.query<T>(sql, params)
  } finally {
    await pg.exec(`reset role`)
    await pg.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}
