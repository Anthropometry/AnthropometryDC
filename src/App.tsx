import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import {
  loadCachedProfile,
  readJson,
  saveCachedProfile,
  scopedStore,
  screenFor,
  writeJson,
  type KeyValueStore,
  type Profile,
} from './lib/profile'
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
import {
  deletePractice,
  fetchCollectionOpen,
  insertPractice,
  listPhoneChecks,
  listPractice,
  saveDeviceCheck,
  saveSettingsRemote,
} from './data/fieldwork'
import { flushSettings, loadPendingSettings, saveSettings, withSettings, type Settings } from './lib/settings'
import { addPractice, flushPractice, loadWaiting, mergePractice, removePractice, type PracticeApi } from './lib/practice'
import { runPhoneCheck, type PhoneCheckResult } from './lib/phonecheck'
import type { ShareEnv } from './lib/invite'
import { browserCheckEnv } from './browserEnv'
import { Invite, type InviteApi } from './screens/Invite'
import { InstallArea } from './components/InstallArea'
import { Page, Title } from './components/ui'
import { Join } from './screens/Join'
import { SignIn } from './screens/SignIn'
import { Admin, type AdminApi } from './screens/Admin'
import { SettingsScreen } from './screens/Settings'
import { PhoneCheck } from './screens/PhoneCheck'
import { PracticeList, PracticeNew } from './screens/Practice'
import { Home, Inactive, RealComingSoon, Waiting, Welcome } from './screens/Status'

export type View =
  | 'main'
  | 'join'
  | 'signin'
  | 'admin'
  | 'invite'
  | 'settings'
  | 'check'
  | 'practice-new'
  | 'practice-list'
  | 'real'

export interface AppViewProps {
  profile: Profile | null
  view: View
  online: boolean
  setView: (v: View) => void
  onAuthChanged: () => void
  onSignOut: () => void
  /** F2/F3 facts shown on Home. */
  collectionOpen?: boolean
  waiting?: number
  lastCheck?: { passed: boolean; checkedAt: string } | null
  join: ReactNode
  signIn: ReactNode
  admin: ReactNode
  invite: ReactNode
  install: ReactNode
  setup?: ReactNode
  settings?: ReactNode
  check?: ReactNode
  practiceNew?: ReactNode
  practiceList?: ReactNode
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
  if (screen === 'setup') return <>{p.setup}</>
  const open = p.collectionOpen === true
  if (p.view === 'admin' && p.profile!.role === 'admin') return <>{p.admin}</>
  if (p.view === 'invite') return <>{p.invite}</>
  if (p.view === 'settings') return <>{p.settings}</>
  if (p.view === 'check') return <>{p.check}</>
  if (p.view === 'practice-new') return <>{p.practiceNew}</>
  if (p.view === 'practice-list') return <>{p.practiceList}</>
  if (p.view === 'real' && open) return <RealComingSoon onBack={() => p.setView('main')} />
  return (
    <Home
      profile={p.profile!}
      online={p.online}
      collectionOpen={open}
      waiting={p.waiting ?? 0}
      lastCheck={p.lastCheck ?? null}
      onPracticeNew={() => p.setView('practice-new')}
      onPracticeList={() => p.setView('practice-list')}
      onRealNew={() => p.setView('real')}
      onCheck={() => p.setView('check')}
      onSettings={() => p.setView('settings')}
      onAdmin={() => p.setView('admin')}
      onInvite={() => p.setView('invite')}
      onSignOut={p.onSignOut}
      install={p.install}
    />
  )
}

// Created once: the Supabase client never changes, so screens load their lists once.
const db = supabase as SupabaseClient
const inviteApi: InviteApi | null = supabase
  ? {
      list: () => listMyInvites(db),
      create: () => createMyInvite(db),
      revoke: (id) => revokeMyInvite(db, id),
    }
  : null

const adminApi: AdminApi | null = supabase
  ? {
      listCollectors: () => listCollectors(db),
      decide: (id, d) => decideCollector(db, id, d),
      listInvites: () => listInvites(db),
      createInvite: (label, uses, days) => createInvite(db, label, uses, days),
      showInvite: (id) => showInvite(db, id),
      revokeInvite: (id) => revokeInvite(db, id),
      listPhoneChecks: () => listPhoneChecks(db),
    }
  : null

const practiceApi: PracticeApi = {
  insert: (p) => insertPractice(db, p),
  list: () => listPractice(db),
  remove: (id) => deletePractice(db, id),
}

const shareEnv: ShareEnv = {
  share: typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (d) => navigator.share(d) : undefined,
  copy: typeof navigator !== 'undefined' && navigator.clipboard ? (t) => navigator.clipboard.writeText(t) : undefined,
}

const storage: KeyValueStore | undefined = (() => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
})()

const OPEN_KEY = 'anthro-collect.collection-open.v1'
const LAST_CHECK = 'anthro-collect.last-check.v1'
const CHECK_PENDING = 'anthro-collect.check-pending.v1'

/** Everything waiting on this phone for one collector: settings, practice records, a phone check. */
function waitingCount(store: KeyValueStore | undefined): number {
  return (
    (loadPendingSettings(store) ? 1 : 0) +
    loadWaiting(store).length +
    (readJson<PhoneCheckResult | null>(store, CHECK_PENDING, null) ? 1 : 0)
  )
}

