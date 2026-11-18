/**
 * CI: `npm audit --json > audit.json || true` then `node scripts/audit-gate.ts audit.json`.
 * Fails on any high or critical advisory except Ryan's dated exceptions (src/lib/auditGate.ts).
 */
import { readFileSync } from 'node:fs'
import { ALLOWED, checkAudit } from '../src/lib/auditGate.ts'

const file = process.argv[2]
let audit: unknown
try {
  audit = JSON.parse(readFileSync(file, 'utf8'))
} catch {
  audit = null
}
const today = new Date().toISOString().slice(0, 10)
const r = checkAudit(audit, today)
for (const a of r.allowed) {
  const ex = ALLOWED.find((x) => x.id.toLowerCase() === a.id)
  console.log(`::warning::Allowed until ${ex?.until}: ${a.id} (${a.pkg}, ${a.severity}) ${a.title}`)
}
for (const a of r.blocking) console.log(`::error::${a.id} (${a.pkg}, ${a.severity}) ${a.title}`)
if (r.problem) console.log(`::error::${r.problem}`)
if (!r.ok) process.exit(1)
console.log(`npm audit: no high or critical advisories${r.allowed.length ? ' apart from the dated exceptions above' : ''}.`)
