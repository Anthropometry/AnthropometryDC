/**
 * F8 admin progress (specs/F8-admin-export.md): turning the database's counts into what the Admin
 * screen shows. Counts only, never a participant's details. No targets (Ryan, 13 Nov).
 */

export interface ProgressRow {
  sex: string
  ageGroup: 'adult' | 'child'
  ageRange: string
  complete: number
  measuredNoPhotos: number
  consentedNotMeasured: number
}

export type GroupKey = 'women' | 'men' | 'girls' | 'boys' | 'unknown'
export const GROUP_LABEL: Record<GroupKey, string> = {
  women: 'Women (18+)',
  men: 'Men (18+)',
  girls: 'Girls (8–17)',
  boys: 'Boys (8–17)',
  unknown: 'Sex not recorded yet',
}

export function groupOf(r: Pick<ProgressRow, 'sex' | 'ageGroup'>): GroupKey {
  if (r.sex === 'female') return r.ageGroup === 'child' ? 'girls' : 'women'
  if (r.sex === 'male') return r.ageGroup === 'child' ? 'boys' : 'men'
  return 'unknown'
}

export interface Counts {
  complete: number
  measuredNoPhotos: number
  consentedNotMeasured: number
}

const zero = (): Counts => ({ complete: 0, measuredNoPhotos: 0, consentedNotMeasured: 0 })
const add = (a: Counts, r: Counts) => {
  a.complete += r.complete
  a.measuredNoPhotos += r.measuredNoPhotos
  a.consentedNotMeasured += r.consentedNotMeasured
}

export interface Totals {
  groups: { key: GroupKey; counts: Counts; byRange: { range: string; counts: Counts }[] }[]
  all: Counts
}

/** Women, men, girls, boys (and "not recorded yet" only if any), each with its age ranges. */
export function totals(rows: readonly ProgressRow[]): Totals {
  const order: GroupKey[] = ['women', 'men', 'girls', 'boys', 'unknown']
  const all = zero()
  const groups = order
    .map((key) => {
      const mine = rows.filter((r) => groupOf(r) === key)
      const counts = zero()
      const ranges = new Map<string, Counts>()
      for (const r of mine) {
        add(counts, r)
        add(all, r)
        const c = ranges.get(r.ageRange) ?? zero()
        add(c, r)
        ranges.set(r.ageRange, c)
      }
      const byRange = [...ranges.entries()].sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([range, c]) => ({ range, counts: c }))
      return { key, counts, byRange }
    })
    .filter((g) => g.key !== 'unknown' || g.byRange.length > 0)
  return { groups, all }
}

/** "Nothing sent for 5 days" (Ryan, 13 Nov). */
export const QUIET_DAYS = 5

export function daysQuiet(lastSentAt: string | null, now: Date = new Date()): number | null {
  if (!lastSentAt) return null
  return Math.floor((now.getTime() - new Date(lastSentAt).getTime()) / 86_400_000)
}

export function isQuiet(lastSentAt: string | null, now: Date = new Date()): boolean {
  const d = daysQuiet(lastSentAt, now)
  return d === null || d >= QUIET_DAYS
}

/** Links that only open the admin's own phone: dialer, or WhatsApp with the collector's number. */
export function callLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
export function whatsAppLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}`
}

/** "12%" of a total, or "—" when there is nothing yet. */
export function share(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—'
}

export function sizeText(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.round(bytes / 1000)} KB`
}

/** Free-tier allowances (Cloudflare R2, Supabase free plan). */
export const FREE = { photoBytes: 10_000_000_000, databaseBytes: 500_000_000 }

export const SKIP_WORD: Record<string, string> = {
  declined: 'participant declined',
  could_not_measure: 'could not measure',
  other: 'other reason',
}
