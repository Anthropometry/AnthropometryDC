/**
 * Admin: approve collectors and manage invite codes (F1, Amendment B layout and Show code).
 * The database checks admin rights again on every call.
 */
import { useEffect, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react'
import type { CollectorRow, InviteRow } from '../data/collectors'
import type { PhoneCheckRow } from '../data/fieldwork'
import type { WithdrawOutcome, WithdrawPreview } from '../data/consent'
import { cleanReceipt, formatReceipt, isReceiptCode } from '../lib/receipt'
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
  listPhoneChecks: () => Promise<PhoneCheckRow[]>
  previewWithdraw: (receipt: string) => Promise<WithdrawPreview>
  withdraw: (receipt: string) => Promise<{ outcome: WithdrawOutcome; participantId?: string }>
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

/** F4: withdraw a participant by receipt code. Shows no name; asks for the code twice. */
export function WithdrawSection({ api }: { api: Pick<AdminApi, 'previewWithdraw' | 'withdraw'> }) {
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<WithdrawPreview | null>(null)
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const clean = cleanReceipt(code)

  async function lookUp() {
    setMessage('')
    setConfirm('')
    try {
      setPreview(await api.previewWithdraw(clean))
    } catch {
      setPreview(null)
      setMessage('Could not look that up. Check your internet.')
    }
  }

  async function go() {
    setBusy(true)
    try {
      const r = await api.withdraw(clean)
      setMessage(
        r.outcome === 'withdrawn'
          ? `Withdrawn. Everything for ${formatReceipt(clean)} was deleted.`
          : r.outcome === 'not_found'
            ? 'Nothing to withdraw for that code (already withdrawn or not found).'
            : r.outcome === 'files_not_deleted'
              ? `Deleted from the database, but the signature images could not be deleted. Note this id and try again later, or delete the folder ${r.participantId}/ in both R2 buckets.`
              : r.outcome === 'forbidden'
                ? 'Not allowed. Sign in again as an admin.'
                : 'Could not withdraw. Check your internet and try again.',
      )
      if (r.outcome === 'withdrawn' || r.outcome === 'not_found') {
        setPreview(null)
        setCode('')
        setConfirm('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-red-200 p-4" aria-label="Withdraw a participant">
      <h2 className="text-lg font-semibold">Withdraw a participant</h2>
      <p className="text-sm text-slate-600">When someone gives you their receipt code and asks to withdraw, every record and image for them is deleted.</p>
      <Field
        label="Receipt code"
        value={code}
        maxLength={12}
        autoComplete="off"
        onChange={(e) => {
          setCode(e.target.value)
          setPreview(null)
          setMessage('')
        }}
      />
      <Button variant="secondary" disabled={!isReceiptCode(clean)} onClick={() => void lookUp()}>
        Look up
      </Button>
      {preview && !preview.found && (
        <p role="status">{preview.alreadyWithdrawn ? 'Already withdrawn.' : 'No participant has that code.'}</p>
      )}
      {preview?.found && (
        <div role="status" className="flex flex-col gap-2 rounded-xl bg-red-50 p-3">
          <p>
            {preview.isPractice ? 'Practice' : 'Real'} participant · {preview.ageGroup === 'child' ? 'Under 18' : 'Adult'} ·{' '}
            {preview.createdAt ? shortDate(preview.createdAt) : ''} · collected by {preview.collectorName ?? 'unknown'}
          </p>
          <Field label="Type the code again to confirm" value={confirm} maxLength={12} autoComplete="off" onChange={(e) => setConfirm(e.target.value)} />
          <Button variant="danger" disabled={busy || cleanReceipt(confirm) !== clean} onClick={() => void go()}>
            {busy ? 'Withdrawing…' : 'Withdraw and delete'}
          </Button>
        </div>
      )}
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  )
}

export function Admin({ api, myId, appUrl, shareEnv, onBack }: AdminProps) {
  const [collectors, setCollectors] = useState<CollectorRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [checks, setChecks] = useState<PhoneCheckRow[]>([])
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
    Promise.all([api.listCollectors(), api.listInvites(), api.listPhoneChecks()])
      .then(([c, i, pc]) => {
        if (!alive) return
        setCollectors(c)
        setInvites(i)
        setChecks(pc)
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

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Phone checks</h2>
        {checks.length === 0 && <p className="text-slate-500">No phone checks yet.</p>}
        {checks.map((c) => (
          <article key={c.collectorId} aria-label={`Phone check: ${c.displayName}`} className="rounded-xl border border-slate-200 p-3">
            <p className="font-semibold">
              {c.displayName}{' '}
              <span className={c.passed ? 'text-emerald-700' : 'text-red-700'}>{c.passed ? '✓ Passed' : '✗ Needs attention'}</span>
            </p>
            <p className="text-sm text-slate-600">
              {[c.phoneModel, c.os, c.browser].filter(Boolean).join(' · ') || 'Unknown phone'} · {shortDate(c.checkedAt)}
            </p>
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
              {state === 'active' && !i.canShow && (
                <p className="text-sm text-slate-500">
                  This code can&apos;t be shown again (made before Show code existed, or by a collector or in the SQL
                  editor). To share it again, make a new code.
                </p>
              )}
              {shown?.id === i.id && state === 'active' && (
                <CodeBox title={`Code for ${i.label}`} code={shown.code} limits={{ joinsLeft: i.maxUses - i.uses, expiresAt: i.expiresAt }} appUrl={appUrl} shareEnv={shareEnv} />
              )}
            </article>
          )
        })}
      </section>

      <WithdrawSection api={api} />

      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </Page>
  )
}
