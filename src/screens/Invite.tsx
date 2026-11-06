/** "Invite a collector" (F1 Amendment A3): referral codes for approved collectors. */
import { useEffect, useState } from 'react'
import type { MyInviteRow } from '../data/collectors'
import { formatInviteCode, inviteMessage, shareInvite, type ShareEnv } from '../lib/invite'
import { Button, ErrorText, Page, Title } from '../components/ui'

export interface InviteApi {
  list: () => Promise<MyInviteRow[]>
  create: () => Promise<string>
  revoke: (id: string) => Promise<void>
}

export interface InviteProps {
  api: InviteApi
  appUrl: string
  shareEnv: ShareEnv
  online: boolean
  onBack: () => void
}

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function isActive(i: MyInviteRow, now = new Date()): boolean {
  return !i.revoked && new Date(i.expiresAt) > now && i.uses < i.maxUses
}

export function Invite({ api, appUrl, shareEnv, online, onBack }: InviteProps) {
  const [codes, setCodes] = useState<MyInviteRow[]>([])
  const [version, setVersion] = useState(0)
  const [newCode, setNewCode] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .list()
      .then((rows) => {
        if (alive) setCodes(rows)
      })
      .catch(() => {
        if (alive) setError('Could not load your codes. Check your internet.')
      })
    return () => {
      alive = false
    }
  }, [api, version])

  const active = codes.filter((c) => isActive(c))

  async function create() {
    setBusy(true)
    setError('')
    setNote('')
    try {
      setNewCode(await api.create())
      setVersion((v) => v + 1)
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'too_many_active_codes'
          ? 'You already have 2 active codes. Revoke one, or wait until one is used up or expires.'
          : 'Could not make a code. Check your internet and try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    const outcome = await shareInvite(inviteMessage(newCode, appUrl), shareEnv)
    setNote(
      outcome === 'copied'
        ? 'Message copied. Paste it into WhatsApp or SMS.'
        : outcome === 'unavailable'
          ? `Sharing is not available on this phone. Send this code yourself: ${formatInviteCode(newCode)}`
          : '',
    )
  }

  async function revoke(id: string) {
    try {
      await api.revoke(id)
      setVersion((v) => v + 1)
    } catch {
      setError('Could not revoke the code.')
    }
  }

  return (
    <Page>
      <Title>Invite a collector</Title>
      <p className="text-slate-600">
        Make a code for someone you trust to collect data. Each code lets <b>3 people</b> join and lasts{' '}
        <b>10 days</b>. Everyone who joins still waits for the project lead to approve them, and the project lead
        sees that you invited them.
      </p>
      <ErrorText>{error}</ErrorText>

      {newCode ? (
        <div role="status" className="flex flex-col gap-3 rounded-xl bg-emerald-50 p-4 text-center">
          <p>Your new code (shown only now):</p>
          <p className="font-mono text-3xl font-bold tracking-widest">{formatInviteCode(newCode)}</p>
          <Button onClick={() => void share()}>Share</Button>
          {note && <p className="text-sm">{note}</p>}
        </div>
      ) : (
        <Button onClick={() => void create()} disabled={!online || busy || active.length >= 2}>
          {busy ? 'Making a code…' : 'Make an invite code'}
        </Button>
      )}
      {!newCode && active.length >= 2 && <p className="text-sm text-slate-600">You have 2 active codes, the most allowed.</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Your codes</h2>
        {codes.length === 0 && <p className="text-slate-500">No codes yet.</p>}
        {codes.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2">
            <span>
              {c.uses}/{c.maxUses} joined{' '}
              <span className="text-sm text-slate-500">
                · {c.revoked ? 'revoked' : isActive(c) ? `until ${when(c.expiresAt)}` : 'finished'}
              </span>
            </span>
            {isActive(c) && (
              <button type="button" className="text-red-700 underline" onClick={() => void revoke(c.id)}>
                Revoke
              </button>
            )}
          </div>
        ))}
      </section>

      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
    </Page>
  )
}
