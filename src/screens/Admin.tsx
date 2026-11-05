/** Admin: approve collectors and manage invite codes. The database checks admin rights again. */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createInvite,
  decideCollector,
  listCollectors,
  listInvites,
  revokeInvite,
  type CollectorRow,
  type InviteRow,
} from '../data/collectors'
import { Button, ErrorText, Field, Page, Title } from '../components/ui'

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function Admin({ client, myId, onBack }: { client: SupabaseClient; myId: string; onBack: () => void }) {
  const [collectors, setCollectors] = useState<CollectorRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [error, setError] = useState('')
  const [newCode, setNewCode] = useState('')
  const [label, setLabel] = useState('')
  const [maxUses, setMaxUses] = useState('10')
  const [days, setDays] = useState('14')

  const [version, setVersion] = useState(0)
  const load = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let alive = true
    Promise.all([listCollectors(client), listInvites(client)])
      .then(([c, i]) => {
        if (!alive) return
        setCollectors(c)
        setInvites(i)
        setError('')
      })
      .catch(() => {
        if (alive) setError('Could not load. Check your internet and try again.')
      })
    return () => {
      alive = false
    }
  }, [client, version])

  async function decide(id: string, decision: 'approved' | 'rejected' | 'disabled') {
    try {
      await decideCollector(client, id, decision)
      load()
    } catch {
      setError('That change was not saved.')
    }
  }

  async function makeInvite(e: FormEvent) {
    e.preventDefault()
    try {
      const code = await createInvite(client, label.trim(), Number(maxUses), Number(days))
      setNewCode(code)
      setLabel('')
      load()
    } catch {
      setError('Could not create the invite code. Uses must be 1–500 and days 1–90.')
    }
  }

  async function revoke(id: string) {
    try {
      await revokeInvite(client, id)
      load()
    } catch {
      setError('Could not revoke the code.')
    }
  }

  const pending = collectors.filter((c) => c.status === 'pending')
  const others = collectors.filter((c) => c.status !== 'pending')

  return (
    <Page>
      <Title>Admin</Title>
      <ErrorText>{error}</ErrorText>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Pending collectors ({pending.length})</h2>
        {pending.length === 0 && <p className="text-slate-500">Nobody is waiting.</p>}
        {pending.map((c) => (
          <div key={c.id} className="rounded-xl border border-slate-200 p-3">
            <p className="font-semibold">{c.displayName}</p>
            <p className="text-sm text-slate-600">
              {c.phone} · code “{c.inviteLabel ?? '—'}” · joined {when(c.createdAt)}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button onClick={() => void decide(c.id, 'approved')}>Approve</Button>
              <Button variant="danger" onClick={() => void decide(c.id, 'rejected')}>
                Reject
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">All collectors</h2>
        {others.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2">
            <span>
              {c.displayName} <span className="text-sm text-slate-500">· {c.status}{c.role === 'admin' ? ' · admin' : ''}</span>
            </span>
            {c.id !== myId && c.status === 'approved' && (
              <button type="button" className="text-red-700 underline" onClick={() => void decide(c.id, 'disabled')}>
                Disable
              </button>
            )}
            {c.id !== myId && (c.status === 'disabled' || c.status === 'rejected') && (
              <button type="button" className="text-brand underline" onClick={() => void decide(c.id, 'approved')}>
                Approve
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Invite codes</h2>
        {newCode && (
          <div role="status" className="rounded-xl bg-emerald-50 p-4 text-center">
            <p>New code (shown only now, write it down):</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-widest">
              {newCode.slice(0, 4)}-{newCode.slice(4)}
            </p>
          </div>
        )}
        <form className="flex flex-col gap-3" onSubmit={makeInvite}>
          <Field label="Label (who it is for)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Max uses" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
            <Field label="Days valid" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <Button type="submit" disabled={label.trim() === ''}>
            Create invite code
          </Button>
        </form>
        {invites.map((i) => {
          const expired = new Date(i.expiresAt) < new Date()
          return (
            <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2">
              <span>
                {i.label}{' '}
                <span className="text-sm text-slate-500">
                  · {i.uses}/{i.maxUses} used · {i.revoked ? 'revoked' : expired ? 'expired' : `until ${when(i.expiresAt)}`}
                </span>
              </span>
              {!i.revoked && !expired && (
                <button type="button" className="text-red-700 underline" onClick={() => void revoke(i.id)}>
                  Revoke
                </button>
              )}
            </div>
          )
        })}
      </section>

      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </Page>
  )
}
