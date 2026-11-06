/**
 * Admin: approve collectors and manage invite codes (F1, Amendment B layout and Show code).
 * The database checks admin rights again on every call.
 */
import { useEffect, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react'
import type { CollectorRow, InviteRow } from '../data/collectors'
import { formatInviteCode, inviteMessage, shareInvite, shortDate, type InviteLimits, type ShareEnv } from '../lib/invite'
import { formatPhone } from '../lib/phone'
import { Button, ErrorText, Field, Page, Title } from '../components/ui'

export interface AdminApi {
  listCollectors: () => Promise<CollectorRow[]>
  decide: (id: string, decision: 'approved' | 'rejected' | 'disabled') => Promise<void>
  listInvites: () => Promise<InviteRow[]>
  createInvite: (label: string, maxUses: number, days: number) => Promise<string>
  showInvite: (id: string) => Promise<string>
  revokeInvite: (id: string) => Promise<void>
}

export interface AdminProps {
  api: AdminApi
  myId: string
  appUrl: string
  shareEnv: ShareEnv
  onBack: () => void
}

type CodeState = 'active' | 'used up' | 'expired' | 'revoked'

export function codeState(i: InviteRow, now = new Date()): CodeState {
  if (i.revoked) return 'revoked'
  if (i.uses >= i.maxUses) return 'used up'
  if (new Date(i.expiresAt) <= now) return 'expired'
  return 'active'
}

const STATUS_WORD: Record<CollectorRow['status'], string> = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Rejected',
  disabled: 'Disabled',
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

function SmallButton({ tone = 'brand', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'brand' | 'red' }) {
  const look = tone === 'red' ? 'border-red-700 text-red-700' : 'border-brand text-brand'
  return <button type="button" className={`rounded-lg border-2 bg-white px-3 py-2 font-semibold ${look}`} {...props} />
}

/** A code on screen with Share and Copy. */
function CodeBox({ title, code, limits, appUrl, shareEnv }: { title: string; code: string; limits: InviteLimits; appUrl: string; shareEnv: ShareEnv }) {
  const [note, setNote] = useState('')
  const text = inviteMessage(code, appUrl, limits)
  async function share() {
    const outcome = await shareInvite(text, { share: shareEnv.share, copy: shareEnv.copy })
    setNote(outcome === 'copied' ? 'Message copied. Paste it into WhatsApp or SMS.' : outcome === 'unavailable' ? 'Sharing is not available here. Read the code out instead.' : '')
  }
  async function copy() {
    const outcome = await shareInvite(text, { copy: shareEnv.copy })
    setNote(outcome === 'copied' ? 'Message copied. Paste it into WhatsApp or SMS.' : 'Copying is not available here. Read the code out instead.')
  }
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl bg-emerald-50 p-4 text-center">
      <p>{title}</p>
      <p className="font-mono text-3xl font-bold tracking-widest">{formatInviteCode(code)}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void share()}>Share</Button>
        <Button variant="secondary" onClick={() => void copy()}>
          Copy
        </Button>
      </div>
      {note && <p className="text-sm">{note}</p>}
    </div>
  )
}

