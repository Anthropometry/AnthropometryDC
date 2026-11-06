import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { loadCachedProfile, saveCachedProfile, screenFor, type Profile } from './lib/profile'
import type { AuthClient } from './lib/auth'
import {
  createInvite,
  createMyInvite,
  decideCollector,
  fetchOwnProfile,
  listCollectors,
  listInvites,
  listMyInvites,
  revokeInvite,
  revokeMyInvite,
  showInvite,
} from './data/collectors'
import { Invite, type InviteApi } from './screens/Invite'
import { InstallArea } from './components/InstallArea'
import { Page, Title } from './components/ui'
import { Join } from './screens/Join'
import { SignIn } from './screens/SignIn'
import { Admin, type AdminApi } from './screens/Admin'
import type { ShareEnv } from './lib/invite'
import { Home, Inactive, Waiting, Welcome } from './screens/Status'

export type View = 'main' | 'join' | 'signin' | 'admin' | 'invite'

export interface AppViewProps {
  profile: Profile | null
  view: View
  online: boolean
  setView: (v: View) => void
  onAuthChanged: () => void
  onSignOut: () => void
  join: ReactNode
  signIn: ReactNode
  admin: ReactNode
  invite: ReactNode
  install: ReactNode
}

/** Pure routing: which screen for this profile and view (tested on its own). */
export function AppView(p: AppViewProps) {
  const screen = screenFor(p.profile)
  if (screen === 'welcome') {
    if (p.view === 'join') return <>{p.join}</>
    if (p.view === 'signin') return <>{p.signIn}</>
    return <Welcome onSignIn={() => p.setView('signin')} onJoin={() => p.setView('join')} install={p.install} />
  }
  if (screen === 'waiting')
    return <Waiting profile={p.profile!} online={p.online} onCheck={p.onAuthChanged} onSignOut={p.onSignOut} />
  if (screen === 'inactive') return <Inactive onSignOut={p.onSignOut} />
  if (p.view === 'admin' && p.profile!.role === 'admin') return <>{p.admin}</>
  if (p.view === 'invite') return <>{p.invite}</>
  return (
    <Home
      profile={p.profile!}
      online={p.online}
      onAdmin={() => p.setView('admin')}
      onInvite={() => p.setView('invite')}
      onSignOut={p.onSignOut}
      install={p.install}
    />
  )
}

// Created once: the Supabase client never changes, so the Invite screen loads its list once.
const inviteApi: InviteApi | null = supabase
  ? {
      list: () => listMyInvites(supabase as SupabaseClient),
      create: () => createMyInvite(supabase as SupabaseClient),
      revoke: (id) => revokeMyInvite(supabase as SupabaseClient, id),
    }
  : null

const adminApi: AdminApi | null = supabase
  ? {
      listCollectors: () => listCollectors(supabase as SupabaseClient),
      decide: (id, d) => decideCollector(supabase as SupabaseClient, id, d),
      listInvites: () => listInvites(supabase as SupabaseClient),
      createInvite: (label, uses, days) => createInvite(supabase as SupabaseClient, label, uses, days),
      showInvite: (id) => showInvite(supabase as SupabaseClient, id),
      revokeInvite: (id) => revokeInvite(supabase as SupabaseClient, id),
    }
  : null

const shareEnv: ShareEnv = {
  share: typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (d) => navigator.share(d) : undefined,
  copy: typeof navigator !== 'undefined' && navigator.clipboard ? (t) => navigator.clipboard.writeText(t) : undefined,
}

const storage = (() => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
})()

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(() => loadCachedProfile(storage))
  const [view, setView] = useState<View>('main')
  const [online, setOnline] = useState(navigator.onLine)

  /** Latest profile from the server, null when signed out, or 'keep' (offline / server trouble). */
  const loadProfile = useCallback(async (): Promise<Profile | null | 'keep'> => {
    if (!supabase) return 'keep'
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      // Only forget the collector when we know they are signed out (not merely offline).
      return navigator.onLine ? null : 'keep'
    }
    try {
      return await fetchOwnProfile(supabase)
    } catch {
      return 'keep'
    }
  }, [])

  const refresh = useCallback(() => {
    void loadProfile().then((p) => {
      if (p === 'keep') return
      setProfile(p)
      saveCachedProfile(storage, p)
    })
  }, [loadProfile])

  useEffect(() => {
    const up = () => {
      setOnline(true)
      refresh()
    }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    refresh()
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        saveCachedProfile(storage, null)
      }
    })
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      sub?.data.subscription.unsubscribe()
    }
  }, [refresh])

  const afterAuth = useCallback(() => {
    setView('main')
    refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    setProfile(null)
    saveCachedProfile(storage, null)
    setView('main')
    await supabase?.auth.signOut().catch(() => undefined)
  }, [])

  if (!supabase) {
    return (
      <Page>
        <Title>Anthro Collect</Title>
        <p>The login service is not configured yet.</p>
        <InstallArea />
      </Page>
    )
  }

  const client = supabase as SupabaseClient
  const authClient = client as unknown as AuthClient
  return (
    <AppView
      profile={profile}
      view={view}
      online={online}
      setView={setView}
      onAuthChanged={refresh}
      onSignOut={() => void signOut()}
      join={<Join client={authClient} onJoined={afterAuth} onBack={() => setView('main')} />}
      signIn={<SignIn client={authClient} onSignedIn={afterAuth} onBack={() => setView('main')} />}
      admin={
        profile ? (
          <Admin api={adminApi!} myId={profile.id} appUrl={window.location.origin} shareEnv={shareEnv} onBack={() => setView('main')} />
        ) : null
      }
      invite={
        <Invite
          api={inviteApi!}
          appUrl={window.location.origin}
          shareEnv={shareEnv}
          online={online}
          onBack={() => setView('main')}
        />
      }
      install={<InstallArea />}
    />
  )
}
