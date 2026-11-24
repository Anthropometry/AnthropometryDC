/** CI dependency check: one dated exception, everything else high or critical still fails. */
import { describe, expect, it } from 'vitest'
import { ALLOWED, checkAudit } from './auditGate'

const adv = (name: string, severity: string, ghsa: string, title = 't') => ({ source: 1, name, dependency: name, title, url: `https://github.com/advisories/${ghsa}`, severity, range: '<=1' })
const audit = (vulns: Record<string, unknown[]>) => ({
  vulnerabilities: Object.fromEntries(Object.entries(vulns).map(([k, via]) => [k, { name: k, via }])),
})
const PICO = 'GHSA-fc5q-39xc-vjpf'

describe('audit gate', () => {
  it('the exception is only the picomatch advisory, and it has an expiry', () => {
    expect(ALLOWED.map((a) => a.id)).toEqual([PICO])
    expect(ALLOWED[0].until).toBe('2026-12-02')
  })

  it('passes with the allowed advisory in date, including packages that only bring it in', () => {
    const r = checkAudit(audit({ picomatch: [adv('picomatch', 'high', PICO)], vite: ['picomatch', 'tinyglobby'], tinyglobby: ['picomatch'] }), '2026-11-18')
    expect(r.ok).toBe(true)
    expect(r.allowed).toHaveLength(1)
    expect(r.blocking).toEqual([])
  })

  it('passes on the last allowed day', () => {
    expect(checkAudit(audit({ picomatch: [adv('picomatch', 'high', PICO)] }), '2026-12-02').ok).toBe(true)
  })

  it('DENY: after the expiry the same advisory fails again', () => {
    const r = checkAudit(audit({ picomatch: [adv('picomatch', 'high', PICO)] }), '2026-12-03')
    expect(r.ok).toBe(false)
    expect(r.blocking[0].id).toBe(PICO.toLowerCase())
  })

  it('DENY: any other high or critical advisory fails, even alongside the allowed one', () => {
    const r = checkAudit(audit({ picomatch: [adv('picomatch', 'high', PICO)], other: [adv('other', 'critical', 'GHSA-aaaa-bbbb-cccc')] }), '2026-11-18')
    expect(r.ok).toBe(false)
    expect(r.blocking.map((a) => a.pkg)).toEqual(['other'])
  })

  it('DENY: a high advisory with no recognisable id fails', () => {
    const r = checkAudit(audit({ x: [{ name: 'x', severity: 'high', title: 'no url' }] }), '2026-11-18')
    expect(r.ok).toBe(false)
  })

  it('moderate and low advisories do not fail (as before: --audit-level=high)', () => {
    expect(checkAudit(audit({ glob: [adv('glob', 'moderate', 'GHSA-3g3m-2fjr-6pw4')], y: [adv('y', 'low', 'GHSA-1111-2222-3333')] }), '2026-11-18').ok).toBe(true)
  })

  it('DENY: no vulnerability list (npm error, broken JSON) fails', () => {
    expect(checkAudit(null, '2026-11-18').ok).toBe(false)
    expect(checkAudit({ error: { code: 'ENOTFOUND' } }, '2026-11-18').problem).toMatch(/no vulnerability list/)
  })

  it('a clean audit passes', () => {
    expect(checkAudit({ vulnerabilities: {} }, '2026-11-18').ok).toBe(true)
  })
})
