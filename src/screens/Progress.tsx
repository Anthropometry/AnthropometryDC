/**
 * F8 Progress on the Admin screen (specs/F8-admin-export.md). Counts only: never a participant's name,
 * receipt code, photo or single values. No targets. Collectors' cards show follow-ups and Call /
 * WhatsApp links that only open the admin's own phone.
 */
import { Fragment, useCallback, useEffect, useState } from 'react'
import type { CollectorRow } from '../data/collectors'
import type { PhoneCheckRow } from '../data/fieldwork'
import type { ProgressData } from '../data/progress'
import { FREE, GROUP_LABEL, QUIET_DAYS, SKIP_WORD, callLink, daysQuiet, isQuiet, share, sizeText, totals, whatsAppLink, type Counts } from '../lib/progress'
import { shortDate } from '../lib/invite'

export interface ProgressProps {
  load: (practice: boolean) => Promise<ProgressData>
  collectors: CollectorRow[]
  checks: PhoneCheckRow[]
  online: boolean
  now?: () => Date
}

function Cells({ c }: { c: Counts }) {
  return (
    <>
      <td className="px-2 py-1 text-right font-semibold">{c.complete}</td>
      <td className="px-2 py-1 text-right">{c.measuredNoPhotos}</td>
      <td className="px-2 py-1 text-right">{c.consentedNotMeasured}</td>
    </>
  )
}

