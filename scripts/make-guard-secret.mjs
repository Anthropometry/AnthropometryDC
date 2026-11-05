// Makes the login-guard secret for the PIN lockout (specs/F1-login.md, docs/ADMIN.md).
// Run on your own laptop: node scripts/make-guard-secret.mjs
// It prints the secret ONCE for `wrangler secret put`, and SQL holding only its SHA-256 hash.
// Never paste the secret into chat, a commit or an issue.
import { createHash, randomBytes } from 'node:crypto'

const secret = randomBytes(36).toString('base64url') // 48 characters
const hash = createHash('sha256').update(secret, 'utf8').digest('hex')

console.log(`
1) In this folder run:   npx wrangler secret put LOGIN_GUARD_SECRET
   and paste this value when asked (then clear your terminal):

   ${secret}

2) In the Supabase SQL editor run (only the hash goes into the database):

   insert into private.settings (key, value)
   values ('login_guard_secret_sha256', '${hash}')
   on conflict (key) do update set value = excluded.value;

3) For local testing with wrangler dev, add the same value to .dev.vars:
   LOGIN_GUARD_SECRET=<the value above>
`)
