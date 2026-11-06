/** Small screens: Welcome, Waiting for approval, Not active, Home. */
import type { ReactNode } from 'react'
import type { Profile } from '../lib/profile'
import { Button, OfflineBanner, Page, Title } from '../components/ui'

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

export function Home({
  profile,
  online,
  onAdmin,
  onInvite,
  onSignOut,
  install,
}: {
  profile: Profile
  online: boolean
  onAdmin: () => void
  onInvite: () => void
  onSignOut: () => void
  install?: ReactNode
}) {
  return (
    <Page>
      <OfflineBanner online={online} />
      <Title>Hello {profile.displayName}</Title>
      <p className="text-slate-600">
        You are signed in. Practice participants, consent, measurements and photos come in the next updates.
      </p>
      <Button variant="secondary" onClick={onInvite} disabled={!online}>
        Invite a collector
      </Button>
      {profile.role === 'admin' && (
        <Button onClick={onAdmin} disabled={!online}>
          Admin: collectors and invite codes
        </Button>
      )}
      {install}
      <Button variant="secondary" onClick={onSignOut}>
        Sign out
      </Button>
    </Page>
  )
}