export function Progress({ load, collectors, checks, online, now = () => new Date() }: ProgressProps) {
  const [practice, setPractice] = useState(false)
  const [data, setData] = useState<ProgressData | null>(null)
  const [asOf, setAsOf] = useState<Date | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    if (!online) return
    load(practice)
      .then((d) => {
        setError('')
        setData(d)
        setAsOf(now())
      })
      .catch(() => setError('Could not load progress. Try again.'))
  }, [load, practice, online, now])
  useEffect(refresh, [refresh])

  const t = data ? totals(data.rows) : null
  const q = (item: string, detail: string | null = null) => data?.quality.find((x) => x.item === item && x.detail === detail)?.n ?? 0
  const maxBand = data ? Math.max(1, ...data.bands.map((b) => b.n)) : 1

  return (
    <section className="flex flex-col gap-3" aria-label="Progress">
      <h2 className="text-lg font-semibold">Progress</h2>
      {!online && <p className="text-slate-600">Progress needs a connection.</p>}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Real or practice">
        {[false, true].map((p) => (
          <button
            key={String(p)}
            type="button"
            aria-pressed={practice === p}
            onClick={() => setPractice(p)}
            className={`rounded-xl border-2 py-2 font-semibold ${practice === p ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}
          >
            {p ? 'Practice' : 'Real participants'}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}

      {t && data && (
        <>
          <table className="w-full text-sm" aria-label="Totals">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="px-2 py-1"></th>
                <th className="px-2 py-1 text-right">Complete</th>
                <th className="px-2 py-1 text-right">Photos missing</th>
                <th className="px-2 py-1 text-right">Not measured</th>
              </tr>
            </thead>
            <tbody>
              {t.groups.map((g) => (
                <Fragment key={g.key}>
                  <tr className="border-t border-slate-200">
                    <td className="px-2 py-1">
                      <button type="button" className="text-left underline-offset-2 hover:underline" aria-expanded={open === g.key} onClick={() => setOpen(open === g.key ? null : g.key)}>
                        {GROUP_LABEL[g.key]} {open === g.key ? '▾' : '▸'}
                      </button>
                    </td>
                    <Cells c={g.counts} />
                  </tr>
                  {open === g.key &&
                    g.byRange.map((r) => (
                      <tr key={r.range} className="text-slate-600">
                        <td className="px-2 py-1 pl-6">{r.range.replace('-', '–')}</td>
                        <Cells c={r.counts} />
                      </tr>
                    ))}
                </Fragment>
              ))}
              <tr className="border-t-2 border-slate-400 font-semibold">
                <td className="px-2 py-1">All</td>
                <Cells c={t.all} />
              </tr>
            </tbody>
          </table>
          {data.weekly.length > 0 && (
            <p className="text-sm text-slate-600">
              Complete per week: {data.weekly.map((w) => `${shortDate(w.weekStart)}: ${w.complete}`).join(' · ')}
            </p>
          )}

          <h3 className="font-semibold">Collectors</h3>
          {data.collectors.length === 0 && <p className="text-slate-500">No approved collectors.</p>}
          {data.collectors.map((c) => {
            const who = collectors.find((x) => x.id === c.collectorId)
            const check = checks.find((x) => x.collectorId === c.collectorId)
            const quiet = isQuiet(c.lastSentAt, now())
            const days = daysQuiet(c.lastSentAt, now())
            const total = c.measurementsTaken + c.measurementsSkipped
            return (
              <article key={c.collectorId} aria-label={`Progress: ${who?.displayName ?? 'Collector'}`} className={`flex flex-col gap-1 rounded-xl border p-3 ${quiet ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}>
                <p className="font-semibold">{who?.displayName ?? 'Collector'}</p>
                <p className="text-sm">
                  Complete: <b>{c.completeWeek}</b> this week · <b>{c.completeTotal}</b> in total
                </p>
                {(c.measuredNoPhotos > 0 || c.consentedNotMeasured > 0) && (
                  <p className="text-sm text-slate-700">
                    To finish: {c.measuredNoPhotos} measured, photos missing · {c.consentedNotMeasured} consented, not measured
                  </p>
                )}
                <p className={`text-sm ${quiet ? 'font-semibold text-amber-900' : 'text-slate-600'}`}>
                  {c.lastSentAt === null ? 'Nothing sent yet' : quiet ? `Nothing sent for ${days} days` : `Last sent ${shortDate(c.lastSentAt)}`}
                </p>
                <p className="text-sm text-slate-600">
                  Practice complete: {c.practiceComplete} · Phone check: {check ? `${check.passed ? 'passed' : 'needs attention'}${check.phoneModel ? ` (${check.phoneModel})` : ''}` : 'not done'}
                </p>
                <p className="text-sm text-slate-600">
                  Skipped {share(c.measurementsSkipped, total)} of measurements · {c.unusualKept} unusual kept · {c.photosMorePeople} photos with someone else in them
                </p>
                {who?.phone && (
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <a href={callLink(who.phone)} className="rounded-xl border-2 border-brand py-2 text-center font-semibold text-brand">
                      Call
                    </a>
                    <a href={whatsAppLink(who.phone)} target="_blank" rel="noreferrer" className="rounded-xl border-2 border-brand py-2 text-center font-semibold text-brand">
                      WhatsApp
                    </a>
                  </div>
                )}
              </article>
            )
          })}
          <p className="text-xs text-slate-500">Amber: nothing sent for {QUIET_DAYS} days or more.</p>

          <h3 className="font-semibold">Spread of heights</h3>
          {data.bands.length === 0 ? (
            <p className="text-slate-500">No heights yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm" aria-label="Heights">
              {data.bands.map((b) => (
                <li key={`${b.sex}-${b.ageGroup}-${b.bandCm}`} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2">
                  <span>
                    {GROUP_LABEL[b.sex === 'female' ? (b.ageGroup === 'child' ? 'girls' : 'women') : b.ageGroup === 'child' ? 'boys' : 'men'].split(' ')[0]} {b.bandCm}–{b.bandCm + 9} cm
                  </span>
                  <span className="h-3 rounded bg-brand" style={{ width: `${(b.n / maxBand) * 100}%` }} />
                  <span className="text-right">{b.n}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="font-semibold">Quality</h3>
          <ul className="flex flex-col gap-1 text-sm" aria-label="Quality">
            <li>
              Skipped measurements: {Object.keys(SKIP_WORD).map((k) => `${q('skipped', k)} ${SKIP_WORD[k]}`).join(' · ')}
            </li>
            {data.quality.filter((x) => x.item === 'skipped_code').length > 0 && (
              <li>Most skipped: {data.quality.filter((x) => x.item === 'skipped_code').map((x) => `${x.detail?.replace(/_/g, ' ')} (${x.n})`).join(', ')}</li>
            )}
            <li>Unusual values kept: {q('unusual_kept')}</li>
            <li>Photos with someone else in them: {q('photos_more_people')}</li>
            <li>
              Weight (agreed): {q('weight', 'scale')} on a scale · {q('weight', 'told')} stated · {q('weight', 'none')} skipped
            </li>
            <li>Personal measurements agreed: {q('intimate_agreed')}</li>
            <li>Stated minus measured height: {q('height_stated_minus_measured_cm')} cm on average</li>
            <li>Stated minus scale weight: {q('weight_stated_minus_scale_kg')} kg on average</li>
            <li>Withdrawals: {q('withdrawals')}</li>
          </ul>

          <h3 className="font-semibold">Free space</h3>
          <p className="text-sm">
            Photos: {sizeText(data.space.photoBytes)} of {sizeText(FREE.photoBytes)} ({share(data.space.photoBytes, FREE.photoBytes)}) · Database: {sizeText(data.space.databaseBytes)} of{' '}
            {sizeText(FREE.databaseBytes)} ({share(data.space.databaseBytes, FREE.databaseBytes)})
          </p>
        </>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{asOf ? `As of ${asOf.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        <button type="button" disabled={!online} onClick={refresh} className="rounded-xl border-2 border-brand px-4 py-2 font-semibold text-brand disabled:opacity-40">
          Refresh
        </button>
      </div>
    </section>
  )
}
