/** Small screens: Welcome, Waiting for approval, Not active, Home (F2/F3). */
import type { ReactNode } from 'react'
import type { Profile } from '../lib/profile'
import { LANGUAGE_NAMES } from '../lib/settings'
import { shortDate } from '../lib/invite'
import { Button, ModeBanner, OfflineBanner, Page, SyncBadge, Title } from '../components/ui'

export function Welcome({ onSignIn, onJoin, install }: { onSignIn: () => void; onJoin: () => void; install?: ReactNode }) {
  return (
    <Page>
      <Title>Anthro Collect</Title>
      <p className="text-slate-600">
        Recording consent, tape measurements and face-blurred photos for a student research project at Ashesi
        University.
      </p>
      <Button onClick={onSignIn}>Sign in</Button>
      <Button variant="secondary" onClick={onJoin}>
        Join with invite code
      </Button>
      {install}
    </Page>
  )
}

export function Waiting({
  profile,
  online,
  onCheck,
  onSignOut,
}: {
  profile: Profile
  online: boolean
  onCheck: () => void
  onSignOut: () => void
}) {
  return (
    <Page>
      <OfflineBanner online={online} />
      <Title>Waiting for approval</Title>
      <p>
        Hello {profile.displayName}. The project lead will approve you soon. You can close the app; you stay signed in.
      </p>
      <Button onClick={onCheck} disabled={!online}>
        Check again
      </Button>
      <Button variant="secondary" onClick={onSignOut}>
        Sign out
      </Button>
    </Page>
  )
}

export function Inactive({ onSignOut }: { onSignOut: () => void }) {
  return (
    <Page>
      <Title>Account not active</Title>
      <p>Your account is not active. Contact the project lead.</p>
      <Button variant="secondary" onClick={onSignOut}>
        Sign out
      </Button>
    </Page>
  )
}

export interface HomeProps {
  profile: Profile
  online: boolean
  /** From app_settings; false until the project lead opens collection after IRB approval. */
  collectionOpen: boolean
  /** Records and settings on this phone that are not on the server yet. */
  waiting: number
  /** Last phone check on this phone, if any. */
  lastCheck: { passed: boolean; checkedAt: string } | null
  onPracticeNew: () => void
  onPracticeList: () => void
  onRealNew: () => void
  onCheck: () => void
  onSettings: () => void
  onAdmin: () => void
  onInvite: () => void
  onSignOut: () => void
  install?: ReactNode
}

export function Home(p: HomeProps) {
  const { profile, online } = p
  return (
    <Page>
      <OfflineBanner online={online} />
      <Title>Hello {profile.displayName}</Title>
      <div className="flex flex-col gap-2">
        <SyncBadge online={online} waiting={p.waiting} />
        <p className="text-sm text-slate-600">
          {p.collectionOpen ? 'Real collection is open' : 'Practice only'} · {profile.unit} · {LANGUAGE_NAMES[profile.language]}
        </p>
      </div>

      <section className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4" aria-label="Phone check">
        <h2 className="font-semibold">Phone check</h2>
        <p className={`text-sm ${p.lastCheck && !p.lastCheck.passed ? 'text-red-800' : 'text-slate-600'}`}>
          {p.lastCheck
            ? `Last check: ${p.lastCheck.passed ? 'passed' : 'needs attention'} on ${shortDate(p.lastCheck.checkedAt)}`
            : 'Not checked yet. Check before you practise.'}
        </p>
        <Button variant="secondary" onClick={p.onCheck}>
          Check this phone
        </Button>
      </section>

      <Button onClick={p.onPracticeNew}>Start practice participant</Button>
      <Button variant="secondary" onClick={p.onPracticeList}>
        My practice list
      </Button>
      {p.collectionOpen ? (
        <Button onClick={p.onRealNew}>Start real participant</Button>
      ) : (
        <p className="text-slate-600">
          Real collection opens after ethics (IRB) approval. Use practice to learn the steps.
        </p>
      )}

      <Button variant="secondary" onClick={p.onSettings}>
        Settings
      </Button>
      <Button variant="secondary" onClick={p.onInvite} disabled={!online}>
        Invite a collector
      </Button>
      {profile.role === 'admin' && (
        <Button onClick={p.onAdmin} disabled={!online}>
          Admin: collectors and invite codes
        </Button>
      )}
      {p.install}
      <Button variant="secondary" onClick={p.onSignOut}>
        Sign out
      </Button>
    </Page>
  )
}

/** Shown if collection is open but this app does not have the approved consent text (version) yet. */
export function RealComingSoon({ onBack }: { onBack: () => void }) {
  return (
    <Page>
      <ModeBanner real />
      <Title>Real participant</Title>
      <p>The approved consent text is not in this version of the app yet. Ask the project lead, and use practice meanwhile.</p>
      <Button variant="secondary" onClick={onBack}>
        Back to Home
      </Button>
    </Page>
  )
}
