/** F3: new practice participant and the collector's practice list. Always under the PRACTICE banner. */
import { useEffect, useState } from 'react'
import { practiceLabel, type AgeGroup, type PracticeRow } from '../lib/practice'
import { shortDate } from '../lib/invite'
import { Button, Choice, ErrorText, ModeBanner, Page, Title } from '../components/ui'

export function PracticeNew({
  create,
  onList,
  onBack,
}: {
  create: (ageGroup: AgeGroup) => Promise<{ practiceNo: number | null }>
  onList: () => void
  onBack: () => void
}) {
  const [age, setAge] = useState<AgeGroup | null>(null)
  const [made, setMade] = useState<{ practiceNo: number | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function go() {
    if (!age) return
    setBusy(true)
    setError('')
    try {
      setMade(await create(age))
    } catch {
      setError('Could not save on this phone. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <ModeBanner real={false} />
      <Title>New practice participant</Title>
      <ErrorText>{error}</ErrorText>
      {made ? (
        <>
          <div role="status" className="rounded-xl bg-amber-50 p-4 text-center">
            <p>Practice participant</p>
            <p className="mt-1 font-mono text-3xl font-bold">{practiceLabel(made.practiceNo)}</p>
            {made.practiceNo === null && (
              <p className="mt-2 text-sm">Saved on this phone. It gets its number when you are online.</p>
            )}
          </div>
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-600">
            Next: consent. It comes in the next update (F4). For now, this practice participant is saved.
          </p>
          <Button onClick={onList}>My practice list</Button>
        </>
      ) : (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-lg font-semibold">Age group</legend>
            <Choice chosen={age === 'adult'} onClick={() => setAge('adult')}>
              Adult (18 or older)
            </Choice>
            <Choice chosen={age === 'child'} onClick={() => setAge('child')}>
              Under 18
            </Choice>
          </fieldset>
          <Button onClick={() => void go()} disabled={!age || busy}>
            {busy ? 'Saving…' : 'Start practice'}
          </Button>
        </>
      )}
      <Button variant="secondary" onClick={onBack}>
        Back to Home
      </Button>
    </Page>
  )
}

export function PracticeList({
  load,
  remove,
  onNew,
  onBack,
}: {
  load: () => Promise<PracticeRow[]>
  remove: (row: PracticeRow) => Promise<void>
  onNew: () => void
  onBack: () => void
}) {
  const [rows, setRows] = useState<PracticeRow[]>([])
  const [version, setVersion] = useState(0)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    load()
      .then((r) => {
        if (alive) setRows(r)
      })
      .catch(() => {
        if (alive) setError('Could not load your practice list.')
      })
    return () => {
      alive = false
    }
  }, [load, version])

  async function del(row: PracticeRow) {
    if (confirm !== row.id) return setConfirm(row.id)
    setConfirm(null)
    try {
      await remove(row)
      setVersion((v) => v + 1)
    } catch {
      setError('Could not delete. Check your internet and try again.')
    }
  }

  return (
    <Page>
      <ModeBanner real={false} />
      <Title>My practice list</Title>
      <ErrorText>{error}</ErrorText>
      <Button onClick={onNew}>New practice participant</Button>
      {rows.length === 0 && <p className="text-slate-500">No practice participants yet.</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} aria-label={`Practice ${practiceLabel(r.practiceNo)}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div>
              <p className="font-mono font-semibold">
                {practiceLabel(r.practiceNo)} <span className="font-sans text-xs font-bold text-amber-700">PRACTICE</span>
              </p>
              <p className="text-sm text-slate-600">
                {r.ageGroup === 'adult' ? 'Adult' : 'Under 18'} · {shortDate(r.createdAt)} ·{' '}
                {r.waiting ? 'on this phone' : 'saved'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void del(r)}
              className="rounded-lg border-2 border-red-700 bg-white px-3 py-2 font-semibold text-red-700"
            >
              {confirm === r.id ? 'Tap again to delete' : 'Delete'}
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={onBack}>
        Back to Home
      </Button>
    </Page>
  )
}