export function Admin({ api, myId, appUrl, shareEnv, onBack }: AdminProps) {
  const [collectors, setCollectors] = useState<CollectorRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [error, setError] = useState('')
  const [newCode, setNewCode] = useState<{ code: string; limits: InviteLimits } | null>(null)
  const [shown, setShown] = useState<{ id: string; code: string } | null>(null)
  const [label, setLabel] = useState('')
  const [maxUses, setMaxUses] = useState('3')
  const [days, setDays] = useState('10')
  const [version, setVersion] = useState(0)
  const load = () => setVersion((v) => v + 1)

  useEffect(() => {
    let alive = true
    Promise.all([api.listCollectors(), api.listInvites()])
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
  }, [api, version])

  async function decide(id: string, decision: 'approved' | 'rejected' | 'disabled') {
    try {
      await api.decide(id, decision)
      load()
    } catch {
      setError('That change was not saved.')
    }
  }

  async function makeInvite(e: FormEvent) {
    e.preventDefault()
    try {
      const code = await api.createInvite(label.trim(), Number(maxUses), Number(days))
      setNewCode({ code, limits: { joinsLeft: Number(maxUses), expiresAt: new Date(Date.now() + Number(days) * 86_400_000).toISOString() } })
      setShown(null)
      setLabel('')
      load()
    } catch {
      setError('Could not create the invite code. Joins must be 1–500 and days 1–90.')
    }
  }

  async function show(id: string) {
    if (shown?.id === id) return setShown(null)
    try {
      setShown({ id, code: await api.showInvite(id) })
      setNewCode(null)
    } catch {
      setError('That code can no longer be shown. Make a new one.')
      load()
    }
  }

  async function revoke(id: string) {
    try {
      await api.revokeInvite(id)
      if (shown?.id === id) setShown(null)
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
        <h2 className="text-lg font-semibold">Waiting for approval ({pending.length})</h2>
        {pending.length === 0 && <p className="text-slate-500">Nobody is waiting.</p>}
        {pending.map((c) => (
          <article key={c.id} aria-label={`Waiting: ${c.displayName}`} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
            <h3 className="text-xl font-semibold">{c.displayName}</h3>
            <dl className="flex flex-col gap-1">
              <Line label="Phone">{formatPhone(c.phone)}</Line>
              <Line label="Joined">{shortDate(c.createdAt)}</Line>
              <Line label="Invited by">{c.invitedBy ?? '—'}</Line>
              {c.inviteLabel && <Line label="Code">{c.inviteLabel}</Line>}
            </dl>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => void decide(c.id, 'approved')}>Approve</Button>
              <Button variant="danger" onClick={() => void decide(c.id, 'rejected')}>
                Reject
              </Button>
            </div>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">All collectors</h2>
        {others.map((c) => (
          <article key={c.id} aria-label={`Collector: ${c.displayName}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div className="min-w-0">
              <p className="font-semibold">{c.displayName}</p>
              <p className="text-sm text-slate-600">
                {STATUS_WORD[c.status]}
                {c.role === 'admin' ? ' · Admin' : ''}
              </p>
              {c.invitedBy && <p className="text-sm text-slate-500">Invited by {c.invitedBy}</p>}
            </div>
            {c.id !== myId && c.status === 'approved' && (
              <SmallButton tone="red" onClick={() => void decide(c.id, 'disabled')}>
                Disable
              </SmallButton>
            )}
            {c.id !== myId && (c.status === 'disabled' || c.status === 'rejected') && (
              <SmallButton onClick={() => void decide(c.id, 'approved')}>Approve</SmallButton>
            )}
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Invite codes</h2>
        {newCode && <CodeBox title="New code" code={newCode.code} limits={newCode.limits} appUrl={appUrl} shareEnv={shareEnv} />}
        <form className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4" onSubmit={makeInvite}>
          <h3 className="font-semibold">Make a new code</h3>
          <Field label="Label (who it is for)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Joins allowed" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
            <Field label="Days valid" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <Button type="submit" disabled={label.trim() === ''}>
            Create invite code
          </Button>
        </form>

        {invites.map((i) => {
          const state = codeState(i)
          return (
            <article key={i.id} aria-label={`Code: ${i.label}`} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
              <p className="font-semibold">{i.label}</p>
              <p className="text-sm text-slate-600">
                {i.uses} of {i.maxUses} joined ·{' '}
                {state === 'active' ? `works until ${shortDate(i.expiresAt)}` : state === 'used up' ? 'Used up' : state === 'expired' ? 'Expired' : 'Revoked'}
              </p>
              {state === 'active' && (
                <div className="flex flex-wrap gap-2">
                  {i.canShow && (
                    <SmallButton onClick={() => void show(i.id)}>{shown?.id === i.id ? 'Hide code' : 'Show code'}</SmallButton>
                  )}
                  <SmallButton tone="red" onClick={() => void revoke(i.id)}>
                    Revoke
                  </SmallButton>
                </div>
              )}
              {shown?.id === i.id && state === 'active' && (
                <CodeBox title={`Code for ${i.label}`} code={shown.code} limits={{ joinsLeft: i.maxUses - i.uses, expiresAt: i.expiresAt }} appUrl={appUrl} shareEnv={shareEnv} />
              )}
            </article>
          )
        })}
      </section>

      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </Page>
  )
}
