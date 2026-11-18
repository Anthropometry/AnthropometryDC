/**
 * CI dependency check (POLICY §14: never weakened without Ryan). Fails on any high or critical
 * advisory from `npm audit --json`, except the advisories Ryan allowed below, each only until its
 * expiry date. After that date the advisory fails CI again, so an exception can't be forgotten.
 */

export interface AllowedAdvisory {
  /** GitHub advisory id, e.g. GHSA-xxxx-xxxx-xxxx. */
  id: string
  /** Last day (UTC, YYYY-MM-DD) the advisory is allowed. */
  until: string
  why: string
}

/**
 * Ryan, 18 Nov 2026 (DISCUSSION.md): picomatch ReDoS. Every version up to 4.0.7 (the newest) is
 * affected, so there is nothing to update to yet. Only in build and test tools (vite, vitest,
 * rollup); nothing that ships to phones (`npm audit --omit=dev`: 0). Remove when 4.0.8 is out.
 */
export const ALLOWED: readonly AllowedAdvisory[] = [
  { id: 'GHSA-fc5q-39xc-vjpf', until: '2026-12-02', why: 'picomatch ReDoS, no fixed version yet; build and test tools only' },
]

const BLOCKING = new Set(['high', 'critical'])

export interface Advisory {
  id: string
  pkg: string
  severity: string
  title: string
}

export interface GateResult {
  ok: boolean
  /** High or critical advisories that fail CI. */
  blocking: Advisory[]
  /** High or critical advisories let through by an exception still in date. */
  allowed: Advisory[]
  /** Why the audit output itself could not be trusted (fails CI). */
  problem: string | null
}

const idFrom = (url: unknown): string | null => {
  const m = typeof url === 'string' ? url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i) : null
  return m ? m[0].toLowerCase() : null
}

/** `today` as YYYY-MM-DD (UTC). */
export function checkAudit(audit: unknown, today: string, allowed: readonly AllowedAdvisory[] = ALLOWED): GateResult {
  const vulns = (audit as { vulnerabilities?: unknown } | null)?.vulnerabilities
  if (!vulns || typeof vulns !== 'object') return { ok: false, blocking: [], allowed: [], problem: 'npm audit gave no vulnerability list (network or npm error?)' }
  const inDate = new Set(allowed.filter((a) => today <= a.until).map((a) => a.id.toLowerCase()))
  const seen = new Set<string>()
  const blocking: Advisory[] = []
  const let_: Advisory[] = []
  for (const v of Object.values(vulns as Record<string, { via?: unknown[] }>)) {
    // `via` holds the advisories themselves (objects) and the names of packages that bring one in
    // (strings); the advisory objects cover every case, so only those are checked.
    for (const via of v?.via ?? []) {
      if (!via || typeof via !== 'object') continue
      const a = via as { url?: unknown; severity?: unknown; name?: unknown; title?: unknown }
      const severity = String(a.severity ?? '')
      if (!BLOCKING.has(severity)) continue
      const id = idFrom(a.url) ?? `unknown:${String(a.name)}:${String(a.title)}`
      const key = `${id}|${String(a.name)}`
      if (seen.has(key)) continue
      seen.add(key)
      const adv = { id, pkg: String(a.name ?? '?'), severity, title: String(a.title ?? '') }
      ;(inDate.has(id) ? let_ : blocking).push(adv)
    }
  }
  return { ok: blocking.length === 0, blocking, allowed: let_, problem: null }
}