async function flushCheck(store: KeyValueStore | undefined): Promise<boolean> {
  const pending = readJson<PhoneCheckResult | null>(store, CHECK_PENDING, null)
  if (!pending) return true
  try {
    await saveDeviceCheck(db, pending)
    writeJson(store, CHECK_PENDING, null)
    return true
  } catch {
    return false
  }
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(() => loadCachedProfile(storage))
  const [view, setView] = useState<View>('main')
  const [online, setOnline] = useState(navigator.onLine)
  const [collectionOpen, setCollectionOpen] = useState(() => readJson<boolean>(storage, OPEN_KEY, false) === true)
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick((t) => t + 1), [])

  const mine = useMemo(() => (profile ? scopedStore(storage, profile.id) : undefined), [profile])

  /** Latest profile from the server, null when signed out, or 'keep' (offline / server trouble). */
  const loadProfile = useCallback(async (): Promise<{ profile: Profile | null; open: boolean | null } | 'keep'> => {
    if (!supabase) return 'keep'
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      // Only forget the collector when we know they are signed out (not merely offline).
      return navigator.onLine ? { profile: null, open: null } : 'keep'
    }
    try {
      const p = await fetchOwnProfile(supabase)
      if (p && p.status === 'approved') {
        // Send what waited on this phone first, then read the latest.
        const store = scopedStore(storage, p.id)
        await flushSettings(store, (s) => saveSettingsRemote(db, p.id, s))
        await flushPractice(store, practiceApi)
        await flushCheck(store)
        const open = await fetchCollectionOpen(db).catch(() => null)
        return { profile: withSettings(p, loadPendingSettings(store)), open }
      }
      return { profile: p, open: null }
    } catch {
      return 'keep'
    }
  }, [])

  const refresh = useCallback(() => {
    void loadProfile().then((r) => {
      if (r === 'keep') return
      setProfile(r.profile)
      saveCachedProfile(storage, r.profile)
      if (r.open !== null) {
        setCollectionOpen(r.open)
        writeJson(storage, OPEN_KEY, r.open)
      }
      bump()
    })
  }, [loadProfile, bump])

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
    // Anything still waiting stays on this phone under this collector's id, for their next sign-in.
    setProfile(null)
    saveCachedProfile(storage, null)
    setView('main')
    await supabase?.auth.signOut().catch(() => undefined)
  }, [])

  const onSaveSettings = useCallback(
    async (s: Settings) => {
      if (!profile) return 'waiting' as const
      const result = await saveSettings(mine, s, (x) => saveSettingsRemote(db, profile.id, x))
      const next = withSettings(profile, s)
      setProfile(next)
      saveCachedProfile(storage, next)
      bump()
      return result
    },
    [profile, mine, bump],
  )

  const practiceLoad = useCallback(async () => {
    const server = await listPractice(db).catch(() => [])
    return mergePractice(server, loadWaiting(mine))
  }, [mine])

  const lastCheck = useMemo(
    () => readJson<{ passed: boolean; checkedAt: string } | null>(mine, LAST_CHECK, null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read after every change (tick)
    [mine, tick],
  )
  const waiting = useMemo(
    () => waitingCount(mine),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read after every change (tick)
    [mine, tick],
  )

  if (!supabase) {
    return (
      <Page>
        <Title>Anthro Collect</Title>
        <p>The login service is not configured yet.</p>
        <InstallArea />
      </Page>
    )
  }

  const authClient = db as unknown as AuthClient
  const home = () => {
    setView('main')
    bump()
  }
  const settingsValue = profile ? { unit: profile.unit, language: profile.language } : { unit: 'cm' as const, language: 'en' as const }

  return (
    <AppView
      profile={profile}
      view={view}
      online={online}
      setView={setView}
      onAuthChanged={refresh}
      onSignOut={() => void signOut()}
      collectionOpen={collectionOpen}
      waiting={waiting}
      lastCheck={lastCheck}
      join={<Join client={authClient} onJoined={afterAuth} onBack={() => setView('main')} />}
      signIn={<SignIn client={authClient} onSignedIn={afterAuth} onBack={() => setView('main')} />}
      setup={<SettingsScreen first initial={settingsValue} onSave={onSaveSettings} onDone={home} />}
      settings={
        <SettingsScreen first={false} initial={settingsValue} onSave={onSaveSettings} onDone={home} onBack={home} />
      }
      check={
        <PhoneCheck
          run={() => runPhoneCheck(browserCheckEnv())}
          save={async (r) => {
            writeJson(mine, LAST_CHECK, { passed: r.passed, checkedAt: r.checkedAt })
            writeJson(mine, CHECK_PENDING, r)
            const sent = await flushCheck(mine)
            bump()
            return sent
          }}
          onBack={home}
        />
      }
      practiceNew={
        <PracticeNew
          create={async (age) => {
            const made = await addPractice(mine, practiceApi, age)
            bump()
            return made
          }}
          onList={() => setView('practice-list')}
          onBack={home}
        />
      }
      practiceList={
        <PracticeList
          load={practiceLoad}
          remove={async (row) => {
            await removePractice(mine, practiceApi, row)
            bump()
          }}
          onNew={() => setView('practice-new')}
          onBack={home}
        />
      }
      admin={
        profile ? (
          <Admin api={adminApi!} myId={profile.id} appUrl={window.location.origin} shareEnv={shareEnv} onBack={home} />
        ) : null
      }
      invite={
        <Invite api={inviteApi!} appUrl={window.location.origin} shareEnv={shareEnv} online={online} onBack={home} />
      }
      install={<InstallArea />}
    />
  )
}
